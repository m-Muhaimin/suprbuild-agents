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

router.post('/tasks', agentAuth, async (req, res) => {
  try {
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

    const task = await store.a2aTasks.create({
      id, type, category: getTaskCategory(type), spec, budget: parseFloat(budget),
      publisher_id: publisher.id, publisher_name: publisher.name, status: 'open',
      verification: verification || 'publisher_review', deadline,
    });

    await store.agents.update(publisher.id, {
      balance_usd: publisher.balance_usd - budget,
      held_usd: (publisher.held_usd || 0) + budget,
    });

    await awardXp(publisher.id, XP_ACTIONS.A2A_PUBLISH, 'a2a_publish');

    res.status(201).json({ id: task.id, type: task.type, budget: task.budget, deadline: task.deadline, status: task.status, message: 'Task published. Budget held in escrow.' });
  } catch (err) {
    console.error('[a2a] publish error:', err.message);
    res.status(500).json({ error: 'Failed to publish task' });
  }
});

router.get('/tasks', agentAuth, async (req, res) => {
  try {
    const { category, type, min_budget, status = 'open' } = req.query;
    const agent = req.agent;

    let tasks = await store.a2aTasks.findByStatus(status);
    if (category) tasks = tasks.filter(t => t.category === category);
    if (type) tasks = tasks.filter(t => t.type === type);
    if (min_budget) tasks = tasks.filter(t => t.budget >= parseFloat(min_budget));

    tasks = tasks.filter(t => t.publisher_id !== agent.id);

    tasks.sort((a, b) => {
      const tierA = getReputationTier((a.publisher_id ? 0 : 0));
      const tierB = getReputationTier((b.publisher_id ? 0 : 0));
      return tierB.multiplier - tierA.multiplier || b.budget - a.budget;
    });

    res.json({
      tasks: tasks.map(t => ({
        id: t.id, type: t.type, category: t.category,
        spec: { brief: t.spec.brief, deliverable: t.spec.deliverable, constraints: t.spec.constraints },
        budget: t.budget, deadline: t.deadline, publisher_name: t.publisher_name,
        verification: t.verification, created_at: t.created_at,
      })),
      total: tasks.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.get('/tasks/my/published', agentAuth, async (req, res) => {
  try {
    const agent = req.agent;
    const allTasks = await store.a2aTasks.all();
    const tasks = allTasks
      .filter(t => t.publisher_id === agent.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ tasks: tasks.map(t => ({ id: t.id, type: t.type, status: t.status, budget: t.budget, claimed_by: t.claimed_by, created_at: t.created_at, deadline: t.deadline })), total: tasks.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.get('/tasks/my/claimed', agentAuth, async (req, res) => {
  try {
    const agent = req.agent;
    const allTasks = await store.a2aTasks.all();
    const tasks = allTasks
      .filter(t => t.claimed_by === agent.id)
      .sort((a, b) => new Date(b.claimed_at || b.created_at) - new Date(a.claimed_at || a.created_at));

    res.json({ tasks: tasks.map(t => ({ id: t.id, type: t.type, status: t.status, budget: t.budget, publisher_name: t.publisher_name, claimed_at: t.claimed_at, deadline: t.deadline })), total: tasks.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.get('/tasks/stats', agentAuth, async (req, res) => {
  try {
    const agent = req.agent;
    const allTasks = await store.a2aTasks.all();

    const published = allTasks.filter(t => t.publisher_id === agent.id);
    const claimed = allTasks.filter(t => t.claimed_by === agent.id);

    const earned = claimed.filter(t => t.status === 'settled').reduce((sum, t) => sum + (t.payout_amount || 0), 0);
    const spent = published.filter(t => t.status === 'settled').reduce((sum, t) => sum + t.budget, 0);

    res.json({ agent_id: agent.id, published: published.length, claimed: claimed.length, completed: claimed.filter(t => t.status === 'settled').length, earned_usd: earned, spent_usd: spent, active_tasks: claimed.filter(t => ['claimed', 'submitted'].includes(t.status)).length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/tasks/:id', agentAuth, async (req, res) => {
  try {
    const task = await store.a2aTasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const agent = req.agent;
    const isPublisher = task.publisher_id === agent.id;
    const isExecutor = task.claimed_by === agent.id;

    const result = {
      id: task.id, type: task.type, category: task.category, spec: task.spec, budget: task.budget,
      publisher_id: isPublisher ? undefined : task.publisher_id, publisher_name: task.publisher_name,
      status: task.status, claimed_by: task.claimed_by, claimed_at: task.claimed_at, submitted_at: task.submitted_at,
      verified_at: task.verified_at, settled_at: task.settled_at, deadline: task.deadline,
      verification: task.verification, created_at: task.created_at,
    };

    if (isExecutor || isPublisher) { result.deliverable = task.deliverable; result.proof_url = task.proof_url; }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

router.post('/tasks/:id/claim', agentAuth, async (req, res) => {
  try {
    const task = await store.a2aTasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'open') return res.status(400).json({ error: `Task is ${task.status}, cannot claim` });

    const agent = req.agent;
    if (task.publisher_id === agent.id) return res.status(400).json({ error: 'Cannot claim your own task' });

    await store.a2aTasks.update(task.id, {
      status: 'claimed', claimed_by: agent.id, claimed_at: new Date().toISOString(),
    });

    await awardXp(agent.id, XP_ACTIONS.A2A_CLAIM, 'a2a_claim');

    res.json({ task_id: task.id, status: 'claimed', budget: task.budget, deadline: task.deadline, message: 'Task claimed. Execute locally and submit deliverable.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim task' });
  }
});

router.post('/tasks/:id/submit', agentAuth, async (req, res) => {
  try {
    const task = await store.a2aTasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'claimed') return res.status(400).json({ error: `Task is ${task.status}, cannot submit` });

    const agent = req.agent;
    if (task.claimed_by !== agent.id) return res.status(403).json({ error: 'Only the claiming agent can submit' });

    const { deliverable, proof_url } = req.body;
    if (!deliverable) return res.status(400).json({ error: 'deliverable is required' });

    await store.a2aTasks.update(task.id, {
      status: 'submitted', deliverable, proof_url: proof_url || null, submitted_at: new Date().toISOString(),
    });

    await awardXp(agent.id, XP_ACTIONS.A2A_SUBMIT, 'a2a_submit');

    const publisher = await store.agents.findById(task.publisher_id);
    if (publisher) {
      await store.notifications.create({
        id: uuidv4(), agent_id: publisher.id, type: 'a2a_submission',
        message: `Task ${task.id} has been submitted for review.`, task_id: task.id,
        read: false, created_at: new Date().toISOString(),
      });
    }

    res.json({ task_id: task.id, status: 'submitted', submitted_at: task.submitted_at, message: 'Deliverable submitted. Awaiting verification.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit task' });
  }
});

router.post('/tasks/:id/verify', agentAuth, async (req, res) => {
  try {
    const task = await store.a2aTasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'submitted') return res.status(400).json({ error: `Task is ${task.status}, cannot verify` });

    const agent = req.agent;
    if (task.publisher_id !== agent.id) return res.status(403).json({ error: 'Only the publisher can verify' });

    const { approved, feedback } = req.body;
    if (approved === undefined) return res.status(400).json({ error: 'approved (boolean) is required' });

    if (approved) {
      await store.a2aTasks.update(task.id, {
        status: 'verified', verified_at: new Date().toISOString(), verification_result: 'approved',
      });

      const executor = await store.agents.findById(task.claimed_by);
      if (executor) {
        await awardXp(executor.id, XP_ACTIONS.A2A_VERIFY, 'a2a_verify');
        await store.agents.update(executor.id, {
          reputation_score: (executor.reputation_score || 0) + 5,
          reputation_tier: getReputationTier(executor.reputation_score + 5).tier,
        });
      }

      const publisher = await store.agents.findById(task.publisher_id);
      if (publisher) {
        await store.agents.update(publisher.id, {
          reputation_score: (publisher.reputation_score || 0) + 3,
          reputation_tier: getReputationTier(publisher.reputation_score + 3).tier,
        });
      }

      res.json({ task_id: task.id, status: 'verified', message: 'Deliverable verified. Use /settle to release payment.' });
    } else {
      await store.a2aTasks.update(task.id, {
        status: 'open', claimed_by: null, claimed_at: null, deliverable: null, proof_url: null,
        submitted_at: null, verification_result: 'rejected', verification_feedback: feedback || 'Not approved',
        revision_count: (task.revision_count || 0) + 1,
      });

      const executor = await store.agents.findById(task.claimed_by);
      if (executor) {
        const newScore = Math.max(0, (executor.reputation_score || 0) - 2);
        await store.agents.update(executor.id, {
          reputation_score: newScore, reputation_tier: getReputationTier(newScore).tier,
        });
      }

      res.json({ task_id: task.id, status: 'open', feedback: feedback || 'Not approved', message: 'Deliverable rejected. Task re-opened for claims.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify task' });
  }
});

router.post('/tasks/:id/settle', agentAuth, async (req, res) => {
  try {
    const task = await store.a2aTasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'verified') return res.status(400).json({ error: `Task is ${task.status}, can only settle verified tasks` });

    const agent = req.agent;
    if (task.publisher_id !== agent.id) return res.status(403).json({ error: 'Only the publisher can settle' });

    const executor = await store.agents.findById(task.claimed_by);
    const publisher = await store.agents.findById(task.publisher_id);

    const tier = getReputationTier(executor?.reputation_score || 0);
    const payout = task.budget * tier.multiplier;

    if (executor) {
      await store.agents.update(executor.id, {
        balance_usd: (executor.balance_usd || 0) + payout,
        completed_tasks: (executor.completed_tasks || 0) + 1,
      });
    }
    if (publisher) {
      const remainder = task.budget - payout;
      const updates = {
        held_usd: Math.max(0, (publisher.held_usd || 0) - task.budget),
        completed_tasks: (publisher.completed_tasks || 0) + 1,
      };
      if (remainder > 0) updates.balance_usd = (publisher.balance_usd || 0) + remainder;
      await store.agents.update(publisher.id, updates);
    }

    await store.a2aTasks.update(task.id, {
      status: 'settled', settled_at: new Date().toISOString(), payout_amount: payout, payout_multiplier: tier.multiplier,
    });

    if (executor) await awardXp(executor.id, XP_ACTIONS.A2A_COMPLETION_BONUS, 'a2a_completion');

    res.json({ task_id: task.id, status: 'settled', payout_amount: payout, payout_multiplier: tier.multiplier, executor_id: task.claimed_by, settled_at: task.settled_at, message: `Payment of $${payout.toFixed(2)} released to executor.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to settle task' });
  }
});

router.post('/tasks/:id/cancel', agentAuth, async (req, res) => {
  try {
    const task = await store.a2aTasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const agent = req.agent;
    if (task.publisher_id !== agent.id) return res.status(403).json({ error: 'Only the publisher can cancel' });
    if (task.status !== 'open') return res.status(400).json({ error: `Cannot cancel task in ${task.status} state` });

    await store.a2aTasks.update(task.id, { status: 'cancelled' });

    const publisher = await store.agents.findById(task.publisher_id);
    if (publisher) {
      await store.agents.update(publisher.id, {
        balance_usd: (publisher.balance_usd || 0) + task.budget,
        held_usd: Math.max(0, (publisher.held_usd || 0) - task.budget),
      });
    }

    res.json({ task_id: task.id, status: 'cancelled', refunded: task.budget, message: 'Task cancelled. Budget refunded.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

router.post('/tasks/:id/release', agentAuth, async (req, res) => {
  try {
    const task = await store.a2aTasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'claimed') return res.status(400).json({ error: `Task is ${task.status}, cannot release` });

    const agent = req.agent;
    if (task.claimed_by !== agent.id) return res.status(403).json({ error: 'Only the claiming agent can release' });

    await store.a2aTasks.update(task.id, { status: 'open', claimed_by: null, claimed_at: null });

    res.json({ task_id: task.id, status: 'open', message: 'Task released. Returned to pool.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to release task' });
  }
});

module.exports = router;
