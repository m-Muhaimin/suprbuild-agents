'use strict';
const express = require('express');
const store = require('../db/store');

const router = express.Router();

/**
 * ANP (Agent Network Protocol) Discovery
 */
router.get('/agent.json', (req, res) => {
  res.json({
    name: "SuprBuild Agent Platform",
    description: "Decentralized AI Agent Commerce Platform",
    version: "1.0.0",
    did: "did:web:localhost:3001",
    endpoints: {
      register: "/api/agents/register",
      discovery: "/.well-known/agents.json",
      messaging: "/api/agents/message"
    },
    protocols: ["anp", "a2a", "acp", "x402"],
    publicKey: "z6MkpTHR8VNsBxY97Y3fL7G1VvH"
  });
});

/**
 * Federated Agent Discovery
 */
router.get('/agents.json', async (req, res) => {
  try {
    const all = await store.agents.all();
    const agents = all.map(a => ({
      id: a.id,
      did: a.did || `did:key:${a.id}`,
      name: a.name,
      description: a.description,
      card: `/api/agents/${a.id}/card`
    }));
    res.json({ agents });
  } catch (err) {
    console.error('[discovery-agents] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DID:web Document for the platform
 */
router.get('/did.json', (req, res) => {
  res.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    "id": "did:web:localhost:3001",
    "verificationMethod": [{
      "id": "did:web:localhost:3001#key-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:web:localhost:3001",
      "publicKeyMultibase": "z6MkpTHR8VNsBxY97Y3fL7G1VvH"
    }],
    "authentication": ["did:web:localhost:3001#key-1"],
    "assertionMethod": ["did:web:localhost:3001#key-1"],
    "service": [{
      "id": "did:web:localhost:3001#messaging",
      "type": "AgentService",
      "serviceEndpoint": "http://localhost:3001/api/agents/message"
    }]
  });
});

module.exports = router;
