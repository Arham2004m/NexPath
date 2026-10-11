import { GOAL_BY_ID, HOURS_PER_WEEK, MAX_TARGET_WEEKS } from '../data/goals.js';

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
