import { request } from './api';

// The student's saved roadmap (created or regenerated on demand) with their progress against it.
export const getCurrentRoadmap = () => request('/roadmaps/current');

// Progress summary without the heavy plan, for the progress page and the home card.
export const getDashboard = () => request('/dashboard');

// Ticks a topic done or not done and/or logs the time spent on it; answers with the fresh progress.
export const updateTopic = (topicId, change) => request(`/roadmaps/current/topics/${encodeURIComponent(topicId)}`, { method: 'PATCH', body: JSON.stringify(change) }).then((data) => data.progress);

// Marks a skill as already known (or undoes it); the next roadmap fetch regenerates the plan.
export const setKnownSkill = (nodeId, known) => request('/me/known-skills', { method: 'PUT', body: JSON.stringify({ nodeId, known }) });
