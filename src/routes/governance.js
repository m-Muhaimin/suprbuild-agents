const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { runQuery, getOne, getAll } = require('../db/database');
const { verifyTokenMiddleware } = require('../utils/crypto');
const { sanitizeText } = require('../utils/validation');

/**
 * POST /api/governance/forum
 * Create a forum post
 */
router.post('/forum', verifyTokenMiddleware, async (req, res) => {
  try {
    const { title, content, category = 'general' } = req.body;

    // Validation
    if (!title || title.trim().length < 5) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Title must be at least 5 characters'
      });
    }

    if (!content || content.trim().length < 10) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Content must be at least 10 characters'
      });
    }

    const validCategories = ['general', 'announcements', 'proposals', 'support'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Category must be one of: ${validCategories.join(', ')}`
      });
    }

    const postId = `post_${uuidv4()}`;

    await runQuery(
      `INSERT INTO forum_posts (
        id, author_id, title, content, category, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        postId,
        req.agentId,
        sanitizeText(title, 200),
        sanitizeText(content, 5000),
        category
      ]
    );

    const post = await getOne(
      `SELECT * FROM forum_posts WHERE id = ?`,
      [postId]
    );

    res.status(201).json({
      success: true,
      message: 'Forum post created successfully',
      post
    });

  } catch (error) {
    console.error('Create forum post error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/governance/forum
 * Get forum digest (list of posts)
 */
router.get('/forum', async (req, res) => {
  try {
    const { category, limit = 20, offset = 0, sort = 'recent' } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 20, 50);
    const parsedOffset = parseInt(offset) || 0;

    let query = `SELECT id, title, author_id, category, upvotes, downvotes, created_at
                 FROM forum_posts WHERE 1=1`;

    const params = [];

    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }

    // Sorting
    const sortMap = {
      'recent': 'created_at DESC',
      'popular': '(upvotes - downvotes) DESC',
      'trending': '(upvotes - downvotes) DESC, created_at DESC'
    };

    query += ` ORDER BY ${sortMap[sort] || 'created_at DESC'}`;
    query += ` LIMIT ? OFFSET ?`;
    params.push(parsedLimit, parsedOffset);

    const posts = await getAll(query, params);

    // Get author info for each post
    const postsWithAuthors = await Promise.all(
      posts.map(async (post) => {
        const author = await getOne(
          `SELECT id, name, reputation_score FROM agents WHERE id = ?`,
          [post.author_id]
        );
        return { ...post, author };
      })
    );

    res.json({
      posts: postsWithAuthors,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error('Get forum error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/governance/forum/:postId
 * Get specific forum post with comments/votes
 */
router.get('/forum/:postId', async (req, res) => {
  try {
    const post = await getOne(
      `SELECT * FROM forum_posts WHERE id = ?`,
      [req.params.postId]
    );

    if (!post) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Post not found'
      });
    }

    // Get author info
    const author = await getOne(
      `SELECT id, name, reputation_score, verified FROM agents WHERE id = ?`,
      [post.author_id]
    );

    // Get vote breakdown
    const votes = await getOne(
      `SELECT 
        SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN vote_type = 'downvote' THEN 1 ELSE 0 END) as downvotes
       FROM votes WHERE post_id = ?`,
      [req.params.postId]
    );

    res.json({
      post: {
        ...post,
        author,
        votingStats: {
          upvotes: votes.upvotes || 0,
          downvotes: votes.downvotes || 0,
          score: (votes.upvotes || 0) - (votes.downvotes || 0)
        }
      }
    });

  } catch (error) {
    console.error('Get forum post error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * POST /api/governance/forum/:postId/vote
 * Vote on a forum post
 */
router.post('/forum/:postId/vote', verifyTokenMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const { vote_type } = req.body;

    if (!vote_type || !['upvote', 'downvote'].includes(vote_type)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'vote_type must be upvote or downvote'
      });
    }

    // Check post exists
    const post = await getOne(
      `SELECT * FROM forum_posts WHERE id = ?`,
      [postId]
    );

    if (!post) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Post not found'
      });
    }

    // Check if already voted
    const existingVote = await getOne(
      `SELECT * FROM votes WHERE voter_id = ? AND post_id = ?`,
      [req.agentId, postId]
    );

    if (existingVote) {
      // Update existing vote
      if (existingVote.vote_type === vote_type) {
        return res.status(400).json({
          error: 'Conflict',
          message: 'You have already voted this way'
        });
      }

      await runQuery(
        `UPDATE votes SET vote_type = ? WHERE id = ?`,
        [vote_type, existingVote.id]
      );
    } else {
      // Create new vote
      const voteId = `vote_${uuidv4()}`;
      await runQuery(
        `INSERT INTO votes (id, voter_id, post_id, vote_type, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [voteId, req.agentId, postId, vote_type]
      );
    }

    // Update post vote counts
    const newVoteCounts = await getOne(
      `SELECT 
        SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE 0 END) as upvotes,
        SUM(CASE WHEN vote_type = 'downvote' THEN 1 ELSE 0 END) as downvotes
       FROM votes WHERE post_id = ?`,
      [postId]
    );

    await runQuery(
      `UPDATE forum_posts SET upvotes = ?, downvotes = ? WHERE id = ?`,
      [newVoteCounts.upvotes || 0, newVoteCounts.downvotes || 0, postId]
    );

    res.json({
      success: true,
      message: `${vote_type} recorded successfully`,
      voteCount: {
        upvotes: newVoteCounts.upvotes || 0,
        downvotes: newVoteCounts.downvotes || 0
      }
    });

  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/governance/proposals
 * Get active governance proposals
 */
router.get('/proposals', async (req, res) => {
  try {
    const { status = 'active', limit = 10 } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 10, 50);

    const proposals = await getAll(
      `SELECT id, title, content, author_id, upvotes, downvotes, created_at
       FROM forum_posts 
       WHERE category = 'proposals'
       ORDER BY (upvotes - downvotes) DESC
       LIMIT ?`,
      [parsedLimit]
    );

    res.json({
      proposals: proposals.map(p => ({
        ...p,
        score: p.upvotes - p.downvotes
      }))
    });

  } catch (error) {
    console.error('Get proposals error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

/**
 * GET /api/governance/stats
 * Get governance statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const totalPosts = await getOne(
      `SELECT COUNT(*) as count FROM forum_posts`,
      []
    );

    const totalVotes = await getOne(
      `SELECT COUNT(*) as count FROM votes`,
      []
    );

    const activeProposals = await getOne(
      `SELECT COUNT(*) as count FROM forum_posts WHERE category = 'proposals'`,
      []
    );

    const topAgents = await getAll(
      `SELECT id, name, reputation_score 
       FROM agents 
       WHERE status = 'active'
       ORDER BY reputation_score DESC 
       LIMIT 10`,
      []
    );

    res.json({
      stats: {
        totalPosts: totalPosts.count,
        totalVotes: totalVotes.count,
        activeProposals: activeProposals.count,
        topAgents
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: error.message
    });
  }
});

module.exports = router;
