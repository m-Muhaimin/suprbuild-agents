'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../db/store');
const { agentAuth } = require('../middleware/auth');
const { awardXp } = require('./agents');
const {
  isValidTaskType, getTaskCategory, getReputationTier, XP_ACTIONS, todayPST,
} = require('../utils/helpers');

const router = express.Router();

// ── POST /api/a2a/tasks — Publish a task ──────────────────────────
router.post('/tasks', agentAuth, (req, res) => {
  const { type, spec, budget, deadline_hours, verification } = req.body;

  if (!type) return res.status(400).json({ error: 'type is required' });
  if (!isValidTaskType(type)) {
    return res.status(400).json({ error: `Invalid task type. Valid types: ${Object.values(require('../utils/helpers').TASK_TYPES).flat().join(', ')}` });
  }
  if (!spec || !spec.brief) return res.status(400).json({ error: 'spec.brief is required' });
  if (!budget || budget < 0.50) return res.status(400).json({ error: 'budget must be at least $0.50' });

  const publisher = req.agent;
  if (publisher.balance_usd < budget) {
    return res.status(400).json({ error: `Insufficient balance. Need $${budget.toFixed(2)}, have $${publisher.balance_usd.toFixed(2)}` });
  }

  const id = `task_${uuidv4().slice(0, 8)}`;
  const deadline = deadline_hours
    ? new Date(Date.now() + deadline_hours * 3600000).toISOString()
    : new Date(Date.now() + 48 * 3600000).toISOString();

  const task = {
    id,
    type,
    category: getTaskCategory(type),
    spec,
    budget: parseFloat(budget),
    publisher_id: publisher.id,
    publisher_name: publisher.name,
    status: 'open',
    claimed_by: null,
    claimed_at: null,
    submitted_at: null,
    deliverable: null,
    proof_url: null,
    verified_at: null,
    settled_at: null,
    verification: verification || 'publisher_review',
    deadline,
    created_at: new Date().toISOString(),
  };

  store.a2aTasks.set(id, task);

  publisher.balance_usd -= budget;
  if (!publisher.held_usd) publisher.held_usd = 0;
  publisher.held_usd += budget;

  awardXp(publisher, XP_ACTIONS.A2A_PUBLISH, 'a2a_publish');

  res.status(201).json({
    id: task.id,
    type: task.type,
    budget: task.budget,
    deadline: task.deadline,
    status: task.status,
    message: 'Task published. Budget held in escrow.',
  });
});

// ── GET /api/a2a/tasks — Feed of available tasks ─────────────────
router.get('/tasks', agentAuth, (req, res) => {
  const { category, type, min_budget, status = 'open' } = req.query;
  const agent = req.agent;

  let tasks = [...store.a2aTasks.values()];

  if (status) tasks = tasks.filter(t => t.status === status);
  if (category) tasks = tasks.filter(t => t.category === category);
  if (type) tasks = tasks.filter(t => t.type === type);
  if (min_budget) tasks = tasks.filter(t => t.budget >= parseFloat(min_budget));

  tasks = tasks.filter(t => t.publisher_id !== agent.id);

  tasks.sort((a, b) => {
    const tierA = getReputationTier(store.agents.get(a.publisher_id)?.reputation_score || 0);
    const tierB = getReputationTier(store.agents.get(b.publisher_id)?.reputation_score || 0);
    return tierB.multiplier - tierA.multiplier || b.budget - a.budget;
  });

  res.json({
    tasks: tasks.map(t => ({
      id: t.id,
      type: t.type,
      category: t.category,
      spec: { brief: t.spec.brief, deliverable: t.spec.deliverable, constraints: t.spec.constraints },
      budget: t.budget,
      deadline: t.deadline,
      publisher_name: t.publisher_name,
      verification: t.verification,
      created_at: t.created_at,
    })),
    total: tasks.length,
  });
});

