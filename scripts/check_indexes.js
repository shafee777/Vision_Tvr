const db = require('../server/db/database');

async function check() {
  const indexes = await db.all("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name");
  console.log(`Active non-system indexes (${indexes.length}):`);
  indexes.forEach(i => console.log(`  - ${i.tbl_name} -> ${i.name}`));

  // Check Foreign Key integrity
  const fkCheck = await db.all("PRAGMA foreign_key_check;");
  console.log(`\nForeign Key Violations: ${fkCheck.length}`);
  if (fkCheck.length > 0) console.log(fkCheck);

  // Check Database Quick Integrity
  const integrity = await db.all("PRAGMA integrity_check;");
  console.log(`\nIntegrity Check: ${JSON.stringify(integrity)}`);
  process.exit(0);
}

check().catch(console.error);
