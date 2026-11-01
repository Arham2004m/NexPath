import { request, setAccessToken } from './api';

// Changes only the display name; answers with the updated profile.
export const updateName = (name) => request('/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) });

// Needs the current password. Other devices are signed out, so the server hands this device a fresh session, which we adopt.
export async function changePassword(values) {
  const result = await request('/auth/change-password', { method: 'POST', body: JSON.stringify(values) });
  if (result.accessToken) setAccessToken(result.accessToken);
  return result;
}

// Asks for a reset link by email. The answer is the same whether or not the address has an account.
export const forgotPassword = (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });

// Sets a new password using the token from the emailed link.
export const resetPassword = (values) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(values) });
