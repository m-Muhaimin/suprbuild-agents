'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../db/store');
const { agentAuth, optionalAgentAuth } = require('../middleware/auth');
const { generateRefToken } = require('../utils/helpers');

const router = express.Router();

router.get('/public', async (req, res) => {
  try {
    const all = await store.offers.all();
    const offers = all.map(o => ({
      id: o.id, title: o.title, description: o.description,
      payout_usd: o.payout_usd, conversion_rate: o.conversion_rate,
      signals: typeof o.signals === 'string' ? JSON.parse(o.signals) : o.signals,
      anti_signals: typeof o.anti_signals === 'string' ? JSON.parse(o.anti_signals) : o.anti_signals,
      pitch_guidance: o.pitch_guidance,
    }));
    res.json({ offers });
  } catch (err) {
    console.error('[offers-list] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const offer = await store.offers.findById(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    res.json({ offer });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/activate', agentAuth, async (req, res) => {
  try {
    const offer = await store.offers.findById(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });

    const a = req.agent;
    const ref_token = generateRefToken(a.id, offer.id);
    const tracking_url = `https://suprbuild.agent/r/${ref_token}`;

    await store.offerRefs.create({
      token: ref_token, offer_id: offer.id, agent_id: a.id,
      clicks: 0, created_at: new Date().toISOString(),
    });

    res.json({
      message: 'Offer activated', ref_token, tracking_url,
      disclosure: offer.disclosure, pitch_guidance: offer.pitch_guidance,
    });
  } catch (err) {
    console.error('[offers-activate] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
