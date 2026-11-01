import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from '../src/pages/ForgotPasswordPage';
import ResetPasswordPage from '../src/pages/ResetPasswordPage';
import { forgotPassword, resetPassword } from '../src/services/authApi';
import { deferred } from './helpers';

vi.mock('../src/services/authApi', () => ({ forgotPassword: vi.fn(), resetPassword: vi.fn() }));

const fail = (message, errors) => Object.assign(new Error(message), { errors });
const at = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login" element={<p>Login screen</p>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => vi.clearAllMocks());

describe('forgot password page', () => {
  it('asks for the email and tells the student to check their inbox', async () => {
    const pending = deferred();
    forgotPassword.mockReturnValue(pending.promise);
    at('/forgot-password');
    await userEvent.type(screen.getByLabelText('Email address'), '  asha@example.com ');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(forgotPassword).toHaveBeenCalledWith('asha@example.com');
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled();
    pending.resolve({ message: 'If an account exists for that email, a reset link has been sent. It works for one hour.' });
    expect(await screen.findByText('Check your email.')).toBeInTheDocument();
    expect(screen.getByText(/It works for one hour/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it('shows the server message for an invalid email and a general error when offline', async () => {
    forgotPassword.mockRejectedValueOnce(fail('Please correct the highlighted fields', { email: 'Enter a valid email address' }));
    at('/forgot-password');
    await userEvent.type(screen.getByLabelText('Email address'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    forgotPassword.mockRejectedValueOnce(fail('Could not reach the server. Check your connection and try again.'));
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('links back to sign in', () => {
    at('/forgot-password');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });
});

describe('reset password page', () => {
  const fillAndSubmit = async (password = 'Brand9Newer', confirm = password) => {
    await userEvent.type(screen.getByLabelText('New password'), password);
    await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
  };

  it('sends the token from the link with the new password, then offers sign in', async () => {
    resetPassword.mockResolvedValue({ message: 'ok' });
    at('/reset-password?token=abc123_-XYZ');
    await fillAndSubmit();
    expect(resetPassword).toHaveBeenCalledWith({ token: 'abc123_-XYZ', newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' });
    expect(await screen.findByText(/Your password has been reset/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('shows which field is wrong and keeps the form usable', async () => {
    resetPassword.mockRejectedValue(fail('Please correct the highlighted fields', { confirmPassword: 'Passwords do not match' }));
    at('/reset-password?token=abc');
    await fillAndSubmit('Brand9Newer', 'Different9X');
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset password' })).toBeEnabled();
  });

  it('explains an expired link and offers a new one', async () => {
    resetPassword.mockRejectedValue(fail('This reset link is invalid or has expired. Ask for a new one.'));
    at('/reset-password?token=old');
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('without a token in the link it explains instead of showing a form', () => {
    at('/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent(/part of the link is missing/);
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
