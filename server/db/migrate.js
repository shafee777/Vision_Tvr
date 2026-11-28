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
