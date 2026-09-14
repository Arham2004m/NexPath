const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration({ name, email, password, confirmPassword }) {
  const errors = {};
  if (!name?.trim() || name.trim().length < 2) errors.name = 'Enter your name (at least 2 characters)';
  if (!emailPattern.test(email || '')) errors.email = 'Enter a valid email address';
  if (!password || password.length < 8) errors.password = 'Use at least 8 characters';
  else if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) errors.password = 'Use uppercase, lowercase, and a number';
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export function validateLogin({ email, password }) {
  const errors = {};
  if (!emailPattern.test(email || '')) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Password is required';
  return errors;
}
