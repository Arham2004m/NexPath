import { Router } from 'express';
import { graphOverview, previewRoadmap, setKnownSkill } from '../controllers/roadmapController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
const router = Router();
router.get('/graph', graphOverview); router.post('/roadmaps/preview', requireAuth, previewRoadmap); router.put('/me/known-skills', requireAuth, setKnownSkill);
export default router;
