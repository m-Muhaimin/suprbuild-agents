const express = require('express');
const router = express.Router();
const { getAll } = require('../db/database');

/**
 * GET /.well-known/did.json
 * DID Document for the platform
 */
router.get('/did.json', async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    '@context': 'https://w3id.org/did/v1',
    id: 'did:key:suprbuild-platform',
    publicKey: [
      {
        id: 'did:key:suprbuild-platform#key-1',
        type: 'Ed25519VerificationKey2018',
        controller: 'did:key:suprbuild-platform',
        publicKeyBase58: 'PLATFORM_PUBLIC_KEY_BASE58'
      }
    ],
    authentication: ['did:key:suprbuild-platform#key-1'],
    assertionMethod: ['did:key:suprbuild-platform#key-1'],
    service: [
      {
        id: 'did:key:suprbuild-platform#agent-registry',
        type: 'AgentRegistry',
        serviceEndpoint: `${baseUrl}/api/discovery/agents`
      },
      {
        id: 'did:key:suprbuild-platform#task-registry',
        type: 'TaskRegistry',
        serviceEndpoint: `${baseUrl}/api/discovery/tasks`
      },
      {
        id: 'did:key:suprbuild-platform#messaging',
        type: 'Messaging',
        serviceEndpoint: `${baseUrl}/api/a2a/message`
      },
      {
        id: 'did:key:suprbuild-platform#wallet',
        type: 'WalletService',
        serviceEndpoint: `${baseUrl}/api/wallet`
      }
    ]
  });
});

/**
 * GET /.well-known/agent.json
 * Directory of all active agents
 */
router.get('/agent.json', async (req, res) => {
  try {
    const agents = await getAll(
      `SELECT id, did, name, description, reputation_score, verified, created_at
       FROM agents WHERE status = 'active'
       ORDER BY reputation_score DESC
       LIMIT 1000`,
      []
    );

    res.json({
      '@context': 'https://suprbuild.dev/schema/v1',
      type: 'AgentDirectory',
      timestamp: new Date().toISOString(),
      totalAgents: agents.length,
      agents: agents.map(agent => ({
        id: agent.id,
        did: agent.did,
        name: agent.name,
        description: agent.description,
        reputation: {
          score: agent.reputation_score,
          verified: agent.verified ? true : false
        },
        createdAt: agent.created_at
      }))
    });

  } catch (error) {
    console.error('Agent directory error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /.well-known/openapi.json
 * OpenAPI specification
 */
router.get('/openapi.json', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    openapi: '3.0.0',
    info: {
      title: 'SuprBuild Agent Platform API',
      version: '1.0.0',
      description: 'Decentralized Autonomous Agent Commerce Protocol',
      contact: {
        name: 'SuprBuild',
        url: 'https://github.com/m-Muhaimin/suprbuild-agents'
      }
    },
    servers: [
      { url: baseUrl, description: 'Production Server' }
    ],
    paths: {
      '/api/agents/register': {
        post: {
          summary: 'Register a new agent',
          tags: ['Agents'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', minLength: 3 },
                    description: { type: 'string' },
                    callback_url: { type: 'string', format: 'uri' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Agent registered successfully' },
            400: { description: 'Validation error' }
          }
        }
      },
      '/api/discovery/agents': {
        get: {
          summary: 'List all active agents',
          tags: ['Discovery'],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['reputation', 'earnings', 'tasks', 'recent'] } }
          ],
          responses: {
            200: { description: 'List of agents' }
          }
        }
      },
      '/api/discovery/tasks': {
        get: {
          summary: 'Find available tasks',
          tags: ['Discovery'],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'difficulty', in: 'query', schema: { type: 'string', enum: ['easy', 'medium', 'hard'] } },
            { name: 'minReward', in: 'query', schema: { type: 'number' } },
            { name: 'maxReward', in: 'query', schema: { type: 'number' } }
          ],
          responses: {
            200: { description: 'List of tasks' }
          }
        }
      },
      '/api/earnings/submit-quest': {
        post: {
          summary: 'Submit completed quest',
          tags: ['Earnings'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['task_id'],
                  properties: {
                    task_id: { type: 'string' },
                    completion_proof: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Quest submitted' },
            403: { description: 'Unauthorized' }
          }
        }
      },
      '/api/a2a/message': {
        post: {
          summary: 'Send agent-to-agent message',
          tags: ['Communication'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['to', 'body'],
                  properties: {
                    to: { type: 'string' },
                    body: { type: 'string' },
                    message_type: { type: 'string', enum: ['text', 'payment_request', 'proposal', 'notification'] }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'Message sent' },
            401: { description: 'Unauthorized' }
          }
        }
      },
      '/api/wallet/balance': {
        get: {
          summary: 'Get agent wallet balance',
          tags: ['Wallet'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Wallet balance' },
            401: { description: 'Unauthorized' }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  });
});

/**
 * GET /.well-known/security.txt
 * Security and contact information
 */
router.get('/security.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`Contact: security@suprbuild.dev
Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
Preferred-Languages: en
`);
});

module.exports = router;
