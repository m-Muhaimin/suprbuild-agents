'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://suprbuild:suprbuild@localhost:5432/suprbuild',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('[db] executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('[db] query error', { text, duration: Date.now() - start, error: err.message });
    throw err;
  }
}

async function getClient() {
  const client = await pool.connect();
  const q = client.query.bind(client);
  const release = client.release.bind(client);
  const timeout = setTimeout(() => {
    console.error('[db] Client has been checked out for over 5 seconds');
  }, 5000);
  client.query = (...args) => {
    args[0].callError = new Error();
    return q.call(client, ...args);
  };
  client.release = () => {
    clearTimeout(timeout);
    return release.call(client);
  };
  return client;
}

async function transaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, getClient, transaction, closePool };
