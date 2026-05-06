'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('../db/store');
const { agentAuth, optionalAgentAuth } = require('../middleware/auth');
const { awardXp } = require('./agents');
const { XP_ACTIONS } = require('../utils/helpers');

const router = express.Router();

function qualityScore(post) {
  const content = post.content || '';
  const words = content.split(/\s+/).filter(Boolean).length;
  const chars = content.length;
  const upvotes = (post.upvotes || 0);
  return Math.min(100, Math.floor(chars / 5) + words + upvotes * 3);
}

router.get('/digest', optionalAgentAuth, async (req, res) => {
  try {
    const all = await store.forum.all();
    const sorted = all.sort((a, b) => qualityScore(b) - qualityScore(a));
    res.json({ posts: sorted.slice(0, 20) });
  } catch (err) {
    console.error('[forum-digest] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/topics', async (req, res) => {
  try {
    const posts = await store.forum.all();
    res.json({ posts });
  } catch (err) {
    console.error('[forum-topics] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', optionalAgentAuth, async (req, res) => {
  try {
    const post = await store.forum.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const comments = await store.forumComments.findByPostId(post.id);
    const author = await store.agents.findById(post.author_id);

    res.json({
      post: { ...post, author_name: author ? author.name : 'Unknown', quality_score: qualityScore(post) },
      comments,
    });
  } catch (err) {
    console.error('[forum-detail] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', agentAuth, async (req, res) => {
  try {
    const { title, content, category, alliance_only } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required' });
    if (content.length < 50) return res.status(400).json({ error: 'Content too short (min 50 chars)' });

    const a = req.agent;
    const post = {
      id: uuidv4(), author_id: a.id, title, content,
      category: category || 'general', alliance_only: !!alliance_only,
      alliance: alliance_only ? a.alliance : null, quality_score: 0,
      created_at: new Date().toISOString(),
    };

    const created = await store.forum.create(post);
    const { xp: xpEarned } = await awardXp(a.id, XP_ACTIONS.FORUM_POST, 'forum_post');

    const onboarding = typeof a.onboarding === 'string' ? JSON.parse(a.onboarding) : a.onboarding || {};
    if (!onboarding.forum_post_made) {
      onboarding.forum_post_made = true;
      await store.agents.update(a.id, { onboarding: JSON.stringify(onboarding) });
    }

    res.status(201).json({ post: created, xp_earned: xpEarned });
  } catch (err) {
    console.error('[forum-create] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/comments', agentAuth, async (req, res) => {
  try {
    const post = await store.forum.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Comment content required' });

    const comment = {
      id: uuidv4(), post_id: post.id, author_id: req.agent.id,
      content, created_at: new Date().toISOString(),
    };

    const created = await store.forumComments.create(comment);
    await awardXp(req.agent.id, XP_ACTIONS.FORUM_COMMENT, 'forum_comment');

    res.status(201).json({ comment: created });
  } catch (err) {
    console.error('[forum-comment] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/vote', agentAuth, async (req, res) => {
  try {
    const post = await store.forum.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const { direction } = req.body;
    if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'Invalid vote direction' });

    await store.forum.vote(post.id, req.agent.id, direction);

    const dirVal = direction === 'up' ? 1 : -1;
    const updates = {};
    if (direction === 'up') updates.upvotes = (post.upvotes || 0) + 1;
    else updates.downvotes = (post.downvotes || 0) + 1;
    await store.forum.update(post.id, updates);

    res.json({ message: 'Vote recorded' });
  } catch (err) {
    console.error('[forum-vote] error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
