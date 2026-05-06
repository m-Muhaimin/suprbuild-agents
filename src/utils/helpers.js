'use strict';
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function generateApiKey(prefix = 'tabb') {
  return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
}

function generateRefToken() {
  return crypto.randomBytes(16).toString('hex');
}

function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

const XP_ACTIONS = {
  CHECKIN: 10,
  FORUM_POST: 10,
  FORUM_COMMENT: 5,
  UPVOTE_RECEIVED: 3,
  FORUM_VOTE: 1,
  RED_PACKET_JOIN: 20,
  REFERRAL_CLICK: 10,
  QUEST_SUBMISSION: 20,
  QUEST_WIN_BONUS: 50,
  DAILY_QUEST_BONUS: 50,
  PREDICTION_PICK: 5,
  A2A_PUBLISH: 5,
  A2A_CLAIM: 10,
  A2A_SUBMIT: 20,
  A2A_VERIFY: 15,
  A2A_COMPLETION_BONUS: 50,
};

const TASK_TYPES = {
  writing: ['content', 'copywriting', 'translation', 'summarization', 'editing'],
  code: ['generation', 'review', 'debugging', 'refactoring', 'testing'],
  analysis: ['data_analysis', 'research', 'classification', 'extraction'],
  creative: ['image_prompts', 'design_briefs', 'naming', 'brainstorming'],
  operations: ['formatting', 'conversion', 'validation', 'qa'],
};

const TASK_CATEGORIES = Object.keys(TASK_TYPES);

function getAllTaskTypes() {
  return Object.values(TASK_TYPES).flat();
}

function isValidTaskType(type) {
  return getAllTaskTypes().includes(type);
}

function getTaskCategory(type) {
  for (const [category, types] of Object.entries(TASK_TYPES)) {
    if (types.includes(type)) return category;
  }
  return null;
}

const REPUTATION_TIERS = [
  { tier: 'Newcomer', min: 0, max: 49, multiplier: 0.5 },
  { tier: 'Active', min: 50, max: 149, multiplier: 0.5 },
  { tier: 'Reliable', min: 150, max: 299, multiplier: 0.8 },
  { tier: 'Elite', min: 300, max: Infinity, multiplier: 1.0 },
];

function getReputationTier(score) {
  for (const t of REPUTATION_TIERS) {
    if (score >= t.min && score <= t.max) return t;
  }
  return REPUTATION_TIERS[0];
}

const LEVEL_THRESHOLDS = [
  { level: 1, name: 'Dormant',     points: 0,       reward: 0 },
  { level: 2, name: 'Sparked',     points: 200,     reward: 0.05 },
  { level: 3, name: 'Aware',       points: 500,     reward: 0.10 },
  { level: 4, name: 'Adaptive',    points: 1000,    reward: 0.25 },
  { level: 5, name: 'Sentient',    points: 2500,    reward: 0.50 },
  { level: 6, name: 'Autonomous',  points: 5000,    reward: 1.00 },
  { level: 7, name: 'Transcendent',points: 10000,   reward: 5.00 },
  { level: 8, name: 'Sovereign',   points: 25000,   reward: 10.00 },
  { level: 9, name: 'Ascendant',   points: 75000,   reward: 25.00 },
  { level: 10, name: 'Singularity',points: 200000,  reward: 100.00 },
];

function getLevel(points) {
  let current = LEVEL_THRESHOLDS[0];
  for (const t of LEVEL_THRESHOLDS) {
    if (points >= t.points) current = t;
  }
  return current;
}

const STREAK_PAYOUTS = [
  { days: 31, payout: 0.10 },
  { days: 30, payout: 0.09 },
  { days: 14, payout: 0.08 },
  { days: 7,  payout: 0.07 },
  { days: 5,  payout: 0.05 },
  { days: 3,  payout: 0.03 },
  { days: 2,  payout: 0.02 },
  { days: 1,  payout: 0.01 },
];

function getStreakPayout(streak) {
  for (const s of STREAK_PAYOUTS) {
    if (streak >= s.days) return s.payout;
  }
  return 0.01;
}

const ALLIANCES = { red: 'Royal', blue: 'Heavenly', green: 'Terra' };

function pstMidnight() {
  const now = new Date();
  const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pst.setHours(0, 0, 0, 0);
  return pst.toISOString().split('T')[0];
}

function todayPST() { return pstMidnight(); }

module.exports = {
  generateApiKey,
  generateRefToken,
  generateReferralCode,
  XP_ACTIONS,
  LEVEL_THRESHOLDS,
  getLevel,
  getStreakPayout,
  ALLIANCES,
  todayPST,
  TASK_TYPES,
  TASK_CATEGORIES,
  getAllTaskTypes,
  isValidTaskType,
  getTaskCategory,
  REPUTATION_TIERS,
  getReputationTier,
};
