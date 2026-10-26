const crypto = require('crypto');
const fs = require('fs');
// Streams the file so large documents never load fully into memory.
exports.hashFile = (p) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(p).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});
