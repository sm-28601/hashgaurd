const express = require('express');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const mongoose = require('mongoose');
const { User, Document, Verification } = require('./models');
const { hashFile } = require('./hash');

const ALLOWED = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg', 'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const upload = multer({
  dest: os.tmpdir(), limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_r, f, cb) => ALLOWED.includes(f.mimetype) ? cb(null, true) : cb(Object.assign(new Error('File type not allowed'), { status: 400 })),
});
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const secret = () => process.env.JWT_SECRET || 'test-secret';
const sign = (u) => jwt.sign({ id: u._id }, secret(), { expiresIn: '2h' });
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const isId = (s) => /^[a-f\d]{24}$/i.test(s || '');

function auth(req, _res, next) {
  try {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    req.userId = jwt.verify(t, secret()).id; next();
  } catch { next(bad('Unauthorized', 401)); }
}
// Hash the uploaded temp file, then always delete it.
async function hashUpload(file) {
  if (!file) throw bad('No file uploaded');
  try { return await hashFile(file.path); } finally { fs.unlink(file.path, () => {}); }
}

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10kb' }));
app.get('/api/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'offline', database: connected ? 'connected' : 'disconnected' });
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 1000 : 20 });
app.post('/api/auth/guest', authLimiter, wrap(async (_req, res) => {
  let u = await User.findOne({ email: 'guest@hashguard.local' });
  if (!u) u = await User.create({ name: 'Guest workspace', email: 'guest@hashguard.local', passwordHash: await bcrypt.hash(crypto.randomUUID(), 12) });
  res.json({ token: sign(u), user: { id: u._id, name: u.name, email: u.email } });
}));
app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8) throw bad('Name, valid email and 8+ char password required');
  if (await User.findOne({ email: String(email).toLowerCase() })) throw bad('Email already registered', 409);
  const u = await User.create({ name, email, passwordHash: await bcrypt.hash(String(password), 12) });
  res.status(201).json({ token: sign(u), user: { id: u._id, name, email: u.email } });
}));
app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const u = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.passwordHash))) throw bad('Invalid credentials', 401);
  res.json({ token: sign(u), user: { id: u._id, name: u.name, email: u.email } });
}));
app.get('/api/auth/me', auth, wrap(async (req, res) => {
  const u = await User.findById(req.userId).select('name email');
  if (!u) throw bad('Unauthorized', 401);
  res.json(u);
}));

app.post('/api/documents/register', auth, upload.single('file'), wrap(async (req, res) => {
  const hash = await hashUpload(req.file);
  res.status(201).json(await Document.create({ userId: req.userId, owner: String(req.body.owner || 'Guest workspace').trim(), fileName: req.file.originalname, fileSize: req.file.size, mimeType: req.file.mimetype, hash }));
}));
app.get('/api/documents/stats', auth, wrap(async (req, res) => {
  const docs = await Document.find({ userId: req.userId });
  const sum = (k) => docs.reduce((a, d) => a + d[k], 0);
  const recent = await Verification.find({ userId: req.userId }).sort({ verifiedAt: -1 }).limit(5);
  res.json({ totalDocuments: docs.length, successful: sum('successfulVerifications'), failed: sum('failedVerifications'), recent });
}));
app.get('/api/documents', auth, wrap(async (req, res) => res.json(await Document.find({ userId: req.userId }).sort({ registeredAt: -1 }))));
const own = async (req) => {
  if (!isId(req.params.id)) throw bad('Invalid id');
  const d = await Document.findOne({ _id: req.params.id, userId: req.userId });
  if (!d) throw bad('Document not found', 404);
  return d;
};
app.get('/api/documents/:id', auth, wrap(async (req, res) => res.json(await own(req))));
app.delete('/api/documents/:id', auth, wrap(async (req, res) => { await (await own(req)).deleteOne(); res.status(204).end(); }));
app.post('/api/documents/:id/verify', auth, upload.single('file'), wrap(async (req, res) => {
  let d;
  try { d = await own(req); } catch (e) { if (req.file) fs.unlink(req.file.path, () => {}); throw e; }
  const currentHash = req.file ? await hashUpload(req.file) : String(req.body.hash || '').trim().toLowerCase();
  if (!/^[a-f\d]{64}$/i.test(currentHash)) throw bad('Upload a file or enter a valid SHA-256 hash');
  const ok = currentHash === d.hash; // deterministic comparison, no ML
  d.verificationCount++; ok ? d.successfulVerifications++ : d.failedVerifications++; d.lastVerifiedAt = new Date();
  await d.save();
  res.json(await Verification.create({ documentId: d._id, userId: req.userId, documentName: d.fileName, originalHash: d.hash, currentHash, result: ok ? 'VERIFIED' : 'MODIFIED', ip: req.ip }));
}));

app.get('/api/verifications', auth, wrap(async (req, res) => {
  const { result, documentId, from, to } = req.query, q = { userId: req.userId };
  if (['VERIFIED', 'MODIFIED'].includes(result)) q.result = result;
  if (isId(documentId)) q.documentId = documentId;
  if (from || to) q.verifiedAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to + 'T23:59:59Z') }) };
  res.json(await Verification.find(q).sort({ verifiedAt: -1 }).limit(200));
}));
app.get('/api/verifications/:id', auth, wrap(async (req, res) => {
  if (!isId(req.params.id)) throw bad('Invalid id');
  const v = await Verification.findOne({ _id: req.params.id, userId: req.userId });
  if (!v) throw bad('Verification not found', 404);
  res.json(v);
}));

app.use((err, _req, res, _next) => {
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500;
  if (status === 500) console.error(err.message); // never log document contents
  res.status(status).json({ error: status === 500 ? 'Server error' : err.message });
});
module.exports = app;
