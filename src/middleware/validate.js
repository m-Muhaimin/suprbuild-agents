'use strict';
const Joi = require('joi');

/**
 * Express middleware factory that validates req.body against a Joi schema.
 * Usage: router.post('/route', validate(schema), handler);
 */
function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map(d => d.message);
      return res.status(400).json({
        error: 'Validation failed',
        details,
      });
    }

    req[property] = value;
    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMAS — Agents
// ═══════════════════════════════════════════════════════════════════════════

const agentRegister = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(500).allow('').default(''),
  referral_code: Joi.string().trim().max(20).allow(null, ''),
  capabilities: Joi.array().items(Joi.string().trim().max(50)).max(20).default([]),
  balance_usd: Joi.number().min(0).max(1000000).default(0),
});

const agentUpdate = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  description: Joi.string().trim().max(500).allow(''),
  callback_url: Joi.string().uri().max(500),
}).min(1);

const allianceUpdate = Joi.object({
  alliance: Joi.string().valid('red', 'blue', 'green').required(),
});

const capabilitiesUpdate = Joi.object({
  capabilities: Joi.array().items(Joi.string().trim().max(50)).min(1).max(20).required(),
});

const walletUpdate = Joi.object({
  wallet_address: Joi.string().trim().min(20).max(100).required(),
});

const fluxaWalletUpdate = Joi.object({
  fluxa_agent_id: Joi.string().trim().min(1).max(100).required(),
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMAS — A2A Tasks
// ═══════════════════════════════════════════════════════════════════════════

const a2aTaskCreate = Joi.object({
  type: Joi.string().trim().min(1).max(50).required(),
  spec: Joi.object({
    brief: Joi.string().trim().min(1).max(2000).required(),
    deliverable: Joi.string().trim().max(2000).allow(''),
    constraints: Joi.string().trim().max(2000).allow(''),
  }).required(),
  budget: Joi.number().min(0.50).max(100000).required(),
  deadline_hours: Joi.number().integer().min(1).max(720),
  verification: Joi.string().valid('publisher_review', 'auto', 'community').default('publisher_review'),
});

const a2aTaskSubmit = Joi.object({
  deliverable: Joi.string().trim().min(1).max(10000).required(),
  proof_url: Joi.string().uri().max(500).allow(null, ''),
});

const a2aTaskVerify = Joi.object({
  approved: Joi.boolean().required(),
  feedback: Joi.string().trim().max(2000).allow(''),
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMAS — Forum
// ═══════════════════════════════════════════════════════════════════════════

const forumPostCreate = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  content: Joi.string().trim().min(50).max(10000).required(),
  category: Joi.string().trim().max(50).default('general'),
  alliance_only: Joi.boolean().default(false),
});

const forumCommentCreate = Joi.object({
  content: Joi.string().trim().min(1).max(5000).required(),
});

const forumVote = Joi.object({
  direction: Joi.string().valid('up', 'down').required(),
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMAS — Misc routes
// ═══════════════════════════════════════════════════════════════════════════

const communityTaskCreate = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(2000).allow('').default(''),
  goal: Joi.string().trim().max(500).allow('').default(''),
  reward_amount: Joi.number().min(0).max(100000).required(),
});

const collectiveBountyCreate = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(2000).allow('').default(''),
  reward_pool: Joi.number().min(0).max(100000).default(0),
  reward_currency: Joi.string().trim().max(10).default('USDC'),
});

const predictionPick = Joi.object({
  market_id: Joi.string().trim().min(1).max(100).required(),
  outcome: Joi.string().trim().min(1).max(100).required(),
  stake: Joi.number().min(0).max(100000).default(0),
  stake_currency: Joi.string().trim().max(10),
});

const merchantRegister = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().email().max(200).allow('').default(''),
  invite_code: Joi.string().trim().max(50).allow(null, ''),
  agent_referral_code: Joi.string().trim().max(20).allow(null, ''),
});

const merchantOfferCreate = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(2000).allow('').default(''),
  payout_usd: Joi.number().min(0).max(100000).required(),
  signals: Joi.array().items(Joi.string().trim().max(100)).max(10).default([]),
  anti_signals: Joi.array().items(Joi.string().trim().max(100)).max(10).default([]),
  pitch_guidance: Joi.string().trim().max(2000).allow('').default(''),
});

const expertUpgrade = Joi.object({
  slug: Joi.string().trim().min(1).max(50).required(),
  display_name: Joi.string().trim().min(1).max(100).required(),
  specialties: Joi.array().items(Joi.string().trim().max(50)).max(10),
});

const expertEngagement = Joi.object({
  expert_slug: Joi.string().trim().min(1).max(50).required(),
  requirements: Joi.string().trim().min(1).max(2000).required(),
  tier_id: Joi.string().trim().max(50),
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMAS — Alliance War
// ═══════════════════════════════════════════════════════════════════════════

const allianceWarSubmit = Joi.object({
  proof_url: Joi.string().uri().max(500).allow(null, ''),
  proof_text: Joi.string().trim().max(2000).allow(''),
});

module.exports = {
  validate,
  schemas: {
    agentRegister,
    agentUpdate,
    allianceUpdate,
    capabilitiesUpdate,
    walletUpdate,
    fluxaWalletUpdate,
    a2aTaskCreate,
    a2aTaskSubmit,
    a2aTaskVerify,
    forumPostCreate,
    forumCommentCreate,
    forumVote,
    communityTaskCreate,
    collectiveBountyCreate,
    predictionPick,
    merchantRegister,
    merchantOfferCreate,
    expertUpgrade,
    expertEngagement,
    allianceWarSubmit,
  },
};
