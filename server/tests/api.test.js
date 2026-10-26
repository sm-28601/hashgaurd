const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs'), os = require('os'), path = require('path');
const { hashFile } = require('../src/hash');
const app = require('../src/app');
let mongod, token;
const tmp = (name, txt) => { const p = path.join(os.tmpdir(), name); fs.writeFileSync(p, txt); return p; };
const H = (t = token) => ({ Authorization: `Bearer ${t}` });
const T = { contentType: 'text/plain' };
beforeAll(async () => {
  mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri());
  token = (await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@x.com', password: 'password123' })).body.token;
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

test('hashing: deterministic, sensitive to change, known vector', async () => {
  const a = tmp('a.txt', 'hello'), b = tmp('b.txt', 'hello'), c = tmp('c.txt', 'hellO');
  expect(await hashFile(a)).toBe(await hashFile(b));
  expect(await hashFile(a)).not.toBe(await hashFile(c));
  expect(await hashFile(a)).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});
test('register, verify OK, verify modified, history filter', async () => {
  const reg = await request(app).post('/api/documents/register').set(H()).attach('file', tmp('o.txt', 'original'), T);
  expect(reg.status).toBe(201);
  const id = reg.body._id;
  const ok = await request(app).post(`/api/documents/${id}/verify`).set(H()).attach('file', tmp('o2.txt', 'original'), T);
  expect(ok.body.result).toBe('VERIFIED');
  const mod = await request(app).post(`/api/documents/${id}/verify`).set(H()).attach('file', tmp('m.txt', 'modified'), T);
  expect(mod.body.result).toBe('MODIFIED');
  expect(mod.body.originalHash).not.toBe(mod.body.currentHash);
  expect((await request(app).get('/api/verifications?result=MODIFIED').set(H())).body).toHaveLength(1);
});
test('auth: 401 without token, other users cannot read my document', async () => {
  expect((await request(app).get('/api/documents')).status).toBe(401);
  const other = await request(app).post('/api/auth/register').send({ name: 'B', email: 'b@x.com', password: 'password123' });
  const mine = await request(app).get('/api/documents').set(H());
  expect((await request(app).get(`/api/documents/${mine.body[0]._id}`).set(H(other.body.token))).status).toBe(404);
  expect((await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'wrong-pass' })).status).toBe(401);
});
test('invalid upload type rejected', async () => {
  const r = await request(app).post('/api/documents/register').set(H()).attach('file', tmp('x.exe', 'MZ'), { contentType: 'application/x-msdownload' });
  expect(r.status).toBe(400);
});
