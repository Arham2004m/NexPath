import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes.js';
import goalRoutes from './routes/goalRoutes.js';
import roadmapRoutes from './routes/roadmapRoutes.js';
import assessmentRoutes from './routes/assessmentRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { clientDate } from './middleware/clientDate.js';

const app = express();
app.disable('x-powered-by');
// Behind a hosting proxy (Render, Railway) set TRUST_PROXY=1 so rate limits see the visitor's address, not the proxy's.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

const limiter = (windowMs, limit, message) => (process.env.NODE_ENV === 'test'
  ? (req, res, next) => next()
  : rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { message } }));

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(limiter(60_000, 600, 'Too many requests. Please slow down for a minute.'));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(clientDate);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Sign-in and sign-up are slowed down per address to stop password guessing.
const authLimit = limiter(15 * 60_000, 30, 'Too many sign-in attempts. Try again in a few minutes.');
app.use('/api/auth/login', authLimit);
app.use('/api/auth/register', authLimit);

app.use('/api/auth', authRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api', goalRoutes);
app.use('/api', roadmapRoutes);
app.use(notFound);
app.use(errorHandler);
export default app;
