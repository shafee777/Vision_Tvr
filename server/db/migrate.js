const fs = require('fs');
const path = require('path');
const db = require('./database');

async function execIdempotentSql(sql) {
  try {
    await db.exec(sql);
  } catch (err) {
    if (!err.message || !err.message.includes('duplicate column name')) {
      throw err;
    }
    // Execute statement-by-statement so already-added columns in repeated runs are safely skipped
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map(s => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      try {
        await db.exec(`${stmt};`);
      } catch (stmtErr) {
        if (stmtErr.message && stmtErr.message.includes('duplicate column name')) {
          continue;
        }
        throw stmtErr;
      }
    }
  }
}

async function runMigrations() {
  console.log('[Optii Migrations] Starting database migration process...');
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.error(`[Optii Migrations] Directory not found: ${migrationsDir}`);
    return;
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  console.log(`[Optii Migrations] Found ${migrationFiles.length} migration file(s).`);

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    console.log(`[Optii Migrations] Executing migration: ${file}...`);

    if (file === '006_payment_state_integrity.sql') {
      const ordersExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'");
      const webhooksExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_webhooks'");
      if (ordersExists) {
        const orderCols = (await db.all('PRAGMA table_info(orders)')).map(c => c.name);
        if (webhooksExists && orderCols.includes('is_simulated_payment')) {
          console.log('[Optii Migrations] ✓ Migration 006 already applied (skipping table rebuild)');
          continue;
        }
        // Clean up any leftover temp table from a previously interrupted 006 run
        await db.exec('DROP TABLE IF EXISTS orders_v2;');
        if (!orderCols.includes('delivery_method')) {
          await db.run("ALTER TABLE orders ADD COLUMN delivery_method TEXT DEFAULT 'express'");
        }
        if (!orderCols.includes('promo_code')) {
          await db.run('ALTER TABLE orders ADD COLUMN promo_code TEXT');
        }
        if (!orderCols.includes('estimated_delivery')) {
          await db.run('ALTER TABLE orders ADD COLUMN estimated_delivery TEXT');
        }
      }
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    await execIdempotentSql(sql);
    console.log(`[Optii Migrations] ✓ Successfully applied ${file}`);
  }

  console.log('[Optii Migrations] All migrations completed successfully.\n');
}

if (require.main === module) {
  runMigrations().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('[Optii Migrations] Error executing migrations:', err);
    process.exit(1);
  });
}

module.exports = runMigrations;
