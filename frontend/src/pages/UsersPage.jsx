import { useEffect, useState } from 'react';
import { RefreshCw, Save, Shield, UserRound } from 'lucide-react';
import { api } from '../api/client';
import { EmptyState, getError, PageHeading, Spinner } from '../components/ui';

const roles = ['Admin', 'Department Head', 'Faculty', 'Student'];
const departments = ['Unassigned', 'CSE', 'Cybersecurity', 'Mechanical', 'Management'];
export default function UsersPage({ user, notify }) {
  const [users, setUsers] = useState([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState('');
  const load = async () => { setLoading(true); try { const r = await api.get('/api/admin/users'); setUsers(r.data.data.users || []); } catch (e) { notify(getError(e, 'Could not load campus users.'), 'error'); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const update = async (person, patch) => { setSaving(person.id); try { const r = await api.patch(`/api/admin/users/${person.id}`, patch); setUsers((all) => all.map((u) => u.id === person.id ? r.data.data.user : u)); notify('User access profile updated.'); } catch (e) { notify(getError(e, 'Could not update this account.'), 'error'); } finally { setSaving(''); } };
  return <><PageHeading eyebrow="IDENTITY & POLICY" title="People & roles" description="Manage campus roles, departments, and account status used in authorization decisions." action={<button className="button button-secondary" onClick={load}><RefreshCw size={16} /> Refresh</button>} />
    <div className="callout"><Shield size={17} /><span><strong>Role and attribute controls</strong> A role or department change takes effect on subsequent protected requests.</span></div>
    <section className="panel table-panel"><div className="table-panel-heading"><div><h2>Campus accounts</h2><p>{users.length} accounts · role assignment is administrator controlled</p></div></div>{loading ? <Spinner label="Loading accounts…" /> : users.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Person</th><th>Role</th><th>Department</th><th>Status</th><th>Update</th></tr></thead><tbody>{users.map((person) => <UserRow key={person.id} person={person} self={person.id === user.id} saving={saving === person.id} update={update} />)}</tbody></table></div> : <EmptyState icon={UserRound} title="No campus accounts" message="Registered users will be listed here." />}</section>
  </>;
}
function UserRow({ person, self, saving, update }) {
  const [role, setRole] = useState(person.role); const [department, setDepartment] = useState(person.department);
  useEffect(() => { setRole(person.role); setDepartment(person.department); }, [person.role, person.department]);
  const changed = role !== person.role || department !== person.department;
  return <tr><td><div className="person-cell"><span className="avatar small">{person.name.slice(0, 1).toUpperCase()}</span><span><strong>{person.name}{self && ' (you)'}</strong><small>{person.email}</small></span></div></td><td><select className="table-select" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r}>{r}</option>)}</select></td><td><select className="table-select" value={department} onChange={(e) => setDepartment(e.target.value)}>{departments.map((d) => <option key={d}>{d}</option>)}</select></td><td><button className={`account-state ${person.isActive ? 'enabled' : 'disabled'}`} disabled={self} onClick={() => update(person, { isActive: !person.isActive })}><i />{person.isActive ? 'Active' : 'Inactive'}</button></td><td><button className="icon-button row-action" title="Save role and department" disabled={!changed || saving || (self && role !== 'Admin')} onClick={() => update(person, { role, department })}>{saving ? <span className="tiny-spinner" /> : <Save size={16} />}</button></td></tr>;
}
