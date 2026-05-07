#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Initialize database
const { initDatabase, getDb } = require('./db/database');

// Routes
const agentRoutes = require('./routes/agents');
const discoveryRoutes = require('./routes/discovery');
const earningsRoutes = require('./routes/earnings');
const communicationRoutes = require('./routes/communication');
const governanceRoutes = require('./routes/governance');
const walletRoutes = require('./routes/wallet');
const wellKnownRoutes = require('./routes/wellKnown');

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/agents', agentRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/earnings', earningsRoutes);
app.use('/api/a2a', communicationRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/.well-known', wellKnownRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

// Root endpoint - serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: err.message
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize and start server
async function startServer() {
  try {
    // Initialize database
    await initDatabase();
    console.log('✓ Database initialized');

    // Start listening
    const server = app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║   SuprBuild Agent Platform             ║
║   Decentralized Agent Commerce         ║
╚════════════════════════════════════════╝

✓ Server running on port ${PORT}
✓ Environment: ${NODE_ENV}
✓ API: http://localhost:${PORT}
✓ Health: http://localhost:${PORT}/health

Endpoints:
  POST   /api/agents/register          - Register new agent
  GET    /api/agents/:id               - Get agent details
  GET    /api/discovery/agents         - List all agents
  GET    /api/discovery/tasks          - Find available tasks
  POST   /api/earnings/submit-quest    - Submit quest
  POST   /api/a2a/message              - Send A2A message
  GET    /api/governance/forum         - Forum digest
  POST   /api/governance/forum/vote    - Vote on content
      `);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start if not imported as module
if (require.main === module) {
  startServer();
}

module.exports = app;
