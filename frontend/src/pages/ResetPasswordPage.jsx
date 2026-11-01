import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import { resetPassword } from '../services/authApi';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [state, setState] = useState({ busy: false, errors: {}, done: false });

  const submit = async (event) => {
    event.preventDefault();
    setState({ busy: true, errors: {}, done: false });
    try {
      await resetPassword({ token, ...form });
      setForm({ newPassword: '', confirmPassword: '' });
      setState({ busy: false, errors: {}, done: true });
    } catch (error) { setState({ busy: false, errors: error.errors || { form: error.message }, done: false }); }
  };
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <main className="grid min-h-screen place-items-center bg-cream p-6">
      <div className="w-full max-w-md">
        <p className="font-mono text-xs font-semibold text-deep">NEXPATH / ACCOUNT</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.04em] text-ink">Choose a new password.</h1>

        {!token && (
          <div className="mt-6" role="alert">
            <p className="leading-7 text-muted">This page needs the link from your reset email. It looks like part of the link is missing.</p>
            <Link to="/forgot-password" className="mt-4 inline-block font-bold text-mid hover:underline">Ask for a new link</Link>
          </div>
        )}

        {token && state.done && (
          <div className="mt-6" role="status">
            <p className="border-l-2 border-mid bg-warm p-4 font-bold text-ink">Your password has been reset. Every device was signed out.</p>
            <Link to="/login" className="control-transition mt-6 inline-block bg-deep px-5 py-3 font-bold text-cream hover:bg-ink">Sign in</Link>
          </div>
        )}

        {token && !state.done && (
          <form onSubmit={submit} className="mt-7 space-y-5">
            <Input label="New password" name="newPassword" type="password" autoComplete="new-password" placeholder="8+ characters, upper and lower case, a number" value={form.newPassword} onChange={set('newPassword')} error={state.errors.newPassword} />
            <Input label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} error={state.errors.confirmPassword} />
            {state.errors.form && (
              <p role="alert" className="border-l-2 border-error bg-warm p-3 text-sm text-ink">
                {state.errors.form} <Link to="/forgot-password" className="font-bold text-mid hover:underline">Ask for a new link</Link>
              </p>
            )}
            <Button type="submit" loading={state.busy} className="w-full">Reset password</Button>
          </form>
        )}
        <p className="mt-6 text-sm"><Link to="/login" className="font-bold text-mid hover:underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}
