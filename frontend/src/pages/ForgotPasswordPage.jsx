import { Link } from 'react-router-dom';

// Resetting by email needs an email service that is not set up yet, so this says what to do instead.
export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-cream p-6 text-center">
      <div className="max-w-md">
        <p className="font-mono text-xs font-semibold text-deep">NEXPATH / ACCOUNT</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.04em] text-ink">Password reset by email is not available yet.</h1>
        <p className="mt-3 leading-7 text-muted">If you are signed in on another device, open Settings and use Change password. Otherwise, ask the person running this NexPath site to reset your account.</p>
        <Link className="control-transition mt-7 inline-block bg-deep px-5 py-3 font-bold text-cream hover:bg-ink" to="/login">Back to sign in</Link>
      </div>
    </main>
  );
}
