import { Router } from 'express';
import { graphOverview, previewRoadmap } from '../controllers/roadmapController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
const router = Router();
router.get('/graph', graphOverview); router.post('/roadmaps/preview', requireAuth, previewRoadmap);
export default router;
