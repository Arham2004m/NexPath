import { GOAL_BY_ID, HOURS_PER_WEEK, MAX_TARGET_WEEKS } from '../data/goals.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isText = (value) => typeof value === 'string';

// bcrypt only uses the first 72 bytes of a password, so longer ones are refused instead of silently shortened.
export const PASSWORD_LIMITS = { min: 8, max: 72 };

export function validateRegistration({ name, email, password, confirmPassword } = {}) {
  const errors = {};
  if (!isText(name) || name.trim().length < 2) errors.name = 'Enter your name (at least 2 characters)';
  else if (name.trim().length > 80) errors.name = 'Use 80 characters or fewer';
  if (!isText(email) || !emailPattern.test(email) || email.length > 254) errors.email = 'Enter a valid email address';
  if (!isText(password) || password.length < PASSWORD_LIMITS.min) errors.password = `Use at least ${PASSWORD_LIMITS.min} characters`;
  else if (password.length > PASSWORD_LIMITS.max) errors.password = `Use ${PASSWORD_LIMITS.max} characters or fewer`;
  else if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) errors.password = 'Use uppercase, lowercase, and a number';
  if (!isText(confirmPassword) || password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

const passwordError = (password) => {
  if (typeof password !== 'string' || password.length < PASSWORD_LIMITS.min) return `Use at least ${PASSWORD_LIMITS.min} characters`;
  if (password.length > PASSWORD_LIMITS.max) return `Use ${PASSWORD_LIMITS.max} characters or fewer`;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return 'Use uppercase, lowercase, and a number';
  return null;
};

export function validateNameChange({ name } = {}) {
  const errors = {};
  if (!isText(name) || name.trim().length < 2) errors.name = 'Enter your name (at least 2 characters)';
  else if (name.trim().length > 80) errors.name = 'Use 80 characters or fewer';
  return errors;
}

export function validatePasswordChange({ currentPassword, newPassword, confirmPassword } = {}) {
  const errors = {};
  if (!isText(currentPassword) || !currentPassword) errors.currentPassword = 'Enter your current password';
  else if (currentPassword.length > PASSWORD_LIMITS.max) errors.currentPassword = 'That password is too long';
  const problem = passwordError(newPassword);
  if (problem) errors.newPassword = problem;
  else if (newPassword === currentPassword) errors.newPassword = 'Choose a password different from the current one';
  if (!isText(confirmPassword) || newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
  return errors;
}

export function validateLogin({ email, password } = {}) {
  const errors = {};
  if (!isText(email) || !emailPattern.test(email) || email.length > 254) errors.email = 'Enter a valid email address';
  if (!isText(password) || !password) errors.password = 'Password is required';
  else if (password.length > PASSWORD_LIMITS.max) errors.password = 'That password is too long';
  return errors;
}

export function validateGoalSelection({ goalId, subTrack, hoursPerWeek, targetWeeks }) {
  const errors = {};
  const goal = GOAL_BY_ID[goalId];
  if (!goal) errors.goalId = 'Choose one of the available goals';
  else if (goal.subTracks) {
    if (!subTrack) errors.subTrack = 'Choose a sub-track for this goal';
    else if (!goal.subTracks.some((s) => s.id === subTrack)) errors.subTrack = 'That sub-track does not belong to this goal';
  } else if (subTrack) errors.subTrack = 'This goal has no sub-tracks';
  if (!Number.isInteger(hoursPerWeek) || hoursPerWeek < HOURS_PER_WEEK.min || hoursPerWeek > HOURS_PER_WEEK.max) errors.hoursPerWeek = `Enter whole hours between ${HOURS_PER_WEEK.min} and ${HOURS_PER_WEEK.max}`;
  if (targetWeeks !== undefined && targetWeeks !== null && (!Number.isInteger(targetWeeks) || targetWeeks < 1 || targetWeeks > MAX_TARGET_WEEKS)) errors.targetWeeks = `Enter whole weeks between 1 and ${MAX_TARGET_WEEKS}, or leave it empty`;
  return errors;
}
