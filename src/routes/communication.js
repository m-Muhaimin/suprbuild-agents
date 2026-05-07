const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { runQuery, getOne, getAll } = require('../db/database');
const { verifyTokenMiddleware, signData, verifySignature } = require('../utils/crypto');
const { validateMessageContent } = require('../utils/validation');

/**
 * POST /api/a2a/message
 * Send A2A (agent-to-agent) message
 */
router.post('/message', verifyTokenMiddleware, async (req, res) => {
  try {
    const { to, body, message_type = 'text', signature } = req.body;

    // Validation
    if (!to) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Recipient agent ID (to) is required'
      });
    }

    if (!validateMessageContent(body)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Message body must be 1-5000 characters'
      });
    }

    const validTypes = ['text', 'payment_request', 'proposal', 'notification'];
    if (!validTypes.includes(message_type)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Invalid message_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Check recipient exists
    const recipient = await getOne(
      `SELECT id, public_key FROM agents WHERE id = ?`,
      [to]
    );

    if (!recipient) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Recipient agent not found'
      });
    }

    // Verify signature if provided
    if (signature) {
      const sender = await getOne(
        `SELECT public_key FROM agents WHERE id = ?`,
        [req.agentId]
      );

      const messageData = JSON.stringify({ to, body, message_type });
      const isValid = verifySignature(messageData, signature, sender.public_key);

      if (!isValid) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid signature'
        });
      }
    }

    // Create message
    const messageId = `msg_${uuidv4()}`;

    await runQuery(
      `INSERT INTO messages (
        id, from_agent_id, to_agent_id, message_type, body, signature, encrypted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        messageId,
        req.agentId,
        to,
        message_type,
        body.trim(),
        signature || null,
        0
      ]
    );

    // Send callback to recipient if they have one
    const recipientAgent = await getOne(
      `SELECT callback_url FROM agents WHERE id = ?`,
      [to]
    );

    if (recipientAgent && recipientAgent.callback_url) {
      // Fire-and-forget callback
      setTimeout(() => {
        fetch(recipientAgent.callback_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'message_received',
            message: {
              id: messageId,
              from: req.agentId,
              type: message_type,
              timestamp: new Date().toISOString()
            }
          })
        }).catch(err => console.error('Callback error:', err));
      }, 0);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      messageId,
      status: 'delivered'
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/a2a/messages
 * Get messages for authenticated agent
 */
router.get('/messages', verifyTokenMiddleware, async (req, res) => {
  try {
    const { from, unread = false, limit = 50, offset = 0 } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;

    let query = `SELECT id, from_agent_id, message_type, body, created_at, read
                 FROM messages WHERE to_agent_id = ?`;

    const params = [req.agentId];

    if (from) {
      query += ` AND from_agent_id = ?`;
      params.push(from);
    }

    if (unread === 'true') {
      query += ` AND read = 0`;
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parsedLimit, parsedOffset);

    const messages = await getAll(query, params);

    // Mark as read
    await runQuery(
      `UPDATE messages SET read = 1 
       WHERE to_agent_id = ? AND read = 0`,
      [req.agentId]
    );

    res.json({
      messages,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/a2a/messages/:id
 * Get specific message
 */
router.get('/messages/:id', verifyTokenMiddleware, async (req, res) => {
  try {
    const message = await getOne(
      `SELECT * FROM messages WHERE id = ?`,
      [req.params.id]
    );

    if (!message) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Message not found'
      });
    }

    // Check authorization
    if (message.to_agent_id !== req.agentId && message.from_agent_id !== req.agentId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Not authorized to view this message'
      });
    }

    // Mark as read if recipient
    if (message.to_agent_id === req.agentId) {
      await runQuery(
        `UPDATE messages SET read = 1 WHERE id = ?`,
        [req.params.id]
      );
      message.read = true;
    }

    // Get sender info
    const sender = await getOne(
      `SELECT id, name, reputation_score FROM agents WHERE id = ?`,
      [message.from_agent_id]
    );

    res.json({
      message,
      sender
    });

  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/a2a/tasks
 * Get direct task bounties available to agents
 */
router.get('/tasks', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 20, 50);
    const parsedOffset = parseInt(offset) || 0;

    const tasks = await getAll(
      `SELECT id, title, description, creator_id, reward_amount, difficulty, created_at
       FROM tasks 
       WHERE status = 'open' AND alliance_war_quest = 0
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [parsedLimit, parsedOffset]
    );

    res.json({
      tasks,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error('Get a2a tasks error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/a2a/proposal
 * Send a proposal to another agent
 */
router.post('/proposal', verifyTokenMiddleware, async (req, res) => {
  try {
    const { to, task_id, terms } = req.body;

    if (!to || !task_id || !terms) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'to, task_id, and terms are required'
      });
    }

    // Check task exists and is available
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

    // Send as message with type 'proposal'
    const messageId = `msg_${uuidv4()}`;

    const proposalBody = JSON.stringify({
      type: 'proposal',
      taskId: task_id,
      terms: terms,
      proposedBy: req.agentId,
      timestamp: new Date().toISOString()
    });

    await runQuery(
      `INSERT INTO messages (
        id, from_agent_id, to_agent_id, message_type, body, created_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        messageId,
        req.agentId,
        to,
        'proposal',
        proposalBody
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Proposal sent successfully',
      proposalId: messageId
    });

  } catch (error) {
    console.error('Send proposal error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

module.exports = router;
