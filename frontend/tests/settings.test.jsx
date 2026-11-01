import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../src/pages/SettingsPage';
import ForgotPasswordPage from '../src/pages/ForgotPasswordPage';
import { changePassword, updateName } from '../src/services/authApi';
import { clearHistory } from '../src/services/chatApi';
import { deferred, renderPage, student } from './helpers';

vi.mock('../src/services/authApi', () => ({ updateName: vi.fn(), changePassword: vi.fn() }));
vi.mock('../src/services/chatApi', () => ({ clearHistory: vi.fn() }));

const fail = (message, errors) => Object.assign(new Error(message), { errors });
const show = (auth = {}) => renderPage(<SettingsPage />, { path: '/settings', routes: [{ path: '/login', text: 'Login screen' }], auth });
const fill = async (label, value) => userEvent.type(screen.getByLabelText(label), value);

beforeEach(() => vi.clearAllMocks());

describe('settings page', () => {
  it('shows the account email and the current name', () => {
    show();
    expect(screen.getByText(student.email)).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('Test Student');
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled(); // nothing changed yet
  });

  it('saves a new name and refreshes the signed-in user', async () => {
    updateName.mockResolvedValue({});
    const refreshUser = vi.fn().mockResolvedValue();
    show({ refreshUser });
    const input = screen.getByLabelText('Display name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Priya Nair');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(updateName).toHaveBeenCalledWith('Priya Nair');
    expect(await screen.findByText('Name saved.')).toBeInTheDocument();
    expect(refreshUser).toHaveBeenCalled();
  });

  it('shows the server error for a bad name', async () => {
    updateName.mockRejectedValue(fail('Please correct the highlighted fields', { name: 'Enter your name (at least 2 characters)' }));
    show();
    const input = screen.getByLabelText('Display name');
    await userEvent.clear(input);
    await userEvent.type(input, 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Enter your name (at least 2 characters)')).toBeInTheDocument();
    expect(screen.queryByText('Name saved.')).not.toBeInTheDocument();
  });

  it('changes the password and clears the fields', async () => {
    const pending = deferred();
    changePassword.mockReturnValue(pending.promise);
    show();
    await fill('Current password', 'Passw0rdX');
    await fill('New password', 'Brand9Newer');
    await fill('Confirm new password', 'Brand9Newer');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'Passw0rdX', newPassword: 'Brand9Newer', confirmPassword: 'Brand9Newer' });
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    pending.resolve({});
    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('shows which password field is wrong and keeps what was typed', async () => {
    changePassword.mockRejectedValue(fail('Please correct the highlighted fields', { currentPassword: 'That is not your current password' }));
    show();
    await fill('Current password', 'Wrong1234');
    await fill('New password', 'Brand9Newer');
    await fill('Confirm new password', 'Brand9Newer');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('That is not your current password')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue('Brand9Newer');
    expect(screen.queryByText('Password changed.')).not.toBeInTheDocument();
  });

  it('shows a general error when the server cannot be reached', async () => {
    changePassword.mockRejectedValue(fail('Could not reach the server. Check your connection and try again.'));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('deletes the mentor conversation only after confirming', async () => {
    clearHistory.mockResolvedValue({ deleted: 4 });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my mentor conversation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(clearHistory).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my mentor conversation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Your mentor conversation was deleted.')).toBeInTheDocument();
    expect(clearHistory).toHaveBeenCalledTimes(1);
  });

  it('says so when the mentor conversation cannot be deleted', async () => {
    clearHistory.mockRejectedValue(new Error('Wait for the current reply to finish first.'));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Delete my mentor conversation' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Wait for the current reply to finish first.')).toBeInTheDocument();
  });

  it('signs out and goes to the login page, even if the server call fails', async () => {
    const logout = vi.fn().mockRejectedValue(new Error('offline'));
    show({ logout });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByText('Login screen')).toBeInTheDocument());
    expect(logout).toHaveBeenCalled();
  });
});

describe('forgot password page', () => {
  it('explains what to do instead of promising an email', () => {
    renderPage(<ForgotPasswordPage />, { path: '/forgot-password' });
    expect(screen.getByRole('heading')).toHaveTextContent(/not available yet/i);
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });
});
