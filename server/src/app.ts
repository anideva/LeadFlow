import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import healthRoutes from './routes/health.route';
import authRoutes from './routes/auth.route';
import leadRoutes from './routes/lead.route';
import emailRoutes from './routes/email.route';

const app: Application = express();

// Global Middlewares
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/email', emailRoutes);

export default app;
