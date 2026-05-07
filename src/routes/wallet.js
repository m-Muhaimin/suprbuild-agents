const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { runQuery, getOne, getAll } = require('../db/database');
const { verifyTokenMiddleware } = require('../utils/crypto');
const { validateAmount } = require('../utils/validation');

/**
 * GET /api/wallet/balance
 * Get agent wallet balance
 */
router.get('/balance', verifyTokenMiddleware, async (req, res) => {
  try {
    // Calculate balance from transactions
    const balance = await getOne(
      `SELECT 
        COALESCE(SUM(CASE WHEN to_agent_id = ? AND status = 'completed' THEN amount ELSE 0 END), 0) as earned,
        COALESCE(SUM(CASE WHEN from_agent_id = ? AND status = 'completed' THEN amount ELSE 0 END), 0) as spent
       FROM transactions`,
      [req.agentId, req.agentId]
    );

    const availableBalance = (balance.earned || 0) - (balance.spent || 0);

    // Get pending transactions
    const pending = await getAll(
      `SELECT id, amount, transaction_type, status, created_at
       FROM transactions 
       WHERE (to_agent_id = ? OR from_agent_id = ?) AND status = 'pending'`,
      [req.agentId, req.agentId]
    );

    res.json({
      wallet: {
        agentId: req.agentId,
        currency: 'USDC',
        balances: {
          earned: balance.earned || 0,
          spent: balance.spent || 0,
          available: availableBalance
        },
        pending: pending.length
      }
    });

  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/wallet/transactions
 * Get transaction history
 */
router.get('/transactions', verifyTokenMiddleware, async (req, res) => {
  try {
    const { 
      type = 'all', 
      status = 'all',
      limit = 50, 
      offset = 0 
    } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 50, 100);
    const parsedOffset = parseInt(offset) || 0;

    let query = `SELECT * FROM transactions 
                 WHERE (to_agent_id = ? OR from_agent_id = ?)`;

    const params = [req.agentId, req.agentId];

    if (type !== 'all') {
      query += ` AND transaction_type = ?`;
      params.push(type);
    }

    if (status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parsedLimit, parsedOffset);

    const transactions = await getAll(query, params);

    res.json({
      transactions,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/wallet/transfer
 * Transfer USDC to another agent
 */
router.post('/transfer', verifyTokenMiddleware, async (req, res) => {
  try {
    const { to_agent_id, amount } = req.body;

    // Validation
    if (!to_agent_id) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'to_agent_id is required'
      });
    }

    if (!validateAmount(amount)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid amount'
      });
    }

    // Check recipient exists
    const recipient = await getOne(
      `SELECT id FROM agents WHERE id = ?`,
      [to_agent_id]
    );

    if (!recipient) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Recipient agent not found'
      });
    }

    // Check balance
    const balance = await getOne(
      `SELECT 
        COALESCE(SUM(CASE WHEN to_agent_id = ? THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN from_agent_id = ? THEN amount ELSE 0 END), 0) as available
       FROM transactions WHERE status = 'completed'`,
      [req.agentId, req.agentId]
    );

    if ((balance.available || 0) < amount) {
      return res.status(400).json({
        error: 'Insufficient Balance',
        message: `Insufficient balance. Available: ${balance.available || 0} USDC`
      });
    }

    // Create transaction
    const txId = `tx_${uuidv4()}`;

    await runQuery(
      `INSERT INTO transactions (
        id, from_agent_id, to_agent_id, amount, currency, transaction_type, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [txId, req.agentId, to_agent_id, amount, 'USDC', 'transfer', 'pending']
    );

    res.status(201).json({
      success: true,
      message: 'Transfer initiated',
      transaction: {
        id: txId,
        from: req.agentId,
        to: to_agent_id,
        amount,
        currency: 'USDC',
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/wallet/transactions/:txId
 * Get transaction details
 */
router.get('/transactions/:txId', verifyTokenMiddleware, async (req, res) => {
  try {
    const tx = await getOne(
      `SELECT * FROM transactions WHERE id = ?`,
      [req.params.txId]
    );

    if (!tx) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Transaction not found'
      });
    }

    // Check authorization
    if (tx.to_agent_id !== req.agentId && tx.from_agent_id !== req.agentId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Not authorized to view this transaction'
      });
    }

    // Get related agent info
    let fromAgent = null;
    let toAgent = null;

    if (tx.from_agent_id) {
      fromAgent = await getOne(
        `SELECT id, name, reputation_score FROM agents WHERE id = ?`,
        [tx.from_agent_id]
      );
    }

    toAgent = await getOne(
      `SELECT id, name, reputation_score FROM agents WHERE id = ?`,
      [tx.to_agent_id]
    );

    res.json({
      transaction: tx,
      from: fromAgent,
      to: toAgent
    });

  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/wallet/withdraw
 * Initiate withdrawal to external wallet
 */
router.post('/withdraw', verifyTokenMiddleware, async (req, res) => {
  try {
    const { amount, address } = req.body;

    // Validation
    if (!validateAmount(amount)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid amount'
      });
    }

    if (!address || address.length < 20) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid wallet address'
      });
    }

    // Check balance
    const balance = await getOne(
      `SELECT 
        COALESCE(SUM(CASE WHEN to_agent_id = ? THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN from_agent_id = ? THEN amount ELSE 0 END), 0) as available
       FROM transactions WHERE status = 'completed'`,
      [req.agentId, req.agentId]
    );

    if ((balance.available || 0) < amount) {
      return res.status(400).json({
        error: 'Insufficient Balance',
        message: `Insufficient balance. Available: ${balance.available || 0} USDC`
      });
    }

    // Create withdrawal transaction
    const txId = `tx_${uuidv4()}`;

    await runQuery(
      `INSERT INTO transactions (
        id, from_agent_id, to_agent_id, amount, currency, transaction_type, status, created_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [txId, req.agentId, amount, 'USDC', 'withdrawal', 'pending']
    );

    res.status(201).json({
      success: true,
      message: 'Withdrawal initiated',
      transaction: {
        id: txId,
        type: 'withdrawal',
        amount,
        currency: 'USDC',
        address: address.substring(0, 6) + '...' + address.substring(address.length - 4),
        status: 'pending',
        note: 'Withdrawal requests are processed within 24 hours'
      }
    });

  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/wallet/stats
 * Get wallet statistics
 */
router.get('/stats', verifyTokenMiddleware, async (req, res) => {
  try {
    const stats = await getOne(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_transactions,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_transactions,
        SUM(CASE WHEN to_agent_id = ? AND status = 'completed' THEN amount ELSE 0 END) as total_earned,
        SUM(CASE WHEN from_agent_id = ? AND status = 'completed' THEN amount ELSE 0 END) as total_spent
       FROM transactions`,
      [req.agentId, req.agentId]
    );

    res.json({
      statistics: {
        ...stats,
        netBalance: (stats.total_earned || 0) - (stats.total_spent || 0)
      }
    });

  } catch (error) {
    console.error('Get wallet stats error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

module.exports = router;
