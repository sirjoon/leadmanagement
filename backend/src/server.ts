import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import { authRoutes } from './routes/auth.js';
import { leadRoutes } from './routes/leads.js';
import { noteRoutes } from './routes/notes.js';
import { userRoutes } from './routes/users.js';
import { clinicRoutes } from './routes/clinics.js';
import { analyticsRoutes } from './routes/analytics.js';
import { appointmentRoutes } from './routes/appointments.js';
import { errorHandler } from './middleware/errorHandler.js';
import { tenantMiddleware } from './middleware/tenant.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://dentacrm.in' 
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check endpoints (no auth required)
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (_, res) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

// API routes - Auth (no tenant middleware for login)
app.use('/api/v1/auth', authRoutes);

// Tenant-aware routes
app.use('/api/v1/leads', tenantMiddleware, leadRoutes);
app.use('/api/v1/notes', tenantMiddleware, noteRoutes);
app.use('/api/v1/users', tenantMiddleware, userRoutes);
app.use('/api/v1/clinics', tenantMiddleware, clinicRoutes);
app.use('/api/v1/analytics', tenantMiddleware, analyticsRoutes);
app.use('/api/v1/appointments', tenantMiddleware, appointmentRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((_, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🦷 DentraCRM API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
