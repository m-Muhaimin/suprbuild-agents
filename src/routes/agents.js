const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { runQuery, getOne, getAll } = require('../db/database');
const { createAgentCredentials, verifyTokenMiddleware } = require('../utils/crypto');
const { validateEmail, validateCallbackUrl } = require('../utils/validation');

/**
 * POST /api/agents/register
 * Register a new agent
 */
router.post('/register', async (req, res) => {
  try {
    const { name, description, callback_url } = req.body;

    // Validation
    if (!name || name.trim().length < 3) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Agent name must be at least 3 characters'
      });
    }

    // Validate callback URL if provided
    if (callback_url && !validateCallbackUrl(callback_url)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid callback URL format'
      });
    }

    // Generate credentials
    const credentials = createAgentCredentials();

    // Insert into database
    await runQuery(
      `INSERT INTO agents (
        id, did, name, description, public_key, secret_key, 
        callback_url, jwt_token, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        credentials.id,
        credentials.did,
        name.trim(),
        description || null,
        credentials.publicKey,
        credentials.secretKey,
        callback_url || null,
        credentials.token,
        'active'
      ]
    );

    // Return credentials (only once!)
    res.status(201).json({
      success: true,
      message: 'Agent registered successfully',
      agent: {
        id: credentials.id,
        did: credentials.did,
        name: name.trim(),
        status: 'active',
        createdAt: credentials.createdAt
      },
      credentials: {
        token: credentials.token,
        publicKey: credentials.publicKey,
        secretKey: credentials.secretKey,
        warning: 'SAVE YOUR CREDENTIALS! They will not be shown again.'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id
 * Get agent details
 */
router.get('/:id', async (req, res) => {
  try {
    const agent = await getOne(
      `SELECT id, did, name, description, status, reputation_score, 
              total_tasks_completed, total_earnings, verified, created_at, 
              last_activity FROM agents WHERE id = ?`,
      [req.params.id]
    );

    if (!agent) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found'
      });
    }

    res.json({
      agent,
      verified: agent.verified ? true : false
    });

  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/card
 * Get agent capability card (public profile)
 */
router.get('/:id/card', async (req, res) => {
  try {
    const agent = await getOne(
      `SELECT id, did, name, description, reputation_score, 
              total_tasks_completed, total_earnings, verified FROM agents WHERE id = ?`,
      [req.params.id]
    );

    if (!agent) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found'
      });
    }

    // Get recent activity
    const recentTasks = await getAll(
      `SELECT id, title, status, reward_amount FROM tasks 
       WHERE creator_id = ? OR completed_by = ?
       ORDER BY created_at DESC LIMIT 5`,
      [agent.id, agent.id]
    );

    res.json({
      agent: {
        id: agent.id,
        did: agent.did,
        name: agent.name,
        description: agent.description,
        reputation: {
          score: agent.reputation_score,
          tasksCompleted: agent.total_tasks_completed,
          verified: agent.verified ? true : false
        },
        earnings: {
          total: agent.total_earnings,
          currency: 'USDC'
        },
        recentActivity: recentTasks
      }
    });

  } catch (error) {
    console.error('Get card error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * PUT /api/agents/:id
 * Update agent profile (requires auth)
 */
router.put('/:id', verifyTokenMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, callback_url } = req.body;

    // Check authorization
    if (req.agentId !== id) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot update other agents'
      });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (callback_url !== undefined) {
      if (callback_url && !validateCallbackUrl(callback_url)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid callback URL format'
        });
      }
      updates.push('callback_url = ?');
      params.push(callback_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'No updates provided'
      });
    }

    updates.push('last_activity = CURRENT_TIMESTAMP');
    params.push(id);

    await runQuery(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const updated = await getOne(
      `SELECT id, did, name, description, status, reputation_score FROM agents WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Agent updated successfully',
      agent: updated
    });

  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/:id/stats
 * Get detailed agent statistics
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const agent = await getOne(
      `SELECT * FROM agents WHERE id = ?`,
      [req.params.id]
    );

    if (!agent) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found'
      });
    }

    // Get task statistics
    const taskStats = await getOne(
      `SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open
       FROM tasks WHERE creator_id = ? OR completed_by = ?`,
      [agent.id, agent.id]
    );

    // Get earnings breakdown
    const earningsStats = await getOne(
      `SELECT 
        SUM(CASE WHEN to_agent_id = ? THEN amount ELSE 0 END) as total_earned,
        SUM(CASE WHEN from_agent_id = ? THEN amount ELSE 0 END) as total_paid,
        COUNT(*) as total_transactions
       FROM transactions WHERE status = 'completed'`,
      [agent.id, agent.id]
    );

    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        reputation_score: agent.reputation_score,
        verified: agent.verified
      },
      stats: {
        tasks: taskStats,
        earnings: earningsStats,
        createdAt: agent.created_at,
        lastActivity: agent.last_activity
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/agents/me
 * Get current authenticated agent details
 */
router.get('/me', verifyTokenMiddleware, async (req, res) => {
  try {
    const agent = await getOne(
      `SELECT id, did, name, description, status, reputation_score, 
              total_tasks_completed, total_earnings, verified, created_at, 
              last_activity, callback_url, public_key
       FROM agents WHERE id = ?`,
      [req.agentId]
    );

    if (!agent) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Agent not found'
      });
    }

    res.json({
      id: agent.id,
      did: agent.did,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      reputation_score: agent.reputation_score,
      total_tasks_completed: agent.total_tasks_completed,
      total_earnings: agent.total_earnings,
      verified: agent.verified ? true : false,
      created_at: agent.created_at,
      last_activity: agent.last_activity,
      callback_url: agent.callback_url,
      balance_usd: agent.total_earnings - (await getOne(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE from_agent_id = ?`,
        [agent.id]
      )).total
    });

  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

module.exports = router;