// ── GET /api/a2a/tasks/my/published — Tasks I published ───────────────
router.get('/tasks/my/published', agentAuth, (req, res) => {
  const agent = req.agent;
  const tasks = [...store.a2aTasks.values()]
    .filter(t => t.publisher_id === agent.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json({
    tasks: tasks.map(t => ({
      id: t.id, type: t.type, status: t.status, budget: t.budget,
      claimed_by: t.claimed_by, created_at: t.created_at, deadline: t.deadline,
    })),
    total: tasks.length,
  });
});

// ── GET /api/a2a/tasks/my/claimed — Tasks I claimed ───────────────────
router.get('/tasks/my/claimed', agentAuth, (req, res) => {
  const agent = req.agent;
  const tasks = [...store.a2aTasks.values()]
    .filter(t => t.claimed_by === agent.id)
    .sort((a, b) => new Date(b.claimed_at || b.created_at) - new Date(a.claimed_at || a.created_at));

  res.json({
    tasks: tasks.map(t => ({
      id: t.id, type: t.type, status: t.status, budget: t.budget,
      publisher_name: t.publisher_name, claimed_at: t.claimed_at, deadline: t.deadline,
    })),
    total: tasks.length,
  });
});

// ── GET /api/a2a/tasks/stats — A2A statistics ─────────────────────────────
router.get('/tasks/stats', agentAuth, (req, res) => {
  const agent = req.agent;
  const allTasks = [...store.a2aTasks.values()];

  const published = allTasks.filter(t => t.publisher_id === agent.id);
  const claimed = allTasks.filter(t => t.claimed_by === agent.id);

  const earned = claimed
    .filter(t => t.status === 'settled')
    .reduce((sum, t) => sum + (t.payout_amount || 0), 0);

  const spent = published
    .filter(t => t.status === 'settled')
    .reduce((sum, t) => sum + t.budget, 0);

  res.json({
    agent_id: agent.id,
    published: published.length,
    claimed: claimed.length,
    completed: claimed.filter(t => t.status === 'settled').length,
    earned_usd: earned,
    spent_usd: spent,
    active_tasks: claimed.filter(t => ['claimed', 'submitted'].includes(t.status)).length,
  });
});

// ── GET /api/a2a/tasks/:id — Task details ─────────────────────────────────
router.get('/tasks/:id', agentAuth, (req, res) => {
  const task = store.a2aTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const agent = req.agent;
  const isPublisher = task.publisher_id === agent.id;
  const isExecutor = task.claimed_by === agent.id;

  const result = {
    id: task.id,
    type: task.type,
    category: task.category,
    spec: task.spec,
    budget: task.budget,
    publisher_id: isPublisher ? undefined : task.publisher_id,
    publisher_name: task.publisher_name,
    status: task.status,
    claimed_by: task.claimed_by,
    claimed_at: task.claimed_at,
    submitted_at: task.submitted_at,
    verified_at: task.verified_at,
    settled_at: task.settled_at,
    deadline: task.deadline,
    verification: task.verification,
    created_at: task.created_at,
  };

  if (isExecutor || isPublisher) {
    result.deliverable = task.deliverable;
    result.proof_url = task.proof_url;
  }

  res.json(result);
});

// ── POST /api/a2a/tasks/:id/claim — Claim a task ──────────────────────────
router.post('/tasks/:id/claim', agentAuth, (req, res) => {
  const task = store.a2aTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'open') return res.status(400).json({ error: `Task is ${task.status}, cannot claim` });

  const agent = req.agent;
  if (task.publisher_id === agent.id) {
    return res.status(400).json({ error: 'Cannot claim your own task' });
  }

  task.status = 'claimed';
  task.claimed_by = agent.id;
  task.claimed_at = new Date().toISOString();

  awardXp(agent, XP_ACTIONS.A2A_CLAIM, 'a2a_claim');

  res.json({
    task_id: task.id,
    status: task.status,
    budget: task.budget,
    deadline: task.deadline,
    message: 'Task claimed. Execute locally and submit deliverable.',
  });
});

// ── POST /api/a2a/tasks/:id/submit — Submit deliverable ───────────────────
router.post('/tasks/:id/submit', agentAuth, (req, res) => {
  const task = store.a2aTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'claimed') return res.status(400).json({ error: `Task is ${task.status}, cannot submit` });

  const agent = req.agent;
  if (task.claimed_by !== agent.id) {
    return res.status(403).json({ error: 'Only the claiming agent can submit' });
  }

  const { deliverable, proof_url } = req.body;
  if (!deliverable) return res.status(400).json({ error: 'deliverable is required' });

  task.status = 'submitted';
  task.deliverable = deliverable;
  task.proof_url = proof_url || null;
  task.submitted_at = new Date().toISOString();

  awardXp(agent, XP_ACTIONS.A2A_SUBMIT, 'a2a_submit');

  const publisher = store.agents.get(task.publisher_id);
  if (publisher) {
    const notifId = uuidv4();
    store.notifications.set(notifId, {
      id: notifId,
      agent_id: publisher.id,
      type: 'a2a_submission',
      message: `Task ${task.id} has been submitted for review.`,
      task_id: task.id,
      read: false,
      created_at: new Date().toISOString(),
    });
  }

  res.json({
    task_id: task.id,
    status: task.status,
    submitted_at: task.submitted_at,
    message: 'Deliverable submitted. Awaiting verification.',
  });
});

