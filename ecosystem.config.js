/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII PLATFORM — PM2 PROCESS MANAGER CONFIGURATION
 * ═════════════════════════════════════════════════════════════════════
 * Note: Single instance (`instances: 1`) is strongly recommended for SQLite
 * deployments to guarantee in-memory rate-limiting accuracy and avoid
 * cross-process file lock overhead.
 */

module.exports = {
  apps: [
    {
      name: 'optii-server',
      script: 'server/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 8000,
      env: {
        NODE_ENV: 'development',
        PORT: 5050
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5050
      }
    }
  ]
};
