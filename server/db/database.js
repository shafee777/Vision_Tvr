const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config');

// Ensure database directory exists
const dbDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to Optii dedicated SQLite database
const db = new sqlite3.Database(config.DB_PATH, (err) => {
  if (err) {
    console.error(`[Optii DB] Failed to connect to ${config.DB_PATH}:`, err.message);
  } else {
    // Enforce PRAGMAs atomically
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
    `, (pErr) => {
      if (pErr) console.error('[Optii DB] Pragma init error:', pErr.message);
      else console.log(`[Optii DB] Connected successfully to ${config.DB_PATH} (foreign_keys = ON, WAL = ON, busy_timeout = 5000ms)`);
    });
  }
});

// Promisified database wrapper
const dbAsync = {
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  },

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },

  exec(sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  close() {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  /**
   * Execute an atomic transaction serialized across concurrent requests
   * @param {() => Promise<any>} fn
   */
  transaction(fn) {
    const execute = async () => {
      await dbAsync.run('BEGIN IMMEDIATE');
      try {
        const result = await fn();
        await dbAsync.run('COMMIT');
        return result;
      } catch (err) {
        try {
          await dbAsync.run('ROLLBACK');
        } catch (_) {}
        throw err;
      }
    };

    const nextInQueue = transactionQueue.then(execute, execute);
    transactionQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  },

  raw: db
};

let transactionQueue = Promise.resolve();

module.exports = dbAsync;
