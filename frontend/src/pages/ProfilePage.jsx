import { useState } from 'react';
import { AtSign, KeyRound, Save, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../api/client';
import { getError, PageHeading } from '../components/ui';
import PasswordInput from '../components/PasswordInput';

export default function ProfilePage({ user, updateUser, notify, onLogout }) {
  const [name, setName] = useState(user.name); const [email, setEmail] = useState(user.email); const [currentPassword, setCurrentPassword] = useState('');
  const [profileBusy, setProfileBusy] = useState(false); const [profileMessage, setProfileMessage] = useState('');
  const [oldPassword, setOldPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false); const [passwordMessage, setPasswordMessage] = useState('');
  const profileChanged = name.trim() !== user.name || email.trim().toLowerCase() !== user.email;

  const saveProfile = async (event) => {
    event.preventDefault(); setProfileBusy(true); setProfileMessage('');
    try {
      const body = { currentPassword };
      if (name.trim() !== user.name) body.name = name.trim();
      if (email.trim().toLowerCase() !== user.email) body.email = email.trim().toLowerCase();
      const response = await api.patch('/api/auth/profile', body);
      updateUser(response.data.data.user); setName(response.data.data.user.name); setEmail(response.data.data.user.email); setCurrentPassword('');
      setProfileMessage('Profile updated. The change was recorded in the audit trail.');
    } catch (error) { setProfileMessage(getError(error, 'Could not update the profile.')); }
    finally { setProfileBusy(false); }
  };

  const changePassword = async (event) => {
    event.preventDefault(); setPasswordMessage('');
    if (newPassword !== confirmPassword) return setPasswordMessage('The new passwords do not match.');
    setPasswordBusy(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: oldPassword, newPassword });
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordMessage('Password changed and existing sessions invalidated. Signing out…');
      window.setTimeout(() => { onLogout().catch(() => {}); }, 1800);
    } catch (error) { setPasswordMessage(getError(error, 'Could not change the password.')); }
    finally { setPasswordBusy(false); }
  };

  return <><PageHeading eyebrow="ACCOUNT SETTINGS" title="My account" description="Update your personal details and password. Account changes are recorded in the audit trail." />
    <div className="profile-layout">
      <section className="panel profile-card"><div className="profile-section-heading"><span className="profile-section-icon"><UserRound size={18} /></span><div><h2>Personal details</h2><p>Verify your current password to save profile changes.</p></div></div>
        <form className="form-stack profile-form" onSubmit={saveProfile}>
          <label className="form-label">Full name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} minLength="2" maxLength="80" required /></label>
          <label className="form-label">Email address<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength="254" required /><small>Email changes take effect immediately; verification email is not configured yet.</small></label>
          <div className="profile-readonly"><span>Role<strong>{user.role}</strong></span><span>Department<strong>{user.department}</strong></span><span>Account status<strong className={user.isActive ? 'profile-active' : 'profile-inactive'}>{user.isActive ? 'Active' : 'Inactive'}</strong></span></div>
          <label className="form-label">Current password<PasswordInput autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          {profileMessage && <div className={profileMessage.startsWith('Profile updated') ? 'profile-feedback success' : 'profile-feedback error'} role="status">{profileMessage}</div>}
          <button className="button button-primary profile-submit" disabled={profileBusy || !profileChanged || !currentPassword}><Save size={15} />{profileBusy ? 'Saving…' : 'Save profile'}</button>
        </form>
      </section>
      <section className="panel profile-card"><div className="profile-section-heading"><span className="profile-section-icon key"><KeyRound size={18} /></span><div><h2>Change password</h2><p>Use at least 12 characters. You’ll need to sign in again.</p></div></div>
        <form className="form-stack profile-form" onSubmit={changePassword}>
          <label className="form-label">Current password<PasswordInput autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} /></label>
          <label className="form-label">New password<PasswordInput autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength="12" maxLength="72" /></label>
          <label className="form-label">Confirm new password<PasswordInput autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength="12" maxLength="72" /></label>
          {passwordMessage && <div className={`profile-feedback ${passwordMessage.startsWith('Password changed') ? 'success' : 'error'}`} role="status">{passwordMessage}</div>}
          <button className="button button-primary profile-submit" disabled={passwordBusy}><ShieldCheck size={15} />{passwordBusy ? 'Updating…' : 'Update password'}</button>
        </form>
      </section>
    </div>
    <div className="callout profile-note"><AtSign size={17} /><span><strong>Role and department</strong> These are administrator-managed so users cannot promote themselves or change their access attributes.</span></div>
  </>;
}
