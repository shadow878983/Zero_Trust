import { useEffect, useState } from 'react';
import { Activity, Bell, CircleAlert, Files, KeyRound, LayoutDashboard, LogOut, Menu, ScrollText, ShieldCheck, Users, X } from 'lucide-react';
import { api } from './api/client';
import { useAuth } from './context/AuthContext';
import AuthScreen from './components/AuthScreen';
import DocumentsPage from './pages/DocumentsPage';
import UsersPage from './pages/UsersPage';
import AccessPage from './pages/AccessPage';
import AuditPage from './pages/AuditPage';
import { EmptyState, PageHeading, Spinner } from './components/ui';

const baseNav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'documents', label: 'Documents', icon: Files },
];
const adminNav = [
  { id: 'access', label: 'Access grants', icon: KeyRound },
  { id: 'users', label: 'People & roles', icon: Users },
  { id: 'audit', label: 'Audit trail', icon: ScrollText },
];

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'TV';
}

function OverviewPage({ user, onNavigate }) {
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [denials, setDenials] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const jobs = [api.get('/api/documents')];
    if (user.role === 'Admin') jobs.push(api.get('/api/admin/users'), api.get('/api/admin/audit-logs?result=deny&limit=50'));
    Promise.allSettled(jobs).then((results) => {
      if (!mounted) return;
      if (results[0]?.status === 'fulfilled') setDocuments(results[0].value.data.data.documents || []);
      if (results[1]?.status === 'fulfilled') setUsers(results[1].value.data.data.users || []);
      if (results[2]?.status === 'fulfilled') setDenials(results[2].value.data.data.pagination?.total || 0);
    }).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [user.role]);

  const restricted = documents.filter((doc) => ['Confidential', 'Restricted'].includes(doc.classification)).length;
  const cards = [
    { label: 'Accessible documents', value: documents.length, detail: 'Current policy checked', icon: Files, tone: 'blue' },
    { label: 'Confidential access', value: restricted, detail: 'Confidential or restricted', icon: KeyRound, tone: 'violet' },
    ...(user.role === 'Admin' ? [
      { label: 'Active accounts', value: users.filter((item) => item.isActive).length, detail: `${users.length} campus accounts`, icon: Users, tone: 'green' },
      { label: 'Denied requests', value: denials, detail: 'Recorded in the audit trail', icon: Activity, tone: 'amber' },
    ] : []),
  ];

  return <>
    <PageHeading eyebrow="SECURITY OVERVIEW" title={`Good to see you, ${user.name.split(' ')[0]}.`} description="Your workspace reflects current roles, attributes, and access grants." action={<span className="online-pill"><i /> Policy engine online</span>} />
    <section className={`stats-grid ${user.role === 'Admin' ? 'four' : ''}`}>{cards.map((card) => <article className="stat-card" key={card.label}><div className={`stat-icon ${card.tone}`}><card.icon size={19} /></div><div><span>{card.label}</span><strong>{loading ? '—' : card.value}</strong><small>{card.detail}</small></div></article>)}</section>
    <section className="overview-grid">
      <div className="panel overview-docs"><div className="panel-heading"><div><h2>Recently accessible</h2><p>Documents available under your current policy</p></div><button className="text-button" onClick={() => onNavigate('documents')}>Browse documents →</button></div>
        {loading ? <Spinner label="Checking access" /> : documents.length ? <div className="mini-doc-list">{documents.slice(0, 5).map((doc) => <div className="mini-doc-row" key={doc.id}><span className="mini-file-icon"><Files size={17} /></span><div className="mini-doc-copy"><strong>{doc.title}</strong><span>{doc.department} · {doc.classification}</span></div><span className={`class-dot ${doc.classification.toLowerCase()}`} /> </div>)}</div> : <EmptyState title="No documents yet" message="Documents appear here after the policy engine permits access." />}
      </div>
      <div className="panel posture-panel"><div className="panel-heading"><div><h2>Policy posture</h2><p>Controls active for this session</p></div><span className="posture-shield"><ShieldCheck size={19} /></span></div><div className="posture-lead"><div className="posture-mark">ZT</div><div><strong>Continuous verification</strong><span>Protected requests are checked against current database state.</span></div></div><div className="posture-list"><div><i /> Account status checked <b>On</b></div><div><i /> Grant expiry evaluated <b>On</b></div><div><i /> Revocation checked live <b>On</b></div></div><div className="posture-note"><Activity size={15} /> Decisions are recorded in the audit trail.</div></div>
    </section>
  </>;
}

export default function App() {
  const { user, loading, login, register, logout } = useAuth();
  const [active, setActive] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const isAdmin = user?.role === 'Admin';
  const nav = isAdmin ? [...baseNav, ...adminNav] : baseNav;

  const notify = (message, tone = 'success') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (user && !isAdmin && ['access', 'users', 'audit'].includes(active)) setActive('overview');
  }, [user, isAdmin, active]);

  if (loading) return <div className="boot-screen"><span className="brand-icon"><ShieldCheck size={23} /></span><Spinner label="Verifying session…" /></div>;
  if (!user) return <AuthScreen onLogin={login} onRegister={register} />;

  const current = nav.find((item) => item.id === active) || nav[0];
  const signOut = async () => {
    try { await logout(); } catch { notify('Signed out locally; the server did not confirm token revocation.', 'warning'); }
  };

  return <div className="app-shell">
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand-lockup"><span className="brand-icon"><ShieldCheck size={21} /></span><span className="brand-copy"><strong>TrustVault</strong><small>CAMPUS EXCHANGE</small></span><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close"><X size={18} /></button></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="main-nav">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${active === id ? 'active' : ''}`} onClick={() => { setActive(id); setMenuOpen(false); }}><Icon size={18} /><span>{label}</span>{id === 'audit' && <i className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-grow" />
      <div className="security-mini"><span className="security-mini-icon"><ShieldCheck size={16} /></span><span><strong>Zero-trust active</strong><small>Every request is checked</small></span><i /></div>
      <div className="sidebar-profile"><span className="avatar small">{initials(user.name)}</span><span className="profile-copy"><strong>{user.name}</strong><small>{user.role} · {user.department}</small></span><button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={17} /></button></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-open" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="crumb"><span>Workspace</span><b>/</b><strong>{current.label}</strong></div></div><div className="topbar-right"><span className="connection-pill"><i /> API protected</span><button className="icon-button notify-bell" title="Notifications"><Bell size={18} /></button><span className="top-divider" /><span className="avatar">{initials(user.name)}</span><span className="top-profile"><strong>{user.name}</strong><small>{user.role}</small></span></div></header>
      <main className="main-content">
        {active === 'overview' && <OverviewPage user={user} onNavigate={setActive} />}
        {active === 'documents' && <DocumentsPage user={user} notify={notify} />}
        {active === 'access' && isAdmin && <AccessPage notify={notify} />}
        {active === 'users' && isAdmin && <UsersPage user={user} notify={notify} />}
        {active === 'audit' && isAdmin && <AuditPage notify={notify} />}
      </main>
      <footer className="app-footer"><span>TrustVault · NexHack 2.0</span><span>Policy evaluated on each protected request</span><span><i /> Secure session</span></footer>
    </div>
    {toast && <div className={`toast ${toast.tone}`} role="status"><span>{toast.tone === 'success' ? <ShieldCheck size={16} /> : <CircleAlert size={16} />}</span>{toast.message}<button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>}
  </div>;
}
