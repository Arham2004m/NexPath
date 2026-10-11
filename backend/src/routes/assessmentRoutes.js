import { Router } from 'express';
import { latestAttempt, listDomains, sampleQuestions, submitAttempt } from '../controllers/assessmentController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
const router = Router();
router.use(requireAuth);
router.get('/domains', listDomains); router.post('/questions', sampleQuestions); router.post('/submit', submitAttempt); router.get('/latest', latestAttempt);
export default router;
