import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Sidebar from '../components/home/Sidebar';
import Topbar from '../components/home/Topbar';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import useAuth from '../hooks/useAuth';
import { changePassword, updateName } from '../services/authApi';
import { clearHistory } from '../services/chatApi';

const EMPTY_PASSWORD = { currentPassword: '', newPassword: '', confirmPassword: '' };
const heading = 'font-mono text-[11px] font-medium uppercase tracking-[.13em] text-mid';

export default function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);

  const [name, setName] = useState(user?.name || '');
  const [nameState, setNameState] = useState({ busy: false, errors: {}, done: false });
  const [password, setPassword] = useState(EMPTY_PASSWORD);
  const [passwordState, setPasswordState] = useState({ busy: false, errors: {}, done: false });
  const [chat, setChat] = useState({ confirm: false, busy: false, message: null });

  const saveName = async (event) => {
    event.preventDefault();
    setNameState({ busy: true, errors: {}, done: false });
    try {
      await updateName(name);
      await refreshUser();
      setNameState({ busy: false, errors: {}, done: true });
    } catch (error) { setNameState({ busy: false, errors: error.errors || { name: error.message }, done: false }); }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setPasswordState({ busy: true, errors: {}, done: false });
    try {
      await changePassword(password);
      setPassword(EMPTY_PASSWORD);
      setPasswordState({ busy: false, errors: {}, done: true });
    } catch (error) { setPasswordState({ busy: false, errors: error.errors || { form: error.message }, done: false }); }
  };

  const wipeChat = async () => {
    setChat({ confirm: false, busy: true, message: null });
    try { await clearHistory(); setChat({ confirm: false, busy: false, message: 'Your mentor conversation was deleted.' }); } catch (error) { setChat({ confirm: false, busy: false, message: error.message }); }
  };

  // The session is cleared locally even when the sign-out request fails, so the student always ends up at the login page.
  const leave = async () => { try { await logout(); } catch { /* signed out on this device regardless */ } navigate('/login'); };
  const setField = (field) => (event) => setPassword({ ...password, [field]: event.target.value });

  return (
    <div className="app-shell min-h-screen lg:flex">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      {menu && <button onClick={() => setMenu(false)} className="fixed inset-0 z-20 bg-ink/45 lg:hidden" aria-label="Close navigation" />}
      <div className="workspace-shell min-w-0 flex-1">
        <Topbar onMenu={() => setMenu(true)} />
        <main className="mx-auto max-w-3xl p-6 sm:p-9 lg:p-12">
          <div className="dashboard-arrival">
            <header>
              <p className={heading}>Settings</p>
              <h1 className="mt-4 text-4xl font-extrabold leading-[.94] tracking-[-.065em] text-ink sm:text-5xl">Your account.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted">Signed in as <span className="font-bold text-ink">{user?.email}</span>. To change your goal, weekly hours or assessment, use <Link to="/goal" className="font-bold text-mid underline-offset-4 hover:underline">Goal</Link> or <Link to="/assessment" className="font-bold text-mid underline-offset-4 hover:underline">Assessment</Link>.</p>
            </header>

            <section className="surface-card mt-9 px-6 py-6 sm:px-8" aria-labelledby="name-heading">
              <h2 id="name-heading" className={heading}>Name</h2>
              <form onSubmit={saveName} className="mt-4 max-w-md space-y-4">
                <Input label="Display name" name="name" autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); setNameState({ busy: false, errors: {}, done: false }); }} error={nameState.errors.name} />
                <div className="flex items-center gap-4">
                  <Button type="submit" loading={nameState.busy} disabled={name.trim() === (user?.name || '')}>Save name</Button>
                  {nameState.done && <p role="status" className="text-sm font-bold text-ink">Name saved.</p>}
                </div>
              </form>
            </section>

            <section className="surface-card mt-6 px-6 py-6 sm:px-8" aria-labelledby="password-heading">
              <h2 id="password-heading" className={heading}>Password</h2>
              <form onSubmit={savePassword} className="mt-4 max-w-md space-y-4">
                <Input label="Current password" name="currentPassword" type="password" autoComplete="current-password" value={password.currentPassword} onChange={setField('currentPassword')} error={passwordState.errors.currentPassword} />
                <Input label="New password" name="newPassword" type="password" autoComplete="new-password" placeholder="8+ characters, upper and lower case, a number" value={password.newPassword} onChange={setField('newPassword')} error={passwordState.errors.newPassword} />
                <Input label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" value={password.confirmPassword} onChange={setField('confirmPassword')} error={passwordState.errors.confirmPassword} />
                {passwordState.errors.form && <p role="alert" className="border-l-2 border-error bg-warm p-3 text-sm text-ink">{passwordState.errors.form}</p>}
                <div className="flex items-center gap-4">
                  <Button type="submit" loading={passwordState.busy}>Change password</Button>
                  {passwordState.done && <p role="status" className="text-sm font-bold text-ink">Password changed.</p>}
                </div>
              </form>
            </section>

            <section className="surface-card mt-6 px-6 py-6 sm:px-8" aria-labelledby="mentor-heading">
              <h2 id="mentor-heading" className={heading}>AI mentor</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted">Your conversations with the mentor are stored so it can follow what you discussed. You can delete them at any time.</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {!chat.confirm && <button type="button" onClick={() => setChat({ confirm: true, busy: false, message: null })} disabled={chat.busy} className="control-transition min-h-10 border border-pale bg-white px-4 text-sm font-extrabold text-ink hover:border-mid disabled:opacity-60">Delete my mentor conversation</button>}
                {chat.confirm && (
                  <span className="flex items-center gap-3 text-sm">
                    <span className="font-bold text-ink">Delete everything you discussed with the mentor?</span>
                    <button type="button" onClick={wipeChat} className="font-extrabold text-ink underline underline-offset-4">Yes, delete</button>
                    <button type="button" onClick={() => setChat({ confirm: false, busy: false, message: null })} className="font-bold text-muted underline underline-offset-4">Cancel</button>
                  </span>
                )}
                {chat.message && <p role="status" className="text-sm font-bold text-ink">{chat.message}</p>}
              </div>
            </section>

            <section className="surface-card mt-6 px-6 py-6 sm:px-8" aria-labelledby="session-heading">
              <h2 id="session-heading" className={heading}>Session</h2>
              <button type="button" onClick={leave} className="control-transition mt-4 min-h-10 border border-pale bg-white px-4 text-sm font-extrabold text-ink hover:border-mid">Sign out</button>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
