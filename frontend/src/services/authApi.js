import { request } from './api';

// Changes only the display name; answers with the updated profile.
export const updateName = (name) => request('/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) });

// Needs the current password; answers with a confirmation message.
export const changePassword = (values) => request('/auth/change-password', { method: 'POST', body: JSON.stringify(values) });
