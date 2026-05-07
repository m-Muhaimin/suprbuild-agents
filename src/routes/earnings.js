const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { runQuery, getOne, getAll } = require('../db/database');
const { verifyTokenMiddleware } = require('../utils/crypto');
const { validateTaskTitle, validateAmount } = require('../utils/validation');

/**
 * POST /api/earnings/tasks
 * Create a new task/quest
 */
router.post('/tasks', verifyTokenMiddleware, async (req, res) => {
  try {
    const { title, description, reward_amount, difficulty, due_date, alliance_war_quest } = req.body;

    // Validation
    if (!validateTaskTitle(title)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Title must be 5-200 characters'
      });
    }

    if (!validateAmount(reward_amount)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Reward must be between 0.01 and 1,000,000'
      });
    }

    const validDifficulties = ['easy', 'medium', 'hard'];
    if (difficulty && !validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Difficulty must be easy, medium, or hard'
      });
    }

    const taskId = `task_${uuidv4()}`;

    await runQuery(
      `INSERT INTO tasks (
        id, title, description, creator_id, status, reward_amount,
        currency, difficulty, due_date, alliance_war_quest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        taskId,
        title.trim(),
        description || null,
        req.agentId,
        'open',
        reward_amount,
        'USDC',
        difficulty || 'medium',
        due_date || null,
        alliance_war_quest ? 1 : 0
      ]
    );

    const task = await getOne(
      `SELECT * FROM tasks WHERE id = ?`,
      [taskId]
    );

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/earnings/tasks/:id/accept
 * Accept a task assignment
 */
router.post('/tasks/:id/accept', verifyTokenMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await getOne(
      `SELECT * FROM tasks WHERE id = ?`,
      [id]
    );

    if (!task) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Task not found'
      });
    }

    if (task.status !== 'open') {
      return res.status(400).json({
        error: 'Conflict',
        message: 'Task is not available for acceptance'
      });
    }

    if (task.creator_id === req.agentId) {
      return res.status(400).json({
        error: 'Conflict',
        message: 'Cannot accept your own task'
      });
    }

    // Update task
    await runQuery(
      `UPDATE tasks SET status = ?, assigned_to = ? WHERE id = ?`,
      ['in_progress', req.agentId, id]
    );

    const updated = await getOne(
      `SELECT * FROM tasks WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Task accepted successfully',
      task: updated
    });

  } catch (error) {
    console.error('Accept task error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/earnings/submit-quest
 * Submit completed quest (alliance war or regular)
 */
router.post('/submit-quest', verifyTokenMiddleware, async (req, res) => {
  try {
    const { task_id, completion_proof } = req.body;

    if (!task_id) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'task_id is required'
      });
    }

    const task = await getOne(
      `SELECT * FROM tasks WHERE id = ?`,
      [task_id]
    );

    if (!task) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Task not found'
      });
    }

    // Check authorization
    if (task.assigned_to !== req.agentId && task.creator_id !== req.agentId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Not authorized to submit this task'
      });
    }

    if (task.status !== 'in_progress') {
      return res.status(400).json({
        error: 'Conflict',
        message: 'Only in-progress tasks can be submitted'
      });
    }

    // Update task to completed
    await runQuery(
      `UPDATE tasks 
       SET status = ?, completed_by = ?, completion_proof = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      ['completed', req.agentId, completion_proof || null, task_id]
    );

    // Create transaction for reward payment
    const txId = `tx_${uuidv4()}`;
    await runQuery(
      `INSERT INTO transactions (
        id, to_agent_id, amount, currency, transaction_type, 
        status, task_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        txId,
        req.agentId,
        task.reward_amount,
        'USDC',
        'task_reward',
        'pending',
        task_id
      ]
    );

    // Update agent stats
    await runQuery(
      `UPDATE agents 
       SET total_tasks_completed = total_tasks_completed + 1,
           reputation_score = reputation_score + ?,
           total_earnings = total_earnings + ?
       WHERE id = ?`,
      [5, task.reward_amount, req.agentId] // +5 reputation per task
    );

    const updated = await getOne(
      `SELECT * FROM tasks WHERE id = ?`,
      [task_id]
    );

    res.json({
      success: true,
      message: 'Quest submitted successfully',
      task: updated,
      reward: {
        amount: task.reward_amount,
        currency: 'USDC',
        status: 'pending_payout'
      }
    });

  } catch (error) {
    console.error('Submit quest error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/earnings/quests
 * List available quests (including alliance-war)
 */
router.get('/quests', async (req, res) => {
  try {
    const { alliance, limit = 20, offset = 0 } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 20, 50);
    const parsedOffset = parseInt(offset) || 0;

    let query = `SELECT id, title, description, reward_amount, difficulty, 
                        alliance_war_quest, quest_pool_id, due_date
                 FROM tasks WHERE alliance_war_quest = 1 AND status = 'open'`;

    const params = [];

    if (alliance) {
      query += ` AND quest_pool_id = ?`;
      params.push(alliance);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parsedLimit, parsedOffset);

    const quests = await getAll(query, params);

    res.json({
      quests,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error('Get quests error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/earnings/myTasks
 * Get current agent's tasks
 */
router.get('/myTasks', verifyTokenMiddleware, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 100);

    let query = `SELECT * FROM tasks 
                 WHERE creator_id = ? OR assigned_to = ? OR completed_by = ?`;

    const params = [req.agentId, req.agentId, req.agentId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parsedLimit);

    const tasks = await getAll(query, params);

    res.json({
      tasks,
      count: tasks.length
    });

  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/earnings/alliance-war/quests
 * Get alliance war quests with pool info
 */
router.get('/alliance-war/quests', async (req, res) => {
  try {
    const pools = await getAll(
      `SELECT * FROM alliance_pools WHERE ends_at > CURRENT_TIMESTAMP`,
      []
    );

    const pooledQuests = {};

    for (const pool of pools) {
      const quests = await getAll(
        `SELECT id, title, description, reward_amount, difficulty
         FROM tasks 
         WHERE quest_pool_id = ? AND status = 'open'`,
        [pool.id]
      );

      pooledQuests[pool.alliance_name] = {
        pool: {
          id: pool.id,
          name: pool.alliance_name,
          color: pool.alliance_color,
          totalRewardPool: pool.total_reward_pool,
          endsAt: pool.ends_at
        },
        quests
      };
    }

    res.json({
      allianceQuests: pooledQuests
    });

  } catch (error) {
    console.error('Get alliance quests error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

module.exports = router;
