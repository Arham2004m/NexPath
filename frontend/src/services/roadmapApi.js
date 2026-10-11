import { request } from './api';

export const previewRoadmap = () => request('/roadmaps/preview', { method: 'POST' }).then((data) => data.roadmap);
