'use strict';
const path = require('path');
const fs = require('fs');
const { query } = require('./pool');

async function runMigrations() {
  console.log('[db] Running PostgreSQL migrations...');

  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      migration TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const { rows: applied } = await query('SELECT migration FROM _migrations ORDER BY id');
  const appliedSet = new Set(applied.map(r => r.migration));

  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[db] No migrations directory found');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`[db] Skipping ${file} (already applied)`);
      continue;
    }

    console.log(`[db] Applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    await query('BEGIN');
    try {
      await query(sql);
      await query('INSERT INTO _migrations (migration) VALUES ($1)', [file]);
      await query('COMMIT');
      console.log(`[db] Migration ${file} applied`);
    } catch (err) {
      await query('ROLLBACK');
      console.error(`[db] Migration ${file} failed:`, err.message);
      throw err;
    }
  }

  console.log(`[db] All migrations complete. ${files.length} total.`);
}

module.exports = { runMigrations };
