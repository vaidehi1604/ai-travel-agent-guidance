if (!globalThis.crypto) {
  const { webcrypto } = require('node:crypto');
  globalThis.crypto = webcrypto;
}
// Increase default max listeners globally to prevent MaxListenersExceededWarning from LangGraph's sequential nodes
const { setMaxListeners } = require('node:events');
setMaxListeners(50);

require('dotenv').config();

// Modules
const express = require('express');
const bodyParser = require('body-parser');
const corsLib = require('cors');
const helmet = require('helmet');

// Routes
const authRoutes = require('./api/routes/authRoutes');
const travelRoutes = require('./api/routes/travelRoutes');
const { cors } = require('./config/security');

// DB
const { sequelize, connectDB } = require('./config/db');


const initialize = async () => {
  try {
    // ✅ Connect DB FIRST
    await connectDB();

    const app = express();

    // Middleware
    app.use(corsLib(cors));
    app.use(helmet());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // Routes
    app.use('/auth', authRoutes);
    app.use('/travel', travelRoutes);

    // Start server AFTER DB
    const port = process.env.PORT || 5000;

    const server = app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });

    return server;
  } catch (err) {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  }
};

// Handle process events to debug exits
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('exit', (code) => {
  console.log(`ℹ️ Process exiting with code: ${code}`);
});

// Start the application
initialize().then(() => {
  console.log('✅ Initialization complete');
}).catch(err => {
  console.error('❌ Final catch block:', err);
  process.exit(1);
});