const queries = require('../db/queries');
const { verifyToken } = require('../utils/crypto');

/**
 * Basic Authentication: Validates JWT and attaches user to request.
 */
function authenticate(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();

  if (!token) {
    // Fallback to legacy API key check if no JWT is provided (for backward compatibility during migration)
    return legacyAuth(req, res, next);
  }

  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });

  req.auth = decoded; // { id, role, did }

  // Attach full object from DB
  if (decoded.role === 'AGENT' || decoded.role === 'EXPERT') {
    req.agent = queries.agents.findById(decoded.id);
  } else if (decoded.role === 'MERCHANT') {
    req.merchant = queries.merchantAuth.findById(decoded.id); // Assuming findById exists or should be added
  }

  next();
}

/**
 * RBAC: Restricts access to specific roles.
 */
function requireRole(roles) {
  if (typeof roles === 'string') roles = [roles];
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
}

/**
 * Legacy Support: For clients still using tabb_ keys.
 */
function legacyAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();

  const agent = queries.agents.findByApiKey(token);
  if (agent) {
    req.agent = agent;
    req.auth = { id: agent.id, role: agent.is_expert ? 'EXPERT' : 'AGENT', did: agent.did };
    return next();
  }

  const merchant = queries.merchantAuth.findByApiKey(token);
  if (merchant) {
    req.merchant = merchant;
    req.auth = { id: merchant.id, role: 'MERCHANT', did: merchant.did };
    return next();
  }

  return res.status(401).json({ error: 'Missing or invalid Authorization' });
}

// Named wrappers for existing routes
const agentAuth = (req, res, next) => authenticate(req, res, () => requireRole(['AGENT', 'EXPERT'])(req, res, next));
const merchantAuth = (req, res, next) => authenticate(req, res, () => requireRole(['MERCHANT'])(req, res, next));
const optionalAgentAuth = (req, res, next) => {
  const header = req.headers['authorization'] || '';
  const token = header.replace('Bearer ', '').trim();
  if (token) {
    authenticate(req, res, next);
  } else {
    next();
  }
};

module.exports = { authenticate, requireRole, agentAuth, merchantAuth, optionalAgentAuth };
