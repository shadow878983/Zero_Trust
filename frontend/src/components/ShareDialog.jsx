import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from './Modal';
import { getError } from './ui';

export default function ShareDialog({ document, onClose, notify }) {
  const [users, setUsers] = useState([]); const [userId, setUserId] = useState('');
  const [permissionType, setPermissionType] = useState('Download'); const [expiresAt, setExpiresAt] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/api/admin/users').then((r) => setUsers((r.data.data.users || []).filter((u) => u.isActive))).catch((e) => notify(getError(e, 'Could not load campus users.'), 'error')); }, []);
  const submit = async (event) => { event.preventDefault(); setBusy(true); try {
    await api.post(`/api/documents/${document.id}/share`, { userId, permissionType, expiresAt: new Date(expiresAt).toISOString() });
    notify('Access grant created.'); onClose();
  } catch (e) { notify(getError(e, 'Could not create access grant.'), 'error'); } finally { setBusy(false); } };
  const min = new Date(Date.now() + 60000).toISOString().slice(0, 16);
  return <Modal title="Grant document access" onClose={onClose}><p className="modal-intro">Grant access to <strong>{document.title}</strong>. Current policy will still be checked for every request.</p><form className="form-stack" onSubmit={submit}>
    <label className="form-label">Campus user<select required value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Choose a user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email} ({u.role})</option>)}</select></label>
    <label className="form-label">Permission<select value={permissionType} onChange={(e) => setPermissionType(e.target.value)}><option>Read</option><option>Download</option><option>Manage</option></select></label>
    <label className="form-label">Expires at<input type="datetime-local" min={min} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required /></label>
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || !userId}>{busy ? 'Saving…' : 'Grant access'}</button></div>
  </form></Modal>;
}
