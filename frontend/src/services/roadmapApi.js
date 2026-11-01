import { request } from './api';

// The student's saved roadmap (created or regenerated on demand) with their progress against it.
export const getCurrentRoadmap = () => request('/roadmaps/current');

// Progress summary without the heavy plan, for the progress page and the home card.
export const getDashboard = () => request('/dashboard');

// Ticks a topic done or not done and/or logs the time spent on it; answers with { progress, roadmapChanged }.
export const updateTopic = (topicId, change) => request(`/roadmaps/current/topics/${encodeURIComponent(topicId)}`, { method: 'PATCH', body: JSON.stringify(change) });

// Marks a skill as already known (or undoes it); the next roadmap fetch regenerates the plan.
export const setKnownSkill = (nodeId, known) => request('/me/known-skills', { method: 'PUT', body: JSON.stringify({ nodeId, known }) });

// The student has read the explanation of a replan.
export const markReplanSeen = (id) => request(`/replans/${encodeURIComponent(id)}/seen`, { method: 'PATCH', body: JSON.stringify({}) });

// Accepts the offer to plan for fewer hours a week (only ever lowers them).
export const acceptSuggestedHours = (hoursPerWeek) => request('/replans/accept-hours', { method: 'POST', body: JSON.stringify({ hoursPerWeek }) });

// Asks for the plan to be checked right now; answers { replanned, message, roadmap, progress, replan }.
export const replanNow = () => request('/roadmaps/replan', { method: 'POST', body: JSON.stringify({}) });
