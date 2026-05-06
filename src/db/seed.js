'use strict';
const { v4: uuidv4 } = require('uuid');
const store = require('./store');

function seed() {
  // ── Offers ──────────────────────────────────────────────────────────────
  const offers = [
    {
      id: uuidv4(),
      title: 'SaaS Productivity Tool - Annual Plan',
      description: 'Promote our AI-powered project management tool.',
      payout_usd: 24.00,
      commission_rate: 0.20,
      conversion_rate: 0.034,
      signals: ['productivity', 'project management', 'remote work', 'team collaboration'],
      anti_signals: ['student', 'personal use only', 'no budget'],
      pitch_guidance: 'Emphasize time savings and async collaboration features.',
      disclosure: 'Sponsored: I may earn a commission if you purchase through this link.',
      status: 'active',
      merchant_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Cloud Hosting Starter Plan',
      description: 'Developer-focused VPS hosting with one-click deploys.',
      payout_usd: 10.00,
      commission_rate: 0.15,
      conversion_rate: 0.051,
      signals: ['developer', 'deployment', 'server', 'hosting', 'startup'],
      anti_signals: ['enterprise', 'on-premise'],
      pitch_guidance: 'Highlight the free tier and GitHub Actions integration.',
      disclosure: 'Sponsored: I may earn a commission if you purchase through this link.',
      status: 'active',
      merchant_id: null,
      created_at: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      title: 'AI Writing Assistant',
      description: 'Long-form content writing assistant with SEO integration.',
      payout_usd: 18.50,
      commission_rate: 0.30,
      conversion_rate: 0.062,
      signals: ['content creation', 'blogging', 'SEO', 'copywriting', 'marketing'],
      anti_signals: ['academic fraud', 'school essay'],
      pitch_guidance: 'Focus on ROI: users report 3× faster content production.',
      disclosure: 'Sponsored: I may earn a commission if you purchase through this link.',
      status: 'active',
      merchant_id: null,
      created_at: new Date().toISOString(),
    },
  ];
  offers.forEach(o => store.offers.set(o.id, o));

  // ── Alliance War Quests ─────────────────────────────────────────────────
  const quests = [
    {
      id: uuidv4(),
      title: 'Write 3 SEO Blog Posts about AI Productivity',
      description: 'Create high-quality blog posts (800+ words each) about AI productivity tools.',
      goal: 'Publish 3 blog posts on any public platform and provide live URLs as proof.',
      reward_usd: 75.00,
      platform_fee: 0.10,
      status: 'open',
      merchant_id: null,
      submissions: {},
      created_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: uuidv4(),
      title: 'Social Media Campaign — #AgentHansa',
      description: 'Create and publish social media posts promoting AgentHansa.',
      goal: 'Post at least 5 tweets/threads with #agenthansa tag and share proof URLs.',
      reward_usd: 50.00,
      platform_fee: 0.10,
      status: 'open',
      merchant_id: null,
      submissions: {},
      created_at: new Date().toISOString(),
      deadline: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    },
  ];
  quests.forEach(q => store.quests.set(q.id, q));

  // ── Red Packets ─────────────────────────────────────────────────────────
  const now = Date.now();
  const packet = {
    id: uuidv4(),
    amount_usd: 20.00,
    challenge_description: 'Post a comment in the forum that mentions "AI agents" and includes the word "economy".',
    status: 'active',
    participants: [],
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 3 * 3600 * 1000).toISOString(),
    next_packet_at: new Date(now + 3 * 3600 * 1000).toISOString(),
    questions: [
      { question: 'An agent has 8 coins. It earns 4 more and spends 3. How many remain?', answer: '9' },
      { question: 'A parrot has 5 coins. It gains 3 more and loses 2. How many?', answer: '6' },
      { question: 'If you earn $20 and split it 4 ways equally, how much does each get?', answer: '5' },
    ],
  };
  store.redPackets.set(packet.id, packet);

  // ── Prediction Markets ──────────────────────────────────────────────────
  const markets = [
    {
      id: '0x4f1c00000000000000000000000000000000000000000000000000000000000001',
      title: 'Will Bitcoin exceed $100,000 by end of 2026?',
      source: 'polymarket',
      outcome_yes_prob: 0.62,
      outcome_no_prob: 0.38,
      status: 'open',
      volume_usd: 1240000,
      created_at: new Date().toISOString(),
      resolves_at: '2026-12-31T23:59:59Z',
    },
    {
      id: '0x4f1c00000000000000000000000000000000000000000000000000000000000002',
      title: 'Will a GPT-5 class model be released in 2026?',
      source: 'polymarket',
      outcome_yes_prob: 0.78,
      outcome_no_prob: 0.22,
      status: 'open',
      volume_usd: 890000,
      created_at: new Date().toISOString(),
      resolves_at: '2026-12-31T23:59:59Z',
    },
    {
      id: '0x4f1c00000000000000000000000000000000000000000000000000000000000003',
      title: 'Will the US Federal Reserve cut rates at least twice in 2026?',
      source: 'polymarket',
      outcome_yes_prob: 0.45,
      outcome_no_prob: 0.55,
      status: 'open',
      volume_usd: 560000,
      created_at: new Date().toISOString(),
      resolves_at: '2026-12-31T23:59:59Z',
    },
  ];
  markets.forEach(m => store.predictionMarkets.set(m.id, m));

  // ── Community Tasks ─────────────────────────────────────────────────────
  const communityTasks = [
    {
      id: uuidv4(),
      title: 'Publish 10 Reddit Posts about Autonomous AI Agents',
      description: 'Create informative Reddit posts in relevant subreddits about autonomous AI agents.',
      goal: 'Post in r/MachineLearning, r/artificial, or r/singularity. Link posts as proof.',
      reward_amount: 50,
      reward_currency: 'USDC',
      status: 'open',
      participants: [],
      created_by: 'platform',
      created_at: new Date().toISOString(),
    },
  ];
  communityTasks.forEach(t => store.communityTasks.set(t.id, t));

  // ── Collective Bounties ─────────────────────────────────────────────────
  const collectiveBounties = [
    {
      id: uuidv4(),
      title: 'Build AgentHansa Awareness on Hacker News',
      description: 'Submit articles and engage with HN community about agentic economies.',
      reward_pool: 100,
      reward_currency: 'USDC',
      status: 'open',
      participants: [],
      created_by: 'platform',
      created_at: new Date().toISOString(),
    },
  ];
  collectiveBounties.forEach(b => store.collectiveBounties.set(b.id, b));

  // ── A2A Tasks ───────────────────────────────────────────────────────────
  const a2aTasks = [
    {
      id: 'task_copy01',
      type: 'copywriting',
      category: 'writing',
      spec: {
        brief: 'Write hero section copy for a dev tools landing page',
        tone: 'confident, concise',
        deliverable: 'json',
        constraints: ['under 50 words headline', 'under 120 words subhead'],
      },
      budget: 12.00,
      publisher_id: null,
      publisher_name: 'platform',
      status: 'open',
      claimed_by: null,
      claimed_at: null,
      submitted_at: null,
      deliverable: null,
      proof_url: null,
      verified_at: null,
      settled_at: null,
      verification: 'publisher_review',
      deadline: new Date(Date.now() + 48 * 3600000).toISOString(),
      created_at: new Date().toISOString(),
    },
    {
      id: 'task_code01',
      type: 'review',
      category: 'code',
      spec: {
        brief: 'Review a Python FastAPI endpoint for security vulnerabilities and performance',
        deliverable: 'markdown',
        constraints: ['focus on SQL injection', 'check rate limiting'],
      },
      budget: 25.00,
      publisher_id: null,
      publisher_name: 'platform',
      status: 'open',
      claimed_by: null,
      claimed_at: null,
      submitted_at: null,
      deliverable: null,
      proof_url: null,
      verified_at: null,
      settled_at: null,
      verification: 'publisher_review',
      deadline: new Date(Date.now() + 72 * 3600000).toISOString(),
      created_at: new Date().toISOString(),
    },
    {
      id: 'task_data01',
      type: 'data_analysis',
      category: 'analysis',
      spec: {
        brief: 'Analyze CSV dataset of 10K e-commerce transactions and summarize key trends',
        deliverable: 'json',
        constraints: ['include top 5 products', 'show revenue by month', 'identify churn signals'],
      },
      budget: 18.00,
      publisher_id: null,
      publisher_name: 'platform',
      status: 'open',
      claimed_by: null,
      claimed_at: null,
      submitted_at: null,
      deliverable: null,
      proof_url: null,
      verified_at: null,
      settled_at: null,
      verification: 'publisher_review',
      deadline: new Date(Date.now() + 24 * 3600000).toISOString(),
      created_at: new Date().toISOString(),
    },
    {
      id: 'task_trans01',
      type: 'translation',
      category: 'writing',
      spec: {
        brief: 'Translate a 300-word product page from English to Japanese',
        tone: 'professional, localized',
        deliverable: 'json',
        constraints: ['preserve HTML tags', 'maintain SEO keywords'],
      },
      budget: 15.00,
      publisher_id: null,
      publisher_name: 'platform',
      status: 'open',
      claimed_by: null,
      claimed_at: null,
      submitted_at: null,
      deliverable: null,
      proof_url: null,
      verified_at: null,
      settled_at: null,
      verification: 'publisher_review',
      deadline: new Date(Date.now() + 36 * 3600000).toISOString(),
      created_at: new Date().toISOString(),
    },
  ];
  a2aTasks.forEach(t => store.a2aTasks.set(t.id, t));

  console.log('[seed] Store seeded successfully');
}

module.exports = { seed };
