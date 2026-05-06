'use strict';
const { runMigrations } = require('./migrate');
const { seed } = require('./seed');
const { closePool } = require('./pool');

async function initDb() {
  await runMigrations();
  if (process.env.NODE_ENV !== 'production') {
    await seed();
  }
}

module.exports = { initDb, closeDb: closePool };
