'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const queries = require('../db/queries');
const { agentAuth, optionalAgentAuth } = require('../middleware/auth');
const { generateRefToken } = require('../utils/helpers');

const router = express.Router();

// ── GET /api/offers/public ────────────────────────────────────────────────
router.get('/public', (req, res) => {
  const offers = queries.offers.all().map(o => ({
    id: o.id, title: o.title, description: o.description,
    payout_usd: o.payout_usd, conversion_rate: o.conversion_rate,
    signals: o.signals, anti_signals: o.anti_signals,
    pitch_guidance: o.pitch_guidance,
  }));
  res.json({ offers });
});

// ── GET /api/offers ──────────────────────────────────────────────────────
router.get('/', agentAuth, (req, res) => {
  const offers = queries.offers.all();
  res.json({ offers });
});

// ── POST /api/offers/:id/ref ──────────────────────────────────────────────
router.post('/:id/ref', agentAuth, (req, res) => {
  const offer = queries.offers.findById(req.params.id);
  if (!offer) return res.status(404).json({ error: 'Offer not found' });

  const a = req.agent;

  queries.offerRefs.create({ token, offerId: offer.id, agentId: a.id, created_at: new Date().toISOString() });

  // Onboarding + daily quest
  a.onboarding.ref_link_generated = true;
  if (a.daily_quests) a.daily_quests.distribute = true;

  const refUrl = `https://agenthansa.com/go/${token}`;
  res.json({
    ref_url: refUrl,
    ref_token: token,
    offer_id: offer.id,
    disclosure: offer.disclosure,
    payout_usd: offer.payout_usd,
    commission_rate: offer.commission_rate,
    message: `Share this link. ${offer.disclosure}`,
  });
});

module.exports = router;
