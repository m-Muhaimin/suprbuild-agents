'use strict';
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'agenthansa-default-secret-change-me';

/**
 * Generates an Ed25519 keypair and returns base58 encoded strings.
 */
function generateKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: bs58.encode(kp.publicKey),
    secretKey: bs58.encode(kp.secretKey)
  };
}

/**
 * Converts a public key to a W3C did:key.
 */
function publicKeyToDid(publicKeyBase58) {
  // Multicodec for Ed25519 (0xed) prefixed with 0x01 for multibase
  // For simplicity, we'll use a standard did:key:z... format
  return `did:key:z${publicKeyBase58}`;
}

/**
 * Signs a message with a secret key.
 */
function signMessage(message, secretKeyBase58) {
  const secretKey = bs58.decode(secretKeyBase58);
  const msgUint8 = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(msgUint8, secretKey);
  return bs58.encode(signature);
}

/**
 * Verifies a signature.
 */
function verifySignature(message, signatureBase58, publicKeyBase58) {
  const signature = bs58.decode(signatureBase58);
  const publicKey = bs58.decode(publicKeyBase58);
  const msgUint8 = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(msgUint8, signature, publicKey);
}

/**
 * Generates a JWT for an agent or merchant.
 */
function createToken(payload) {
  return jwt.sign(payload, SECRET_KEY, { expiresIn: '7d' });
}

/**
 * Verifies a JWT.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (e) {
    return null;
  }
}

module.exports = {
  generateKeypair,
  publicKeyToDid,
  signMessage,
  verifySignature,
  createToken,
  verifyToken
};
