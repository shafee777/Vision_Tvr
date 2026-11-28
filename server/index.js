const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const db = require('./db/database');
const securityHeaders = require('./middleware/securityHeaders');

const app = express();

// Security Headers (CSP, X-Frame-Options, HSTS, Sniffing Protection)
app.use(securityHeaders);

// CORS Policy Configuration
if (config.CORS_ORIGINS && config.CORS_ORIGINS.length > 0) {
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
} else {
  app.use(cors());
}

// Request Body Size Restrictions (Protection against large-payload memory exhaustion)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Static Assets with Caching Headers
app.use(express.static(config.PUBLIC_DIR, {
  maxAge: config.IS_PRODUCTION ? '7d' : 0,
  etag: true,
  lastModified: true
}));

// Serve admin portal directly at /admin
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'admin.html'));
});

// Serve product detail page directly at /product/:slug and /product
app.get(['/product/:slug', '/product'], (req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'product.html'));
});

// Serve public order tracking page directly at /track and /track/:orderNumber
app.get(['/track/:orderNumber', '/track'], (req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'track.html'));
});

// Optii REST API Router
const apiRouter = express.Router();

apiRouter.use('/auth', require('./routes/auth.routes'));
apiRouter.use('/shapes', require('./routes/shapes.routes'));
apiRouter.use('/brands', require('./routes/brands.routes'));
apiRouter.use('/categories', require('./routes/categories.routes'));
apiRouter.use('/products', require('./routes/products.routes'));
apiRouter.use('/lenses', require('./routes/lenses.routes'));
apiRouter.use('/prescriptions', require('./routes/prescriptions.routes'));
apiRouter.use('/stores', require('./routes/stores.routes'));
apiRouter.use('/settings', require('./routes/settings.routes'));
apiRouter.use('/appointments', require('./routes/appointments.routes'));
apiRouter.use('/enquiries', require('./routes/enquiries.routes'));
apiRouter.use('/orders', require('./routes/orders.routes'));
apiRouter.use('/payments', require('./routes/payments.routes'));
apiRouter.use('/admin', require('./routes/admin.routes'));

// Health check endpoint
apiRouter.get('/health', async (req, res) => {
  try {
    const tableCount = await db.get("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    res.json({
      status: 'ok',
      platform: 'Optii Optical Platform',
      version: '1.0.0',
      database: 'data/optii.db',
      tables_active: tableCount ? tableCount.count : 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.use('/api', apiRouter);

// Global Error Handler (Production-safe error sanitization)
app.use((err, req, res, next) => {
  console.error('[Optii Server Error]:', err);
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Uploaded file exceeds the 5 MB size limit.'
      : (err.message || 'File upload rejected.');
    return res.status(400).json({ success: false, message: msg });
  }
  const status = err.status || 500;
  const isProd = config.IS_PRODUCTION;
  res.status(status).json({
    success: false,
    message: isProd && status === 500 ? 'An unexpected internal server error occurred. Please try again later.' : (err.message || 'Internal Server Error')
  });
});

// Start Server helper
function startServer(port = config.PORT) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 Optii Platform Server Running on port ${port}`);
      console.log(`🌐 Customer Storefront: http://localhost:${port}/`);
      console.log(`👑 Admin Management:    http://localhost:${port}/admin`);
      console.log(`🔬 Health Endpoint:     http://localhost:${port}/api/health`);
      console.log(`======================================================\n`);

      // Graceful shutdown handlers
      const handleShutdown = (signal) => {
        console.log(`\n[Optii Server] Received ${signal}. Initiating graceful shutdown...`);
        server.close(async () => {
          console.log('[Optii Server] Closed HTTP server connections.');
          try {
            await db.close();
            console.log('[Optii Server] Closed database connection.');
          } catch (err) {
            console.error('[Optii Server] Error closing database connection:', err.message);
          }
          process.exit(0);
        });

        // Force shutdown after 10 seconds if connections fail to close
        setTimeout(() => {
          console.error('[Optii Server] Could not close connections in time, forcefully shutting down.');
          process.exit(1);
        }, 10000).unref();
      };

      process.on('SIGTERM', () => handleShutdown('SIGTERM'));
      process.on('SIGINT', () => handleShutdown('SIGINT'));

      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
