# HashGuard — Secure Document Hash Verification System

Checks whether a file's bytes still match the SHA-256 fingerprint registered earlier. The comparison is a plain string equality check; no AI/ML is involved.
SHA-256 shows the bytes are unchanged. It does **not** prove legal authenticity or who authored the file.

## Stack
React + Vite + Tailwind (client) · Express + Mongoose + Multer (server) · Node `crypto` SHA-256 (streamed) · JWT + bcrypt · Helmet, CORS, rate limiting.

## Run locally
```bash
# Terminal 1 (needs MongoDB running locally or an Atlas URI)
cd server && cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npm install && npm run dev
# Terminal 2
cd client && npm install && npm run dev   # http://localhost:5173
# Tests (in-memory MongoDB, no setup)
cd server && npm test
```

## Environment (server/.env)
`PORT`, `MONGO_URI`, `JWT_SECRET` (required), `CLIENT_ORIGIN`.

## API
All routes except auth need `Authorization: Bearer <token>`.
`POST /api/auth/register|login` · `GET /api/auth/me` · `POST /api/documents/register` (multipart `file`) · `GET /api/documents` · `GET /api/documents/stats` · `GET|DELETE /api/documents/:id` · `POST /api/documents/:id/verify` (multipart `file`) · `GET /api/verifications?result=VERIFIED|MODIFIED&documentId=&from=&to=` · `GET /api/verifications/:id`

## Database
`User(name,email,passwordHash)` · `Document(userId,fileName,fileSize,mimeType,hash,algorithm,registeredAt,lastVerifiedAt,verificationCount,successfulVerifications,failedVerifications)` · `Verification(documentId,userId,documentName,originalHash,currentHash,result,ip,verifiedAt)`. File contents are never stored.

## Security
Uploads go to the OS temp dir, are hashed by streaming, then deleted (even on error). 25 MB limit, MIME allowlist, 20 auth requests per 15 min, bcrypt cost 12, owner-scoped queries (other users get 404), IP stored in history (get consent/disclose where required).

## Demo
Register account → register `original.pdf` (hash shown) → verify the same file → green "VERIFIED" → edit the PDF → verify again → red "MODIFIED" with both hashes → open History to see both attempts.

## Limitations
No digital signatures yet (see below), the hash is computed server-side on upload, the MIME check relies on the client-declared type, and a hash alone cannot show who registered a file or when it was really created.
