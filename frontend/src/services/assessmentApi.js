// Assessment endpoints on the main API. Sampling and scoring stay server-side,
// so correct answers never reach the browser; the user is identified by the access token.
import { request } from './api';

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

export const getDomains = () => request('/assessment/domains').then((data) => data.domains);
export const sampleQuestions = (domainKey) => post('/assessment/questions', { domains: [domainKey] }).then((data) => data.questions[domainKey] || []);
export const submitAssessment = (payload) => post('/assessment/submit', payload).then((data) => data.attempt);
export const getLatestAttempt = () => request('/assessment/latest').then((data) => data.attempt);
