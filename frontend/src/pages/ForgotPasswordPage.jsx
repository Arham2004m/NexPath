import { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import { forgotPassword } from '../services/authApi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, errors: {}, sent: null });

  const submit = async (event) => {
    event.preventDefault();
    setState({ busy: true, errors: {}, sent: null });
    try {
      const result = await forgotPassword(email.trim());
      setState({ busy: false, errors: {}, sent: result.message });
    } catch (error) { setState({ busy: false, errors: error.errors || { form: error.message }, sent: null }); }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-cream p-6">
      <div className="w-full max-w-md">
        <p className="font-mono text-xs font-semibold text-deep">NEXPATH / ACCOUNT</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.04em] text-ink">Forgot your password?</h1>
        <p className="mt-3 leading-7 text-muted">Enter the email you signed up with and we will send you a link to choose a new one.</p>

        {state.sent ? (
          <div className="mt-7 border-l-2 border-mid bg-warm p-4" role="status">
            <p className="font-bold text-ink">Check your email.</p>
            <p className="mt-1 text-sm leading-6 text-muted">{state.sent} If nothing arrives in a few minutes, look in spam or try again.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-7 space-y-5">
            <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} error={state.errors.email} />
            {state.errors.form && <p role="alert" className="border-l-2 border-error bg-warm p-3 text-sm text-ink">{state.errors.form}</p>}
            <Button type="submit" loading={state.busy} className="w-full">Send reset link</Button>
          </form>
        )}
        <p className="mt-6 text-sm"><Link to="/login" className="font-bold text-mid hover:underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}
