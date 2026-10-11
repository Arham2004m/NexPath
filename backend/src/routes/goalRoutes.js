import { Router } from 'express';
import { listGoals, recommend, saveGoal } from '../controllers/goalController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
const router = Router();
router.get('/goals', listGoals); router.get('/goals/recommendations', requireAuth, recommend); router.put('/me/goal', requireAuth, saveGoal);
export default router;
