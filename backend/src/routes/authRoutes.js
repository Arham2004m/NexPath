import { Router } from 'express';
import { forgotPassword, resetPassword } from '../controllers/passwordResetController.js';
import { changePassword, login, logout, me, refresh, register, updateName } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
const router = Router();
router.post('/register', register); router.post('/login', login); router.post('/forgot-password', forgotPassword); router.post('/reset-password', resetPassword); router.post('/refresh', refresh); router.post('/logout', logout); router.get('/me', requireAuth, me); router.patch('/me', requireAuth, updateName); router.post('/change-password', requireAuth, changePassword);
export default router;
