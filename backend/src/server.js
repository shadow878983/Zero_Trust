const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { connectDatabase } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const documentRoutes = require('./routes/documentRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(200).json({
    success: true,
    status: databaseConnected ? 'ready' : 'degraded',
    message: 'TrustVault API is running',
    database: databaseConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => ipKeyGenerator(req.ip, 56),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Try again later.' },
});
app.locals.authRateLimit = authRateLimit;

app.use('/api/auth', authRateLimit, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/documents', permissionRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

async function startServer() {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`TrustVault API listening on port ${port}`);
  });
}

startServer();
