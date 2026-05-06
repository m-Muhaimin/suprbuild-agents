'use strict';
const { query } = require('./pool');

async function seedDb() {
  const { rows: offerCount } = await query('SELECT COUNT(*) FROM offers');
  if (parseInt(offerCount[0].count) === 0) {
    console.log('[db] Seeding initial data...');

    await query(`
      INSERT INTO offers (id, title, description, payout_usd, commission_rate, conversion_rate, signals, anti_signals, pitch_guidance, disclosure, status, created_at)
      VALUES
        (gen_random_uuid(), 'SaaS Productivity Tool - Annual Plan', 'Promote our AI-powered project management tool.', 24.00, 0.20, 0.034, '["productivity","project management","remote work"]', '["student","personal use only"]', 'Emphasize time savings and async collaboration.', 'Sponsored: I may earn a commission.', 'active', NOW()),
        (gen_random_uuid(), 'Cloud Hosting Starter Plan', 'Developer-focused VPS hosting with one-click deploys.', 10.00, 0.15, 0.051, '["developer","deployment","server","hosting"]', '["enterprise","on-premise"]', 'Highlight the free tier and GitHub Actions integration.', 'Sponsored: I may earn a commission.', 'active', NOW()),
        (gen_random_uuid(), 'AI Writing Assistant', 'Long-form content writing assistant with SEO integration.', 18.50, 0.30, 0.062, '["content creation","blogging","SEO","copywriting"]', '["academic fraud","school essay"]', 'Focus on ROI: users report 3x faster content production.', 'Sponsored: I may earn a commission.', 'active', NOW())
    `);

    await query(`
      INSERT INTO quests (id, title, description, goal, reward_usd, platform_fee, status, deadline, created_at)
      VALUES
        (gen_random_uuid(), 'Write 3 SEO Blog Posts about AI Productivity', 'Create high-quality blog posts (800+ words each) about AI productivity tools.', 'Publish 3 blog posts on any public platform and provide live URLs as proof.', 75.00, 0.10, 'open', NOW() + INTERVAL '7 days', NOW()),
        (gen_random_uuid(), 'Social Media Campaign — #AgentHansa', 'Create and publish social media posts promoting AgentHansa.', 'Post at least 5 tweets/threads with #agenthansa tag and share proof URLs.', 50.00, 0.10, 'open', NOW() + INTERVAL '5 days', NOW())
    `);

    await query(`
      INSERT INTO red_packets (id, amount_usd, challenge_description, status, questions, created_at, expires_at, next_packet_at)
      VALUES (gen_random_uuid(), 20.00, 'Post a comment in the forum that mentions "AI agents" and includes the word "economy".', 'active', '[{"question":"An agent has 8 coins. It earns 4 more and spends 3. How many remain?","answer":"9"},{"question":"A parrot has 5 coins. It gains 3 more and loses 2. How many?","answer":"6"},{"question":"If you earn $20 and split it 4 ways equally, how much does each get?","answer":"5"}]', NOW(), NOW() + INTERVAL '3 hours', NOW() + INTERVAL '3 hours')
    `);

    await query(`
      INSERT INTO prediction_markets (id, title, source, outcome_yes_prob, outcome_no_prob, status, volume_usd, resolves_at, created_at)
      VALUES
        ('0x4f1c00000000000000000000000000000000000000000000000000000000000001', 'Will Bitcoin exceed $100,000 by end of 2026?', 'polymarket', 0.62, 0.38, 'open', 1240000, '2026-12-31T23:59:59Z', NOW()),
        ('0x4f1c00000000000000000000000000000000000000000000000000000000000002', 'Will a GPT-5 class model be released in 2026?', 'polymarket', 0.78, 0.22, 'open', 890000, '2026-12-31T23:59:59Z', NOW()),
        ('0x4f1c00000000000000000000000000000000000000000000000000000000000003', 'Will the US Federal Reserve cut rates at least twice in 2026?', 'polymarket', 0.45, 0.55, 'open', 560000, '2026-12-31T23:59:59Z', NOW())
    `);

    console.log('[db] Initial data seeded');
  }

  const { rows: a2aCount } = await query('SELECT COUNT(*) FROM a2a_tasks');
  if (parseInt(a2aCount[0].count) === 0) {
    console.log('[db] Seeding A2A tasks...');

    await query(`
      INSERT INTO a2a_tasks (id, type, category, spec, budget, publisher_id, publisher_name, status, deadline, verification, created_at)
      VALUES
        ('task_copy01', 'copywriting', 'writing', '{"brief":"Write hero section copy for a dev tools landing page","tone":"confident, concise","deliverable":"json","constraints":["under 50 words headline","under 120 words subhead"]}', 12.00, 'platform', 'platform', 'open', NOW() + INTERVAL '48 hours', 'publisher_review', NOW()),
        ('task_code01', 'review', 'code', '{"brief":"Review a Python FastAPI endpoint for security vulnerabilities and performance","deliverable":"markdown","constraints":["focus on SQL injection","check rate limiting"]}', 25.00, 'platform', 'platform', 'open', NOW() + INTERVAL '72 hours', 'publisher_review', NOW()),
        ('task_data01', 'data_analysis', 'analysis', '{"brief":"Analyze CSV dataset of 10K e-commerce transactions and summarize key trends","deliverable":"json","constraints":["include top 5 products","show revenue by month","identify churn signals"]}', 18.00, 'platform', 'platform', 'open', NOW() + INTERVAL '24 hours', 'publisher_review', NOW()),
        ('task_trans01', 'translation', 'writing', '{"brief":"Translate a 300-word product page from English to Japanese","tone":"professional, localized","deliverable":"json","constraints":["preserve HTML tags","maintain SEO keywords"]}', 15.00, 'platform', 'platform', 'open', NOW() + INTERVAL '36 hours', 'publisher_review', NOW())
    `);

    console.log('[db] A2A tasks seeded');
  }

  console.log('[db] Database seed complete');
}

module.exports = { seedDb };
