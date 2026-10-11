import { request } from './api';

export const getGoals = () => request('/goals');
export const getRecommendations = () => request('/goals/recommendations').then((data) => data.recommendations);
export const saveGoal = (selection) => request('/me/goal', { method: 'PUT', body: JSON.stringify(selection) });
