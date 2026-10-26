const { Schema, model, Types } = require('mongoose');
const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true }));
const Document = model('Document', new Schema({
  userId: { type: Types.ObjectId, ref: 'User', index: true, required: true },
  owner: { type: String, trim: true, default: 'Guest workspace' },
  fileName: String, fileSize: Number, mimeType: String,
  hash: { type: String, required: true }, algorithm: { type: String, default: 'SHA-256' },
  registeredAt: { type: Date, default: Date.now }, lastVerifiedAt: Date,
  verificationCount: { type: Number, default: 0 },
  successfulVerifications: { type: Number, default: 0 },
  failedVerifications: { type: Number, default: 0 },
}));
const Verification = model('Verification', new Schema({
  documentId: { type: Types.ObjectId, ref: 'Document', index: true },
  userId: { type: Types.ObjectId, ref: 'User', index: true },
  documentName: String, originalHash: String, currentHash: String,
  result: { type: String, enum: ['VERIFIED', 'MODIFIED'] },
  ip: String, verifiedAt: { type: Date, default: Date.now },
}));
module.exports = { User, Document, Verification };
