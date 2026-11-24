import { useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { getError } from './ui';

export default function UploadDialog({ onClose, onUploaded, notify }) {
  const [form, setForm] = useState({ title: '', description: '', department: 'CSE', classification: 'Internal' });
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false);
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault(); if (!file) return notify('Choose a PDF or TXT file first.', 'error');
    const body = new FormData(); body.append('file', file); Object.entries(form).forEach(([key, value]) => body.append(key, value));
    setBusy(true);
    try { await api.post('/api/documents', body); onUploaded(); }
    catch (error) { notify(getError(error, 'Document upload failed.'), 'error'); }
    finally { setBusy(false); }
  };
  return <Modal title="Upload a document" onClose={onClose}><form className="form-stack" onSubmit={submit}>
    <label className="form-label">Document file <input className="file-input" type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] || null)} required /><small>PDF or TXT, up to 10 MB</small></label>
    <label className="form-label">Title<input value={form.title} name="title" onChange={change} required maxLength="120" /></label>
    <label className="form-label">Description<textarea value={form.description} name="description" onChange={change} rows="2" maxLength="500" /></label>
    <div className="form-row"><label className="form-label">Department<select name="department" value={form.department} onChange={change}><option>CSE</option><option>Cybersecurity</option><option>Mechanical</option><option>Management</option></select></label><label className="form-label">Classification<select name="classification" value={form.classification} onChange={change}><option>Public</option><option>Internal</option><option>Confidential</option><option>Restricted</option></select></label></div>
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload securely'}</button></div>
  </form></Modal>;
}
