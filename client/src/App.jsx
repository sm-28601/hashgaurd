import { useEffect, useState } from 'react';

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api' + path, { method, headers, body: form || (body && JSON.stringify(body)) });
  if (response.status === 401 && token) {
    localStorage.removeItem('token');
    window.location.reload();
  }
  const text = response.status === 204 ? '' : await response.text();
  let result = null;
  try { result = text ? JSON.parse(text) : null; } catch { result = null; }
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status})`);
  return result;
}

const formatDate = (value) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not verified';
const shortHash = (value = '') => value.length > 16 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;

function CopyHash({ value }) {
  const [copied, setCopied] = useState(false);
  return <button className="copy-button" onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
    {copied ? 'Copied' : 'Copy hash'}
  </button>;
}

function FileDrop({ file, onFile }) {
  return <label className="file-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFile(event.dataTransfer.files[0]); }}>
    <input type="file" onChange={(event) => onFile(event.target.files[0])} />
    <span className="drop-icon">⌁</span>
    <strong>{file ? file.name : 'Click to upload or drag and drop'}</strong>
    <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to process` : 'Supports PDF, DOCX, TXT, PNG, JPG (up to 25MB)'}</small>
  </label>;
}

function StatusPill({ children, tone = 'green' }) {
  return <span className={`status-pill ${tone}`}><i />{children}</span>;
}

function DatabaseStatus({ status }) {
  const labels = { checking: 'Checking MongoDB', connected: 'Connected to MongoDB', offline: 'MongoDB offline' };
  return <StatusPill tone={status === 'connected' ? 'green' : status === 'offline' ? 'red' : 'amber'}>{labels[status]}</StatusPill>;
}

function UploadCard({ onSaved }) {
  const [file, setFile] = useState();
  const [owner, setOwner] = useState('Legal Compliance Department');
  const [result, setResult] = useState();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file', file); form.append('owner', owner);
      const document = await api('/documents/register', { method: 'POST', form });
      setResult({ ...document, owner }); onSaved(document);
    } catch (caught) { setError(caught.message); }
    setBusy(false);
  };
  return <section className="panel upload-card">
    <div className="panel-heading"><h2><span className="heading-icon amber">⇧</span> Upload &amp; Hash Document</h2><span className="algorithm">SHA-256</span></div>
    <FileDrop file={file} onFile={setFile} />
    <label className="field-label">Owner name or department<input value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
    {error && <p className="error-message">{error}</p>}
    <button className="primary-button" disabled={!file || busy} onClick={save}>◉ {busy ? 'Generating hash...' : 'Generate SHA-256 & Save to MongoDB'}</button>
    {result && <div className="result-box"><div className="result-top"><span className="eyebrow">Cryptographic result</span><StatusPill>Saved to MongoDB</StatusPill></div>
      <div className="result-meta"><span>File name<strong>{result.fileName}</strong></span><span>Stamped at<strong>Just now</strong></span></div>
      <span className="eyebrow">SHA-256 checksum</span><div className="hash-line"><code>{result.hash}</code><CopyHash value={result.hash} /></div></div>}
  </section>;
}

function VerifyCard({ documents, onVerified }) {
  const [mode, setMode] = useState('file');
  const [documentId, setDocumentId] = useState('');
  const [file, setFile] = useState();
  const [hash, setHash] = useState('');
  const [result, setResult] = useState();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const verify = async () => {
    setBusy(true); setError(''); setResult();
    try {
      const request = mode === 'file' ? (() => { const form = new FormData(); form.append('file', file); return { form }; })() : { body: { hash } };
      const verification = await api(`/documents/${documentId}/verify`, { method: 'POST', ...request });
      setResult(verification); onVerified(verification);
    } catch (caught) { setError(caught.message); }
    setBusy(false);
  };
  const verified = result?.result === 'VERIFIED';
  return <section className="panel verify-card">
    <div className="panel-heading"><h2><span className="heading-icon green">◎</span> Verify Document Integrity</h2><div className="segmented"><button className={verified || !result ? 'active' : ''}>Valid</button><button className={result && !verified ? 'danger active' : ''}>Tampered</button></div></div>
    <select value={documentId} onChange={(event) => setDocumentId(event.target.value)} aria-label="Document to verify"><option value="">Select document to verify</option>{documents.map((document) => <option key={document._id} value={document._id}>{document.fileName}</option>)}</select>
    <div className="mode-tabs"><button className={mode === 'file' ? 'selected' : ''} onClick={() => setMode('file')}>⌁ Upload file</button><button className={mode === 'hash' ? 'selected' : ''} onClick={() => setMode('hash')}># Direct hash</button></div>
    {mode === 'file' ? <FileDrop file={file} onFile={setFile} /> : <input className="hash-input" placeholder="Paste a 64-character SHA-256 checksum" value={hash} onChange={(event) => setHash(event.target.value)} />}
    {error && <p className="error-message">{error}</p>}
    <button className="primary-button" disabled={!documentId || busy || (mode === 'file' ? !file : hash.length !== 64)} onClick={verify}>⌁ {busy ? 'Running integrity check...' : 'Run integrity check'}</button>
    {result && <div className={`verification-result ${verified ? 'verified' : 'modified'}`}><div className="verification-title"><span>{verified ? '✓' : '!'}</span><div><strong>{verified ? 'Document Authentic & Untampered' : 'Document Modified'}</strong><small>{verified ? '100% cryptographic parity with MongoDB record' : 'The current hash does not match the stored record'}</small></div></div><div className="verification-state"><span>{verified ? '✓' : '!'}</span><strong>{verified ? 'VALID RECORD' : 'TAMPERED RECORD'}</strong><StatusPill tone={verified ? 'green' : 'red'}>{verified ? 'Hashes match' : 'Hashes differ'}</StatusPill></div>
      <div className="hash-comparison"><span>Stored MongoDB hash<code>{result.originalHash}</code></span><span>Computed file hash<code>{result.currentHash}</code></span></div></div>}
  </section>;
}

