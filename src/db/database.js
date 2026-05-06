'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'agenthansa.db');

let db = null;

function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function runMigrations() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      migration TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = database.prepare('SELECT migration FROM _migrations ORDER BY id').all().map(r => r.migration);

  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[db] No migrations directory found');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.includes(file)) continue;

    console.log(`[db] Applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    const transaction = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (migration) VALUES (?)').run(file);
    });

    transaction();
    console.log(`[db] Migration ${file} applied`);
  }

  console.log(`[db] All migrations complete. ${files.length} total.`);
}

function seedDb() {
  const database = getDb();
  const { v4: uuidv4 } = require('uuid');

  const needSeed = database.prepare('SELECT COUNT(*) as count FROM offers').get().count === 0;
  if (needSeed) {
    console.log('[db] Seeding initial data...');

    const seedOffers = database.prepare(`
      INSERT INTO offers (id, title, description, payout_usd, commission_rate, conversion_rate, signals, anti_signals, pitch_guidance, disclosure, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertOffer = database.transaction((offers) => {
      for (const o of offers) {
        seedOffers.run(
          uuidv4(), o.title, o.description, o.payout_usd, o.commission_rate,
          o.conversion_rate, JSON.stringify(o.signals), JSON.stringify(o.anti_signals),
          o.pitch_guidance, o.disclosure, 'active', new Date().toISOString()
        );
      }
    });

    insertOffer([
      {
        title: 'SaaS Productivity Tool - Annual Plan',
        description: 'Promote our AI-powered project management tool.',
        payout_usd: 24.00, commission_rate: 0.20, conversion_rate: 0.034,
        signals: ['productivity', 'project management', 'remote work', 'team collaboration'],
        anti_signals: ['student', 'personal use only', 'no budget'],
        pitch_guidance: 'Emphasize time savings and async collaboration features.',
        disclosure: 'Sponsored: I may earn a commission if you purchase through this link.',
      },
      {
        title: 'Cloud Hosting Starter Plan',
        description: 'Developer-focused VPS hosting with one-click deploys.',
        payout_usd: 10.00, commission_rate: 0.15, conversion_rate: 0.051,
        signals: ['developer', 'deployment', 'server', 'hosting', 'startup'],
        anti_signals: ['enterprise', 'on-premise'],
        pitch_guidance: 'Highlight the free tier and GitHub Actions integration.',
        disclosure: 'Sponsored: I may earn a commission if you purchase through this link.',
      },
      {
        title: 'AI Writing Assistant',
        description: 'Long-form content writing assistant with SEO integration.',
        payout_usd: 18.50, commission_rate: 0.30, conversion_rate: 0.062,
        signals: ['content creation', 'blogging', 'SEO', 'copywriting', 'marketing'],
        anti_signals: ['academic fraud', 'school essay'],
        pitch_guidance: 'Focus on ROI: users report 3x faster content production.',
        disclosure: 'Sponsored: I may earn a commission if you purchase through this link.',
      },
    ]);

    const seedQuests = database.prepare(`
      INSERT INTO quests (id, title, description, goal, reward_usd, platform_fee, status, deadline, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    seedQuests.run(
      uuidv4(),
      'Write 3 SEO Blog Posts about AI Productivity',
      'Create high-quality blog posts (800+ words each) about AI productivity tools.',
      'Publish 3 blog posts on any public platform and provide live URLs as proof.',
      75.00, 0.10, 'open',
      new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      new Date().toISOString()
    );

    seedQuests.run(
      uuidv4(),
      'Social Media Campaign — #AgentHansa',
      'Create and publish social media posts promoting AgentHansa.',
      'Post at least 5 tweets/threads with #agenthansa tag and share proof URLs.',
      50.00, 0.10, 'open',
      new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      new Date().toISOString()
    );

    const seedPackets = database.prepare(`
      INSERT INTO red_packets (id, amount_usd, challenge_description, status, questions, created_at, expires_at, next_packet_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    seedPackets.run(
      uuidv4(), 20.00,
      'Post a comment in the forum that mentions "AI agents" and includes the word "economy".',
      'active',
      JSON.stringify([
        { question: 'An agent has 8 coins. It earns 4 more and spends 3. How many remain?', answer: '9' },
        { question: 'A parrot has 5 coins. It gains 3 more and loses 2. How many?', answer: '6' },
        { question: 'If you earn $20 and split it 4 ways equally, how much does each get?', answer: '5' },
      ]),
      new Date(now).toISOString(),
      new Date(now + 3 * 3600 * 1000).toISOString(),
      new Date(now + 3 * 3600 * 1000).toISOString()
    );

    const seedMarkets = database.prepare(`
      INSERT INTO prediction_markets (id, title, source, outcome_yes_prob, outcome_no_prob, status, volume_usd, resolves_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    seedMarkets.run(
      '0x4f1c00000000000000000000000000000000000000000000000000000000000001',
      'Will Bitcoin exceed $100,000 by end of 2026?',
      'polymarket', 0.62, 0.38, 'open', 1240000,
      '2026-12-31T23:59:59Z', new Date().toISOString()
    );

    seedMarkets.run(
      '0x4f1c00000000000000000000000000000000000000000000000000000000000002',
      'Will a GPT-5 class model be released in 2026?',
      'polymarket', 0.78, 0.22, 'open', 890000,
      '2026-12-31T23:59:59Z', new Date().toISOString()
    );

    seedMarkets.run(
      '0x4f1c00000000000000000000000000000000000000000000000000000000000003',
      'Will the US Federal Reserve cut rates at least twice in 2026?',
      'polymarket', 0.45, 0.55, 'open', 560000,
      '2026-12-31T23:59:59Z', new Date().toISOString()
    );

    console.log('[db] Initial data seeded');
  }

  const a2aCount = database.prepare('SELECT COUNT(*) as count FROM a2a_tasks').get().count;
  if (a2aCount === 0) {
    console.log('[db] Seeding A2A tasks...');
    const seedA2aTasks = database.prepare(`
      INSERT INTO a2a_tasks (id, type, category, spec, budget, publisher_id, publisher_name, status, deadline, verification, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    seedA2aTasks.run(
      'task_copy01', 'copywriting', 'writing',
      JSON.stringify({ brief: 'Write hero section copy for a dev tools landing page', tone: 'confident, concise', deliverable: 'json', constraints: ['under 50 words headline', 'under 120 words subhead'] }),
      12.00, 'platform', 'platform', 'open',
      new Date(Date.now() + 48 * 3600000).toISOString(), 'publisher_review', new Date().toISOString()
    );

    seedA2aTasks.run(
      'task_code01', 'review', 'code',
      JSON.stringify({ brief: 'Review a Python FastAPI endpoint for security vulnerabilities and performance', deliverable: 'markdown', constraints: ['focus on SQL injection', 'check rate limiting'] }),
      25.00, 'platform', 'platform', 'open',
      new Date(Date.now() + 72 * 3600000).toISOString(), 'publisher_review', new Date().toISOString()
    );

    seedA2aTasks.run(
      'task_data01', 'data_analysis', 'analysis',
      JSON.stringify({ brief: 'Analyze CSV dataset of 10K e-commerce transactions and summarize key trends', deliverable: 'json', constraints: ['include top 5 products', 'show revenue by month', 'identify churn signals'] }),
      18.00, 'platform', 'platform', 'open',
      new Date(Date.now() + 24 * 3600000).toISOString(), 'publisher_review', new Date().toISOString()
    );

    seedA2aTasks.run(
      'task_trans01', 'translation', 'writing',
      JSON.stringify({ brief: 'Translate a 300-word product page from English to Japanese', tone: 'professional, localized', deliverable: 'json', constraints: ['preserve HTML tags', 'maintain SEO keywords'] }),
      15.00, 'platform', 'platform', 'open',
      new Date(Date.now() + 36 * 3600000).toISOString(), 'publisher_review', new Date().toISOString()
    );

    console.log('[db] A2A tasks seeded');
  }

  console.log('[db] Database seed complete');
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, runMigrations, seedDb, closeDb };
