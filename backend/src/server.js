const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { connectDatabase } = require('./config/database');
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

async function startServer() {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`TrustVault API listening on port ${port}`);
  });
}

startServer();