function Ledger({ documents }) {
  const [query, setQuery] = useState('');
  const filtered = documents.filter((document) => `${document.fileName} ${document.hash}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="ledger-section" id="ledger"><div className="ledger-heading"><div><span className="eyebrow amber-text">◉ Atlas live state · read replica cluster</span><h2>MongoDB Cryptographic Ledger</h2><p>Immutable SHA-256 signatures, timestamps, and ownership records across MongoDB.</p></div><span className="cluster-label">▣ cluster-primary-08-east-1.mongodb.net</span></div>
    <div className="ledger-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="⌕  Search by document or hash..." /><button>All departments⌄</button><button>▣ Last 30 days⌄</button></div>
    <div className="ledger-table"><div className="table-row table-header"><span>Document name</span><span>Owner / team</span><span>SHA-256 checksum</span><span>Stamped at</span><span>Status</span><span>Actions</span></div>
      {filtered.map((document) => <div className="table-row" key={document._id}><span className="document-name">▧ <strong>{document.fileName}</strong><small>{(document.fileSize / 1024 / 1024).toFixed(1)} MB</small></span><span>{document.owner || 'Guest workspace'}<small>HashGuard workspace</small></span><span className="hash-cell"><code>{shortHash(document.hash)}</code><CopyHash value={document.hash} /></span><span>{formatDate(document.registeredAt)}</span><span><StatusPill>Stored in MongoDB</StatusPill></span><span className="actions">◉ ◇</span></div>)}
  {!filtered.length && <p className="empty-state">No cryptographic records match your search.</p>}
    </div><div className="ledger-footer">Showing {filtered.length} of {documents.length} cryptographic records <span>‹ Previous &nbsp; <b>1</b> &nbsp; Next ›</span></div>
  </section>;
}

function App() {
  const [view, setView] = useState(() => window.location.hash.slice(1) || 'upload');
  const [ready, setReady] = useState(Boolean(localStorage.getItem('token')));
  const [databaseStatus, setDatabaseStatus] = useState('checking');
  const [documents, setDocuments] = useState([]);
  const [loadError, setLoadError] = useState('');
  const refresh = () => api('/documents').then(setDocuments).catch((caught) => setLoadError(caught.message));
  const navigate = (nextView) => { setView(nextView); window.history.replaceState(null, '', `#${nextView}`); };
  useEffect(() => {
    api('/health').then(() => setDatabaseStatus('connected')).catch(() => setDatabaseStatus('offline'));
    if (ready) { refresh(); return; }
    api('/auth/guest', { method: 'POST' }).then((session) => { localStorage.setItem('token', session.token); setReady(true); }).catch((caught) => setLoadError(caught.message));
  }, [ready]);
  if (!ready) return <main className="loading-screen"><span className="brand-mark">◈</span><p>Connecting to MongoDB workspace...</p>{loadError && <p className="error-message">{loadError}</p>}</main>;
  const navItems = [['upload', 'Upload & Hash'], ['verify', 'Verify File'], ['ledger', 'MongoDB Ledger']];
  return <><header className="topbar"><button className="brand" onClick={() => navigate('upload')}><span className="brand-mark">◇</span><strong>DocVerify</strong></button><nav>{navItems.map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => navigate(key)}>{label}</button>)}</nav><div className="connection"><DatabaseStatus status={databaseStatus} /><span className="avatar">JD</span></div></header>
    <main className="page"><section className="hero"><span className="eyebrow amber-text">◉ Cryptographic engine v2.4</span><h1>{view === 'verify' ? 'Verify Document Authenticity' : view === 'ledger' ? 'MongoDB Cryptographic Ledger' : 'Document Integrity Verification'}</h1><p>{view === 'ledger' ? 'Immutable SHA-256 signatures, timestamps, and ownership records across MongoDB Atlas.' : 'Upload files to generate cryptographic SHA-256 signatures, record verified proofs in MongoDB, and detect tampering in seconds.'}</p></section>
      {view === 'upload' && <div className="single-view"><UploadCard onSaved={refresh} /></div>}
      {view === 'verify' && <div className="single-view"><VerifyCard documents={documents} onVerified={refresh} /></div>}
      {view === 'ledger' && <Ledger documents={documents} />}
      {loadError && <p className="error-message">{loadError}</p>}
    </main><footer>DocVerify · Secure Node.js SHA-256 Engine &amp; MongoDB Atlas Ledger <span>FPS 180 · Compliant Cryptography</span></footer></>;
}

export default App;
