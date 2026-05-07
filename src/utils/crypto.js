const crypto = require('crypto');
const nacl = require('tweetnacl');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const DID_NAMESPACE = 'did:key:z6Mk';

/**
 * Generate Ed25519 key pair for DID:key
 */
function generateKeyPair() {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    secretKey: Buffer.from(keyPair.secretKey).toString('hex')
  };
}

/**
 * Generate DID:key identifier
 * Format: did:key:z6Mk{public_key_multibase}
 */
function generateDID(publicKey) {
  // Simplified DID:key format
  // In production, use proper multibase encoding
  const hash = crypto
    .createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .substring(0, 16);
  
  return `${DID_NAMESPACE}${hash}`;
}

/**
 * Generate JWT token for agent
 */
function generateJWT(agentId, did) {
  const payload = {
    sub: agentId,
    did: did,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
  };

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256'
  });
}

/**
 * Verify JWT token
 */
function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });
  } catch (error) {
    return null;
  }
}

/**
 * Sign data with agent's secret key
 */
function signData(data, secretKey) {
  const secretKeyBuffer = Buffer.from(secretKey, 'hex');
  const dataBuffer = typeof data === 'string' 
    ? Buffer.from(data, 'utf-8') 
    : Buffer.from(JSON.stringify(data));

  try {
    const signature = nacl.sign.detached(dataBuffer, secretKeyBuffer);
    return Buffer.from(signature).toString('hex');
  } catch (error) {
    throw new Error('Failed to sign data');
  }
}

/**
 * Verify signature with public key
 */
function verifySignature(data, signature, publicKey) {
  const publicKeyBuffer = Buffer.from(publicKey, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  const dataBuffer = typeof data === 'string'
    ? Buffer.from(data, 'utf-8')
    : Buffer.from(JSON.stringify(data));

  try {
    return nacl.sign.detached.verify(dataBuffer, signatureBuffer, publicKeyBuffer);
  } catch (error) {
    return false;
  }
}

/**
 * Extract auth token from request header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Middleware to verify JWT token
 */
function verifyTokenMiddleware(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization token'
    });
  }

  const decoded = verifyJWT(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }

  req.agent = decoded;
  req.agentId = decoded.sub;
  next();
}

/**
 * Generate secure random token
 */
function generateRandomToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash password (for admin operations, if needed)
 */
function hashPassword(password) {
  return crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');
}

/**
 * Create agent credentials object
 */
function createAgentCredentials() {
  const agentId = `agent_${uuidv4()}`;
  const { publicKey, secretKey } = generateKeyPair();
  const did = generateDID(publicKey);
  const token = generateJWT(agentId, did);

  return {
    id: agentId,
    did,
    publicKey,
    secretKey,
    token,
    createdAt: new Date().toISOString()
  };
}

/**
 * Validate DID format
 */
function isValidDID(did) {
  return did.startsWith(DID_NAMESPACE) && did.length > DID_NAMESPACE.length;
}

module.exports = {
  generateKeyPair,
  generateDID,
  generateJWT,
  verifyJWT,
  signData,
  verifySignature,
  extractToken,
  verifyTokenMiddleware,
  generateRandomToken,
  hashPassword,
  createAgentCredentials,
  isValidDID
};