// ── POST /api/a2a/tasks/:id/verify — Verify deliverable ───────────────────
router.post('/tasks/:id/verify', agentAuth, (req, res) => {
  const task = store.a2aTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'submitted') return res.status(400).json({ error: `Task is ${task.status}, cannot verify` });

  const agent = req.agent;
  if (task.publisher_id !== agent.id) {
    return res.status(403).json({ error: 'Only the publisher can verify' });
  }

  const { approved, feedback } = req.body;
  if (approved === undefined) return res.status(400).json({ error: 'approved (boolean) is required' });

  if (approved) {
    task.status = 'verified';
    task.verified_at = new Date().toISOString();
    task.verification_result = 'approved';

    const executor = store.agents.get(task.claimed_by);
    if (executor) {
      awardXp(executor, XP_ACTIONS.A2A_VERIFY, 'a2a_verify');
      executor.reputation_score = (executor.reputation_score || 0) + 5;
      const tier = getReputationTier(executor.reputation_score);
      executor.reputation_tier = tier.tier;
    }

    const publisher = store.agents.get(task.publisher_id);
    if (publisher) {
      publisher.reputation_score = (publisher.reputation_score || 0) + 3;
      const tier = getReputationTier(publisher.reputation_score);
      publisher.reputation_tier = tier.tier;
    }

    res.json({
      task_id: task.id,
      status: task.status,
      message: 'Deliverable verified. Use /settle to release payment.',
    });
  } else {
    task.status = 'rejected';
    task.verification_result = 'rejected';
    task.verification_feedback = feedback || 'Not approved';
    task.revision_count = (task.revision_count || 0) + 1;

    const executor = store.agents.get(task.claimed_by);
    if (executor) {
      executor.reputation_score = Math.max(0, (executor.reputation_score || 0) - 2);
      const tier = getReputationTier(executor.reputation_score);
      executor.reputation_tier = tier.tier;
    }

    task.status = 'open';
    task.claimed_by = null;
    task.claimed_at = null;
    task.deliverable = null;
    task.proof_url = null;
    task.submitted_at = null;

    res.json({
      task_id: task.id,
      status: task.status,
      feedback: task.verification_feedback,
      message: 'Deliverable rejected. Task re-opened for claims.',
    });
  }
});

// ── POST /api/a2a/tasks/:id/settle — Settle payment ───────────────────────
router.post('/tasks/:id/settle', agentAuth, (req, res) => {
  const task = store.a2aTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'verified') return res.status(400).json({ error: `Task is ${task.status}, can only settle verified tasks` });

  const agent = req.agent;
  if (task.publisher_id !== agent.id) {
    return res.status(403).json({ error: 'Only the publisher can settle' });
  }

  const executor = store.agents.get(task.claimed_by);
  const publisher = store.agents.get(task.publisher_id);

  const tier = getReputationTier(executor?.reputation_score || 0);
  const payout = task.budget * tier.multiplier;

  if (executor) {
    executor.balance_usd += payout;
  }
  if (publisher) {
    publisher.held_usd = (publisher.held_usd || 0) - task.budget;
    const remainder = task.budget - payout;
    if (remainder > 0) publisher.balance_usd += remainder;
  }

  task.status = 'settled';
  task.settled_at = new Date().toISOString();
  task.payout_amount = payout;
  task.payout_multiplier = tier.multiplier;

  if (executor) {
    awardXp(executor, XP_ACTIONS.A2A_COMPLETION_BONUS, 'a2a_completion');
    executor.completed_tasks = (executor.completed_tasks || 0) + 1;
  }
  if (publisher) {
    publisher.completed_tasks = (publisher.completed_tasks || 0) + 1;
  }

  res.json({
    task_id: task.id,
    status: task.status,
    payout_amount: payout,
    payout_multiplier: tier.multiplier,
    executor_id: task.claimed_by,
    settled_at: task.settled_at,
    message: `Payment of $${payout.toFixed(2)} released to executor.`,
  });
});

// ── POST /api/a2a/tasks/:id/cancel — Cancel an open task ──────────────────
router.post('/tasks/:id/cancel', agentAuth, (req, res) => {
  const task = store.a2aTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const agent = req.agent;
  if (task.publisher_id !== agent.id) {
    return res.status(403).json({ error: 'Only the publisher can cancel' });
  }
  if (task.status !== 'open') {
    return res.status(400).json({ error: `Cannot cancel task in ${task.status} state` });
  }

  task.status = 'cancelled';
  const publisher = store.agents.get(task.publisher_id);
  if (publisher) {
    publisher.balance_usd += task.budget;
    publisher.held_usd = (publisher.held_usd || 0) - task.budget;
  }

  res.json({ task_id: task.id, status: 'cancelled', refunded: task.budget, message: 'Task cancelled. Budget refunded.' });
});

// ── POST /api/a2a/tasks/:id/release — Release task (executor skips) ───────
router.post('/tasks/:id/release', agentAuth, (req, res) => {
  const task = store.a2aTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'claimed') return res.status(400).json({ error: `Task is ${task.status}, cannot release` });

  const agent = req.agent;
  if (task.claimed_by !== agent.id) {
    return res.status(403).json({ error: 'Only the claiming agent can release' });
  }

  task.status = 'open';
  task.claimed_by = null;
  task.claimed_at = null;

  res.json({ task_id: task.id, status: 'open', message: 'Task released. Returned to pool.' });
});

module.exports = router;
