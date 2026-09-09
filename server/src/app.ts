import express, { Application } from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.route';

const app: Application = express();

// Middlewares
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/health', healthRoutes);

export default app;
