import { Router } from 'express';
import { clearHistory, history, sendMessage } from '../controllers/chatController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
const router = Router();
router.post('/messages', requireAuth, sendMessage);
router.get('/history', requireAuth, history);
router.delete('/history', requireAuth, clearHistory);
export default router;
