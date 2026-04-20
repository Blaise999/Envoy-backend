// src/server.js
import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import { connectDB } from './config/db.js';

// ---- Resolve config with sensible defaults
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST?.trim() || '0.0.0.0';

// ---- One-time startup
async function bootstrap() {
  try {
    // 1) DB
    await connectDB();

    // 2) Create HTTP server from Express (gives more control than app.listen)
    const server = http.createServer(app);

    // Tune keep-alives so dev HMR/long-polling doesn’t randomly 408
    server.keepAliveTimeout = 65_000;   // ms
    server.headersTimeout   = 66_000;   // ms (must be > keepAliveTimeout)

    // 3) Wire low-level error handlers before listen
    server.on('error', onError(PORT));
    server.on('listening', () => {
      const localHint = HOST === '0.0.0.0' ? 'localhost' : HOST;
      console.log(`🚀 API running on  http://${localHint}:${PORT}`);
      if (HOST === '0.0.0.0') {
        console.log(`🌍 Bound to 0.0.0.0 (all interfaces). LAN access may be available.`);
      }
    });

    // 4) Start listening
    server.listen(PORT, HOST);

    // 5) Graceful shutdown
    const shutdown = async (signal) => {
      try {
        console.log(`\n${signal} received → closing server…`);
        await new Promise((resolve) => server.close(resolve));
        if (mongoose.connection.readyState === 1) {
          console.log('Closing MongoDB connection…');
          await mongoose.connection.close();
        }
        console.log('✅ Clean exit');
        process.exit(0);
      } catch (err) {
        console.error('❌ Error during shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (err) => {
      console.error('Unhandled Promise rejection:', err);
      shutdown('unhandledRejection');
    });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      shutdown('uncaughtException');
    });

    return server; // (useful for tests)
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

// Standard Node “port in use / perms” handler
function onError(port) {
  return (err) => {
    if (err.syscall !== 'listen') throw err;
    const bind = `port ${port}`;
    switch (err.code) {
      case 'EACCES':
        console.error(`${bind} requires elevated privileges`);
        process.exit(1);
      case 'EADDRINUSE':
        console.error(`${bind} is already in use`);
        process.exit(1);
      default:
        throw err;
    }
  };
}

bootstrap();
