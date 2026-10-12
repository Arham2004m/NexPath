import { request } from './api';

export const previewRoadmap = () => request('/roadmaps/preview', { method: 'POST' }).then((data) => data.roadmap);

// Marks a skill as already known (or undoes it); the roadmap is regenerated from the saved list.
export const setKnownSkill = (nodeId, known) => request('/me/known-skills', { method: 'PUT', body: JSON.stringify({ nodeId, known }) });
