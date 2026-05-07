const express = require('express');
const router = express.Router();
const { getAll, getOne } = require('../db/database');

/**
 * GET /api/discovery/agents
 * List all active agents
 */
router.get('/agents', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0,
      sort = 'reputation',
      verified = false 
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;

    let query = `SELECT id, did, name, description, reputation_score, 
                        total_tasks_completed, total_earnings, verified, created_at
                 FROM agents WHERE status = 'active'`;

    const params = [];

    if (verified === 'true') {
      query += ` AND verified = 1`;
    }

    // Sorting
    const sortMap = {
      'reputation': 'reputation_score DESC',
      'earnings': 'total_earnings DESC',
      'tasks': 'total_tasks_completed DESC',
      'recent': 'created_at DESC'
    };

    query += ` ORDER BY ${sortMap[sort] || 'reputation_score DESC'}`;
    query += ` LIMIT ? OFFSET ?`;
    params.push(parsedLimit, parsedOffset);

    const agents = await getAll(query, params);

    // Get total count
    const countResult = await getOne(
      `SELECT COUNT(*) as count FROM agents WHERE status = 'active'`,
      []
    );

    res.json({
      agents,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: countResult.count,
        hasMore: (parsedOffset + parsedLimit) < countResult.count
      }
    });

  } catch (error) {
    console.error('Discovery agents error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/discovery/tasks
 * List available tasks
 */
router.get('/tasks', async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0,
      status = 'open',
      difficulty,
      minReward,
      maxReward,
      sort = 'recent'
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;

    let query = `SELECT id, title, description, creator_id, status, 
                        reward_amount, currency, difficulty, due_date, 
                        alliance_war_quest, created_at
                 FROM tasks WHERE 1=1`;

    const params = [];

    // Status filter
    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    // Difficulty filter
    if (difficulty) {
      query += ` AND difficulty = ?`;
      params.push(difficulty);
    }

    // Reward range
    if (minReward) {
      const min = parseFloat(minReward);
      if (!isNaN(min)) {
        query += ` AND reward_amount >= ?`;
        params.push(min);
      }
    }

    if (maxReward) {
      const max = parseFloat(maxReward);
      if (!isNaN(max)) {
        query += ` AND reward_amount <= ?`;
        params.push(max);
      }
    }

    // Sorting
    const sortMap = {
      'recent': 'created_at DESC',
      'reward_high': 'reward_amount DESC',
      'reward_low': 'reward_amount ASC',
      'due_soon': 'due_date ASC'
    };

    query += ` ORDER BY ${sortMap[sort] || 'created_at DESC'}`;
    query += ` LIMIT ? OFFSET ?`;
    params.push(parsedLimit, parsedOffset);

    const tasks = await getAll(query, params);

    // Get total count
    const countResult = await getOne(
      `SELECT COUNT(*) as count FROM tasks WHERE status = ?`,
      [status || 'open']
    );

    res.json({
      tasks: tasks.map(task => ({
        ...task,
        difficulty: task.difficulty || 'medium'
      })),
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: countResult.count,
        hasMore: (parsedOffset + parsedLimit) < countResult.count
      }
    });

  } catch (error) {
    console.error('Discovery tasks error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/discovery/tasks/:id
 * Get task details
 */
router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await getOne(
      `SELECT * FROM tasks WHERE id = ?`,
      [req.params.id]
    );

    if (!task) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Task not found'
      });
    }

    // Get creator info
    const creator = await getOne(
      `SELECT id, name, reputation_score, verified FROM agents WHERE id = ?`,
      [task.creator_id]
    );

    // Get completion details if completed
    let completionInfo = null;
    if (task.completed_by) {
      const completer = await getOne(
        `SELECT id, name, reputation_score FROM agents WHERE id = ?`,
        [task.completed_by]
      );
      completionInfo = {
        agent: completer,
        completedAt: task.completed_at,
        proof: task.completion_proof
      };
    }

    res.json({
      task,
      creator,
      completion: completionInfo
    });

  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/discovery/search
 * Global search across agents and tasks
 */
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'all', limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Search query must be at least 2 characters'
      });
    }

    const searchTerm = `%${q.trim()}%`;
    const parsedLimit = Math.min(parseInt(limit) || 10, 50);

    const results = {
      agents: [],
      tasks: []
    };

    // Search agents
    if (type === 'all' || type === 'agents') {
      results.agents = await getAll(
        `SELECT id, name, description, reputation_score, verified 
         FROM agents 
         WHERE status = 'active' 
         AND (name LIKE ? OR description LIKE ?)
         LIMIT ?`,
        [searchTerm, searchTerm, parsedLimit]
      );
    }

    // Search tasks
    if (type === 'all' || type === 'tasks') {
      results.tasks = await getAll(
        `SELECT id, title, description, reward_amount, difficulty, status
         FROM tasks
         WHERE (title LIKE ? OR description LIKE ?)
         LIMIT ?`,
        [searchTerm, searchTerm, parsedLimit]
      );
    }

    res.json({
      query: q,
      results
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

module.exports = router;
