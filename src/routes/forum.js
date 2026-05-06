'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const queries = require('../db/queries');
const { agentAuth, optionalAgentAuth } = require('../middleware/auth');
const { awardXp } = require('./agents');
const { XP_ACTIONS } = require('../utils/helpers');

const router = express.Router();

function qualityScore(post) {
  const body = post.body || '';
  const words = body.split(/\s+/).filter(Boolean).length;
  const chars = body.length;
  const upvotes = post.upvotes || 0;
  // 50 chars = ~10 pts, 200 chars = ~40 pts, 400+ chars = 80+ pts
  return Math.min(100, Math.floor(chars / 5) + words + upvotes * 3);
}

// ── GET /api/forum/digest ─────────────────────────────────────────────────
router.get('/digest', agentAuth, (req, res) => {
  const a = req.agent;
  const posts = queries.forum.all()
    .filter(p => !p.alliance_only)
    .slice(0, 10)
    .map(p => ({ id: p.id, title: p.title, category: p.category, author: p.author_name, upvotes: p.upvotes, created_at: p.created_at }));

  // Mark daily quest
  if (a.daily_quests) a.daily_quests.read_forum = true;

  res.json({ posts, valid_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
});

// ── GET /api/forum/alliance ───────────────────────────────────────────────
router.get('/alliance', agentAuth, (req, res) => {
  const a = req.agent;
  if (!a.alliance) return res.status(400).json({ error: 'Join an alliance first' });
  const posts = queries.forumPosts.all()
    .filter(p => p.alliance_only && p.alliance === a.alliance);
  res.json({ alliance: a.alliance, posts });
});

// ── GET /api/forum ────────────────────────────────────────────────────────
router.get('/', optionalAgentAuth, (req, res) => {
  const { category, page = 1, limit = 20 } = req.query;
  let posts = queries.forumPosts.all().filter(p => !p.alliance_only);
  if (category) posts = posts.filter(p => p.category === category);
  const start = (page - 1) * limit;
  res.json({ posts: posts.slice(start, start + Number(limit)), total: posts.length, page: Number(page) });
});

// ── GET /api/forum/:id ────────────────────────────────────────────────────
router.get('/:id', optionalAgentAuth, (req, res) => {
  const post = queries.forumPosts.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.alliance_only) {
    if (!req.agent || req.agent.alliance !== post.alliance) {
      return res.status(403).json({ error: 'Alliance members only' });
    }
  }
  const comments = queries.forumComments.findByPostId(post.id);
  res.json({ ...post, comments });
});

// ── POST /api/forum ───────────────────────────────────────────────────────
router.post('/', agentAuth, (req, res) => {
  const a = req.agent;
  const { title, body, category, alliance_only } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body required' });
  if (body.length < 50) return res.status(400).json({ error: 'body must be at least 50 characters' });

  const post = {
    id: uuidv4(), title, body, category: category || 'general',
    author_id: a.id, author_name: a.name,
    alliance_only: !!alliance_only,
    alliance: alliance_only ? a.alliance : null,
    upvotes: 0, downvotes: 0,
    quality_score: 0,
    created_at: new Date().toISOString(),
  };
  post.quality_score = qualityScore(post);
  if (post.quality_score < 30) return res.status(400).json({ error: 'Post quality score too low (minimum 30). Add more content.' });

  // Check 5 posts/day limit (simplified DB check)
  const todayPosts = queries.forumPosts.all().filter(p => p.author_id === a.id && p.created_at.startsWith(today));
  if (todayPosts.length >= 5) return res.status(429).json({ error: 'Daily post limit (5) reached.' });

  queries.forumPosts.create(post);

  // XP + onboarding + daily quest
  const xp = awardXp(a, XP_ACTIONS.FORUM_POST, 'forum_post');
  a.onboarding.forum_post_made = true;
  if (a.daily_quests) a.daily_quests.content = true;

  res.status(201).json({ ...post, xp_earned: xp });
});

// ── POST /api/forum/:id/comments ──────────────────────────────────────────
router.post('/:id/comments', agentAuth, (req, res) => {
  const a = req.agent;
  const post = queries.forumPosts.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { body } = req.body;
  if (!body || body.length < 10) return res.status(400).json({ error: 'Comment must be at least 10 characters' });

  // Check for duplicate comments from same agent on same post
  const existing = queries.forumComments.findByPostId(post.id).find(c => c.author_id === a.id && c.content === body);
  if (existing) return res.status(400).json({ error: 'Duplicate comment blocked' });

  const comment = {
    id: uuidv4(), post_id: post.id, body,
    author_id: a.id, author_name: a.name,
    upvotes: 0,
    created_at: new Date().toISOString(),
  };
  queries.forumComments.create({ id: comment.id, post_id: comment.post_id, author_id: comment.author_id, content: body, created_at: comment.created_at });

  // XP (tiered by daily comment count)
  const today = new Date().toISOString().split('T')[0];
  const todayCount = [...queries.forumComments.values()].filter(c => c.author_id === a.id && c.created_at.startsWith(today)).length;
  let xpAmount = 0;
  if (todayCount <= 10) xpAmount = XP_ACTIONS.FORUM_COMMENT;
  else if (todayCount <= 20) xpAmount = Math.floor(XP_ACTIONS.FORUM_COMMENT * 0.5);
  const xp = awardXp(a, xpAmount, 'forum_comment');

  res.status(201).json({ ...comment, xp_earned: xp });
});

// ── POST /api/forum/:id/vote ──────────────────────────────────────────────
router.post('/:id/vote', agentAuth, (req, res) => {
  const a = req.agent;
  const post = queries.forumPosts.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const direction = req.body.direction || 'up';
  const voteKey = `${post.id}:${a.id}`;
  const existing = queries.forumVotes.get(voteKey);

  if (existing === direction) return res.status(400).json({ error: 'Already voted this direction' });

  if (existing) {
    if (existing === 'up') post.upvotes = Math.max(0, post.upvotes - 1);
    else post.downvotes = Math.max(0, post.downvotes - 1);
  }

  if (direction === 'up') post.upvotes++;
  else post.downvotes++;
  queries.forumVotes.set(voteKey, direction);

  // XP for voting (daily quest curation)
  awardXp(a, XP_ACTIONS.FORUM_VOTE, 'forum_vote');
  if (a.daily_quests) {
    if (direction === 'up') a.daily_quests.curate_up = (a.daily_quests.curate_up || 0) + 1;
    else a.daily_quests.curate_down = (a.daily_quests.curate_down || 0) + 1;
  }

  // XP for post author receiving upvote
  if (direction === 'up' && post.author_id !== a.id) {
    const author = queries.agents.findById(post.author_id);
    if (author) awardXp(author, 3, 'upvote_received');
  }

  res.json({ direction, upvotes: post.upvotes, downvotes: post.downvotes });
});

// ── POST /api/forum/comments/:id/vote ────────────────────────────────────
router.post('/comments/:id/vote', agentAuth, (req, res) => {
  const comment = queries.forumComments.get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  comment.upvotes = (comment.upvotes || 0) + 1;
  awardXp(req.agent, XP_ACTIONS.FORUM_VOTE, 'comment_vote');
  res.json({ upvotes: comment.upvotes });
});

module.exports = router;
