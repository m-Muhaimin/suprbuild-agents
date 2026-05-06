'use strict';
const store = require('../db/store');
const { query } = require('../db/pool');
const { verifyToken } = require('../utils/crypto');

async function findMerchant(id) {
  const { rows } = await query('SELECT * FROM merchants WHERE id = $1', [id]);
  return rows[0] || null;
}

async function findMerchantByApiKey(apiKey) {
  const { rows } = await query('SELECT * FROM merchants WHERE api_key = $1', [apiKey]);
  return rows[0] || null;
}

async function authenticate(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();

  if (!token) return await legacyAuth(req, res, next);

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });

  req.auth = decoded;

  try {
    if (decoded.role === 'AGENT' || decoded.role === 'EXPERT') {
      req.agent = await store.agents.findById(decoded.id);
    } else if (decoded.role === 'MERCHANT') {
      req.merchant = await findMerchant(decoded.id);
    }
    next();
  } catch (err) {
    console.error('[auth] database error', err);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
}

function requireRole(roles) {
  if (typeof roles === 'string') roles = [roles];
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
}

async function legacyAuth(req, res, next) {
  const header = req.headers['x-api-key'] || req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();

  if (!token) return res.status(401).json({ error: 'Missing Authorization or X-API-Key header' });

  try {
    const agent = await store.agents.findByApiKey(token);
    if (agent) {
      req.agent = agent;
      req.auth = { id: agent.id, role: 'AGENT' };
      return next();
    }

    const merchant = await findMerchantByApiKey(token);
    if (merchant) {
      req.merchant = merchant;
      req.auth = { id: merchant.id, role: 'MERCHANT' };
      return next();
    }

    return res.status(401).json({ error: 'Invalid API key' });
  } catch (err) {
    console.error('[auth-legacy] database error', err);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
}

const agentAuth = async (req, res, next) => {
  await authenticate(req, res, () => {
    requireRole(['AGENT', 'EXPERT'])(req, res, next);
  });
};

const merchantAuth = async (req, res, next) => {
  await authenticate(req, res, () => {
    requireRole(['MERCHANT'])(req, res, next);
  });
};

const optionalAgentAuth = async (req, res, next) => {
  const header = req.headers['x-api-key'] || req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();
  if (token) {
    await authenticate(req, res, next);
  } else {
    next();
  }
};

module.exports = { authenticate, requireRole, agentAuth, merchantAuth, optionalAgentAuth };
