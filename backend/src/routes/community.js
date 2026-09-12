const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Topic = require('../models/Topic');
const Comment = require('../models/Comment');

const router = express.Router();
const SEED_PATH = path.join(__dirname, '..', 'data', 'seedCommunity.json');

let cacheTopics = null;
let cacheComments = null;
let seedInitialized = false;

const REPORT_AUTO_HIDE_THRESHOLD = 3;
const MAX_COMMENT_DEPTH = 4;
const SPAM_BLOCKLIST = /(₹|rs\.?|rupees?)\s*\d{5,}|win\s*₹|casino|gambling|bitcoin|crypto|investment\s*plan|double\s*your\s*money|lottery/i;
const EXTERNAL_LINK_RE = /https?:\/\/(?!(?:pmkisan|pmfby|enam|mahadbt|agri\.maharashtra|pmksy|pmkusum|soilhealth|nabard|narendra\.modi|mygov)\.)/i;

function readSeed() {
  try {
    const raw = fs.readFileSync(SEED_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[community] seed read failed:', err.message);
    return { topics: [], comments: [] };
  }
}

function createInMemoryStore() {
  const seed = readSeed();
  const now = Date.now();
  const topics = seed.topics.map((t, i) => {
    const createdAt = new Date(now + (t.createdAtOffsetMin || 0) * 60 * 1000);
    return {
      _id: new mongoose.Types.ObjectId().toString(),
      _seedId: t._seedId,
      title: t.title,
      content: t.content,
      authorId: `demo-${i + 1}`,
      authorName: t.authorName,
      authorDistrict: t.authorDistrict || '',
      authorTrustLevel: t.authorTrustLevel || 0,
      category: t.category,
      tags: t.tags || [],
      photoDataUrl: t.photoDataUrl || '',
      voteCount: t.voteCount || 0,
      votes: [],
      commentCount: t.commentCount || 0,
      viewCount: t.viewCount || 0,
      hotScore: typeof t.hotScore === 'number' ? t.hotScore : 0,
      pinned: !!t.pinned,
      locked: false,
      reportCount: 0,
      hidden: false,
      hiddenReason: '',
      approved: t.approved !== false,
      minTrustToReply: t.minTrustToReply || 0,
      createdAt,
      updatedAt: createdAt,
    };
  });
  const comments = [];
  let rootCounter = 0;
  const seedBySeedId = new Map(topics.map((t) => [t._seedId, t]));
  const commentTempBySeed = new Map();
  (seed.comments || []).forEach((c, i) => {
    const topic = seedBySeedId.get(c._seedTopicId);
    if (!topic) return;
    const createdAt = new Date(now + (c.createdAtOffsetMin || 0) * 60 * 1000);
    const record = {
      _id: new mongoose.Types.ObjectId().toString(),
      topicId: topic._id,
      parentId: null,
      rootId: null,
      depth: c.depth || 0,
      path: [],
      content: c.content,
      photoDataUrl: c.photoDataUrl || '',
      authorId: `demo-c-${i + 1}`,
      authorName: c.authorName,
      authorDistrict: c.authorDistrict || '',
      authorTrustLevel: c.authorTrustLevel || 0,
      voteCount: c.voteCount || 0,
      votes: [],
      reportCount: 0,
      hidden: false,
      hiddenReason: '',
      approved: c.approved !== false,
      replyCount: 0,
      _seedParentId: c._seedParentId,
      _seedSiblingIdx: null,
      createdAt,
      updatedAt: createdAt,
    };
    if (!record._seedParentId) {
      record.rootId = record._id;
      record.path = [record._id];
      rootCounter++;
    }
    commentTempBySeed.set(`__idx_${i}`, record);
    comments.push(record);
  });
  comments.forEach((c, idx) => {
    if (!c._seedParentId) return;
    const parentRef = c._seedParentId;
    let parent;
    if (typeof parentRef === 'string' && parentRef.startsWith('@SIBLING_')) {
      const n = Number(parentRef.replace('@SIBLING_', ''));
      const sameDepthSameTopic = comments.filter(
        (x, i2) => x.topicId === c.topicId && x.depth === c.depth - 1 && i2 < idx,
      );
      parent = sameDepthSameTopic[n] || null;
    } else {
      parent = comments.find((x) => x._seedId === parentRef);
    }
    if (parent) {
      c.parentId = parent._id;
      c.rootId = parent.rootId || parent._id;
      c.depth = Math.min(MAX_COMMENT_DEPTH, (parent.depth || 0) + 1);
      c.path = [...(parent.path || []), c._id];
      parent.replyCount = (parent.replyCount || 0) + 1;
    } else {
      c.depth = 1;
      c.rootId = c._id;
      c.path = [c._id];
    }
  });
  return { topics, comments };
}

function getStore() {
  if (cacheTopics && cacheComments) return { topics: cacheTopics, comments: cacheComments };
  const s = createInMemoryStore();
  cacheTopics = s.topics;
  cacheComments = s.comments;
  return s;
}

function computeHot(topic, now = Date.now()) {
  const ageHrs = Math.max(1, (now - new Date(topic.createdAt).getTime()) / 3_600_000);
  const sign = topic.voteCount > 0 ? 1 : topic.voteCount < 0 ? -1 : 0;
  const magnitude = Math.max(1, Math.abs(topic.voteCount) + topic.commentCount * 1.8 + topic.viewCount * 0.02);
  return (sign * Math.log10(magnitude) + topic.pinned ? 1000 : 0) - ageHrs / 24;
}

function computeTrust(authorId, topics, comments) {
  const authoredTopics = topics.filter((t) => t.authorId === authorId);
  const authoredComments = comments.filter((c) => c.authorId === authorId);
  const postScore = authoredTopics.length * 2;
  const commentScore = authoredComments.length * 1;
  const voteScore =
    authoredTopics.reduce((a, t) => a + Math.max(0, t.voteCount), 0) * 0.5 +
    authoredComments.reduce((a, c) => a + Math.max(0, c.voteCount), 0) * 0.5;
  return Math.floor(postScore + commentScore + voteScore);
}

function trustLabel(trust) {
  if (trust >= 100) return 'trusted';
  if (trust >= 30) return 'member';
  return 'new';
}

function userActionsSince(userId, items, windowMs) {
  const cutoff = Date.now() - windowMs;
  return items.filter(
    (it) => it.authorId === userId && new Date(it.createdAt).getTime() >= cutoff,
  ).length;
}

function sanitizeContent(text) {
  if (!text) return '';
  return String(text).slice(0, 4000).replace(/\u0000/g, '');
}

function cleanTopic(t) {
  return {
    id: t._id,
    title: t.title,
    content: t.content,
    authorId: t.authorId,
    authorName: t.authorName,
    authorDistrict: t.authorDistrict || '',
    authorTrustLevel: t.authorTrustLevel || 0,
    authorTrustLabel: trustLabel(t.authorTrustLevel || 0),
    category: t.category,
    tags: t.tags || [],
    photoDataUrl: t.photoDataUrl || '',
    voteCount: t.voteCount || 0,
    commentCount: t.commentCount || 0,
    viewCount: t.viewCount || 0,
    hotScore: typeof t.hotScore === 'number' ? t.hotScore : computeHot(t),
    pinned: !!t.pinned,
    locked: !!t.locked,
    reportCount: t.reportCount || 0,
    hidden: !!t.hidden,
    approved: t.approved !== false,
    minTrustToReply: t.minTrustToReply || 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function cleanComment(c) {
  return {
    id: c._id,
    topicId: c.topicId,
    parentId: c.parentId,
    rootId: c.rootId,
    depth: c.depth || 0,
    path: c.path || [],
    content: c.content,
    photoDataUrl: c.photoDataUrl || '',
    authorId: c.authorId,
    authorName: c.authorName,
    authorDistrict: c.authorDistrict || '',
    authorTrustLevel: c.authorTrustLevel || 0,
    authorTrustLabel: trustLabel(c.authorTrustLevel || 0),
    voteCount: c.voteCount || 0,
    reportCount: c.reportCount || 0,
    hidden: !!c.hidden,
    approved: c.approved !== false,
    replyCount: c.replyCount || 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toThread(flatComments) {
  const byId = new Map(flatComments.map((c) => ({ ...c, replies: [] })).map((c) => [c.id, c]));
  const roots = [];
  for (const c of byId.values()) {
    if (!c.parentId || !byId.has(c.parentId)) roots.push(c);
    else byId.get(c.parentId).replies.push(c);
  }
  const sortFn = (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const walk = (node) => {
    node.replies.sort(sortFn);
    node.replies.forEach(walk);
  };
  roots.sort(sortFn);
  roots.forEach(walk);
  return roots;
}

router.get('/topics', async (req, res) => {
  try {
    const { topics } = getStore();
    const category = req.query.category && req.query.category !== 'all' ? String(req.query.category) : null;
    const q = req.query.q ? String(req.query.q).toLowerCase() : null;
    const sort = String(req.query.sort || 'new');
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Number.parseInt(req.query.limit || '20', 10));

    let list = topics.filter((t) => !t.hidden);
    if (category) list = list.filter((t) => t.category === category);
    if (q) {
      list = list.filter((t) =>
        (t.title + ' ' + t.content + ' ' + (t.tags || []).join(' ')).toLowerCase().includes(q),
      );
    }
    list = list.map((t) => ({ ...t, hotScore: computeHot(t) }));
    if (sort === 'hot') list.sort((a, b) => (b.pinned - a.pinned) || (b.hotScore - a.hotScore));
    else if (sort === 'top') list.sort((a, b) => (b.pinned - a.pinned) || (b.voteCount - a.voteCount));
    else list.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.createdAt) - new Date(a.createdAt)));

    const total = list.length;
    const start = (page - 1) * limit;
    const paged = list.slice(start, start + limit).map(cleanTopic);
    const pendingApproval = list.filter((t) => t.approved === false).length;

    res.json({
      success: true,
      total,
      page,
      limit,
      pendingApproval,
      topics: paged,
    });
  } catch (err) {
    console.error('[community/topics/list]', err.message);
    res.status(500).json({ success: false, error: 'Failed to load topics' });
  }
});

router.get('/topics/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { topics, comments } = getStore();
    const topic = topics.find((t) => t._id === id);
    if (!topic || topic.hidden) return res.status(404).json({ success: false, error: 'Topic not found' });
    topic.viewCount = (topic.viewCount || 0) + 1;
    const topicComments = comments.filter((c) => c.topicId === id && !c.hidden).map(cleanComment);
    res.json({
      success: true,
      topic: cleanTopic(topic),
      comments: toThread(topicComments),
      commentsFlat: topicComments,
    });
  } catch (err) {
    console.error('[community/topics/detail]', err.message);
    res.status(500).json({ success: false, error: 'Failed to load topic' });
  }
});

router.post('/topics', async (req, res) => {
  try {
    const body = req.body || {};
    const { topics, comments } = getStore();
    const userId = body.userId || `anon-${Math.random().toString(36).slice(2, 7)}`;
    const userTrust = computeTrust(userId, topics, comments);
    const label = trustLabel(userTrust);

    const recentTopics = userActionsSince(userId, topics, 24 * 3_600_000);
    const rateLimitPosts = label === 'new' ? 3 : 25;
    if (recentTopics >= rateLimitPosts) {
      return res.status(429).json({
        success: false,
        error: 'post_rate_limit',
        message: label === 'new'
          ? 'New members may create 3 posts per day. Come back tomorrow!'
          : 'You are posting too fast. Wait a few minutes.',
      });
    }

    const title = sanitizeContent(body.title).trim();
    const content = sanitizeContent(body.content).trim();
    const category = body.category;
    const allowedCategories = new Set([
      'crop_advice',
      'market_prices',
      'government_schemes',
      'government_notices',
      'equipment',
      'success_stories',
      'general_farming',
      'discussion',
      'trade',
      'exchange',
    ]);

    if (!title || title.length < 5) return res.status(400).json({ success: false, error: 'Title must be at least 5 characters.' });
    if (!content || content.length < 10) return res.status(400).json({ success: false, error: 'Post body must be at least 10 characters.' });
    if (!allowedCategories.has(category)) return res.status(400).json({ success: false, error: 'Invalid category.' });
    if (EXTERNAL_LINK_RE.test(content) && label === 'new') {
      return res.status(400).json({ success: false, error: 'New users cannot post external links yet.' });
    }
    if (SPAM_BLOCKLIST.test(title) || SPAM_BLOCKLIST.test(content)) {
      return res.status(400).json({ success: false, error: 'Post blocked by spam filter.' });
    }

    const tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 6)
      : [];
    const photoDataUrl = typeof body.photoDataUrl === 'string' && body.photoDataUrl.startsWith('data:image')
      ? body.photoDataUrl.slice(0, 3_000_000)
      : '';

    const approvalRequired = label === 'new' && recentTopics <= 1;
    const now = new Date();
    const newTopic = {
      _id: new mongoose.Types.ObjectId().toString(),
      title,
      content,
      authorId: userId,
      authorName: sanitizeContent(body.authorName || 'Farmer').slice(0, 50) || 'Farmer',
      authorDistrict: sanitizeContent(body.authorDistrict || '').slice(0, 30),
      authorTrustLevel: userTrust,
      category,
      tags,
      photoDataUrl,
      voteCount: 0,
      votes: [],
      commentCount: 0,
      viewCount: 0,
      hotScore: 0,
      pinned: false,
      locked: false,
      reportCount: 0,
      hidden: false,
      hiddenReason: '',
      approved: !approvalRequired,
      minTrustToReply: 0,
      createdAt: now,
      updatedAt: now,
    };
    cacheTopics = [newTopic, ...(cacheTopics || topics)];
    res.status(201).json({
      success: true,
      approvalRequired,
      topic: cleanTopic(newTopic),
    });
  } catch (err) {
    console.error('[community/topics/create]', err.message);
    res.status(500).json({ success: false, error: 'Failed to create topic' });
  }
});

router.post('/topics/:id/vote', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { topics } = getStore();
    const t = topics.find((x) => x._id === id);
    if (!t) return res.status(404).json({ success: false, error: 'Topic not found' });
    const userId = String((req.body && req.body.userId) || `v-${Date.now()}`);
    const value = Number(req.body && req.body.value) === -1 ? -1 : 1;
    t.votes = t.votes || [];
    const existing = t.votes.findIndex((v) => v.userId === userId);
    if (existing >= 0) {
      if (t.votes[existing].value === value) t.votes.splice(existing, 1);
      else t.votes[existing].value = value;
    } else t.votes.push({ userId, value });
    t.voteCount = t.votes.reduce((a, v) => a + v.value, 0);
    res.json({ success: true, voteCount: t.voteCount });
  } catch (err) {
    console.error('[community/topics/vote]', err.message);
    res.status(500).json({ success: false, error: 'Vote failed' });
  }
});

router.post('/topics/:id/report', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { topics } = getStore();
    const t = topics.find((x) => x._id === id);
    if (!t) return res.status(404).json({ success: false, error: 'Topic not found' });
    t.reportCount = (t.reportCount || 0) + 1;
    if (t.reportCount >= REPORT_AUTO_HIDE_THRESHOLD) {
      t.hidden = true;
      t.hiddenReason = `Auto-hidden after ${t.reportCount} reports.`;
    }
    res.json({ success: true, reportCount: t.reportCount, hidden: !!t.hidden });
  } catch (err) {
    console.error('[community/topics/report]', err.message);
    res.status(500).json({ success: false, error: 'Report failed' });
  }
});

router.get('/topics/:id/comments', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { comments } = getStore();
    const list = comments.filter((c) => c.topicId === id && !c.hidden).map(cleanComment);
    res.json({ success: true, total: list.length, comments: toThread(list) });
  } catch (err) {
    console.error('[community/comments/list]', err.message);
    res.status(500).json({ success: false, error: 'Failed to load comments' });
  }
});

router.post('/topics/:id/comments', async (req, res) => {
  try {
    const topicId = String(req.params.id);
    const body = req.body || {};
    const { topics, comments } = getStore();
    const topic = topics.find((t) => t._id === topicId);
    if (!topic) return res.status(404).json({ success: false, error: 'Topic not found' });
    if (topic.locked) return res.status(400).json({ success: false, error: 'This topic is locked.' });

    const userId = body.userId || `anon-${Math.random().toString(36).slice(2, 7)}`;
    const userTrust = computeTrust(userId, topics, comments);
    const label = trustLabel(userTrust);
    const recentComments = userActionsSince(userId, comments, 3 * 60 * 1000);
    if (label === 'new' && recentComments >= 2) {
      return res.status(429).json({
        success: false,
        error: 'comment_rate_limit',
        message: 'Please wait a few minutes between comments.',
      });
    }
    if (topic.minTrustToReply && userTrust < topic.minTrustToReply) {
      return res.status(403).json({ success: false, error: 'Insufficient trust to reply here.' });
    }

    const parentId = body.parentId ? String(body.parentId) : null;
    const parent = parentId ? comments.find((c) => c._id === parentId) : null;
    const parentDepth = parent ? parent.depth || 0 : -1;
    const depth = Math.min(MAX_COMMENT_DEPTH, parentDepth + 1);

    const content = sanitizeContent(body.content).trim();
    if (!content || content.length < 2) return res.status(400).json({ success: false, error: 'Comment is too short.' });
    if (EXTERNAL_LINK_RE.test(content) && label === 'new') {
      return res.status(400).json({ success: false, error: 'New users cannot post links in comments yet.' });
    }
    if (SPAM_BLOCKLIST.test(content)) {
      return res.status(400).json({ success: false, error: 'Comment blocked by spam filter.' });
    }
    const photoDataUrl = typeof body.photoDataUrl === 'string' && body.photoDataUrl.startsWith('data:image')
      ? body.photoDataUrl.slice(0, 2_500_000)
      : '';

    const newApproval = label === 'new' ? false : true;
    const now = new Date();
    const record = {
      _id: new mongoose.Types.ObjectId().toString(),
      topicId,
      parentId: parent ? parent._id : null,
      rootId: parent ? parent.rootId || parent._id : null,
      depth,
      path: parent ? [...(parent.path || []), new mongoose.Types.ObjectId().toString()] : [new mongoose.Types.ObjectId().toString()],
      content,
      photoDataUrl,
      authorId: userId,
      authorName: sanitizeContent(body.authorName || 'Farmer').slice(0, 50) || 'Farmer',
      authorDistrict: sanitizeContent(body.authorDistrict || '').slice(0, 30),
      authorTrustLevel: userTrust,
      voteCount: 0,
      votes: [],
      reportCount: 0,
      hidden: false,
      hiddenReason: '',
      approved: newApproval,
      replyCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    record.path[record.path.length - 1] = record._id;
    if (!record.rootId) record.rootId = record._id;
    if (parent) parent.replyCount = (parent.replyCount || 0) + 1;
    topic.commentCount = (topic.commentCount || 0) + (newApproval ? 1 : 0);
    cacheComments = [...(cacheComments || comments), record];
    res.status(201).json({
      success: true,
      approvalRequired: !newApproval,
      comment: cleanComment(record),
    });
  } catch (err) {
    console.error('[community/comments/create]', err.message);
    res.status(500).json({ success: false, error: 'Failed to post comment' });
  }
});

router.post('/comments/:id/vote', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { comments } = getStore();
    const c = comments.find((x) => x._id === id);
    if (!c) return res.status(404).json({ success: false, error: 'Comment not found' });
    const userId = String((req.body && req.body.userId) || `v-${Date.now()}`);
    const value = Number(req.body && req.body.value) === -1 ? -1 : 1;
    c.votes = c.votes || [];
    const existing = c.votes.findIndex((v) => v.userId === userId);
    if (existing >= 0) {
      if (c.votes[existing].value === value) c.votes.splice(existing, 1);
      else c.votes[existing].value = value;
    } else c.votes.push({ userId, value });
    c.voteCount = c.votes.reduce((a, v) => a + v.value, 0);
    res.json({ success: true, voteCount: c.voteCount });
  } catch (err) {
    console.error('[community/comments/vote]', err.message);
    res.status(500).json({ success: false, error: 'Vote failed' });
  }
});

router.post('/comments/:id/report', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { comments } = getStore();
    const c = comments.find((x) => x._id === id);
    if (!c) return res.status(404).json({ success: false, error: 'Comment not found' });
    c.reportCount = (c.reportCount || 0) + 1;
    if (c.reportCount >= REPORT_AUTO_HIDE_THRESHOLD) {
      c.hidden = true;
      c.hiddenReason = `Auto-hidden after ${c.reportCount} reports.`;
    }
    res.json({ success: true, reportCount: c.reportCount, hidden: !!c.hidden });
  } catch (err) {
    console.error('[community/comments/report]', err.message);
    res.status(500).json({ success: false, error: 'Report failed' });
  }
});

const EDIT_WINDOW_MS = 15 * 60 * 1000;

// Shared guard for author-only mutations. Returns the topic/comment or an
// already-sent error via `respond`.
function requireAuthor(item, userId, what, res) {
  if (!item) {
    res.status(404).json({ success: false, error: `${what} not found` });
    return false;
  }
  if (!userId || item.authorId !== userId) {
    res.status(403).json({ success: false, error: `Only the author can modify this ${what.toLowerCase()}.` });
    return false;
  }
  return true;
}

// PUT /topics/:id — edit title/content/tags (author only, within 15 min).
router.put('/topics/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { topics, comments } = getStore();
    const t = topics.find((x) => x._id === id);
    const userId = String((req.body && req.body.userId) || '');
    if (!requireAuthor(t && !t.hidden ? t : null, userId, 'Topic', res)) return;
    if (Date.now() - new Date(t.createdAt).getTime() > EDIT_WINDOW_MS) {
      return res.status(403).json({
        success: false,
        error: 'edit_window_expired',
        message: 'Posts can only be edited within 15 minutes of publishing.',
      });
    }

    const title = sanitizeContent(req.body?.title !== undefined ? req.body.title : t.title).trim();
    const content = sanitizeContent(req.body?.content !== undefined ? req.body.content : t.content).trim();
    if (!title || title.length < 5) return res.status(400).json({ success: false, error: 'Title must be at least 5 characters.' });
    if (!content || content.length < 10) return res.status(400).json({ success: false, error: 'Post body must be at least 10 characters.' });
    if (SPAM_BLOCKLIST.test(title) || SPAM_BLOCKLIST.test(content)) {
      return res.status(400).json({ success: false, error: 'Post blocked by spam filter.' });
    }
    const userTrust = computeTrust(userId, topics, comments);
    if (EXTERNAL_LINK_RE.test(content) && trustLabel(userTrust) === 'new') {
      return res.status(400).json({ success: false, error: 'New users cannot post external links yet.' });
    }
    let tags = t.tags || [];
    if (req.body?.tags !== undefined) {
      if (!Array.isArray(req.body.tags)) return res.status(400).json({ success: false, error: 'tags must be an array of strings.' });
      tags = req.body.tags.map((x) => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 6);
    }

    t.title = title;
    t.content = content;
    t.tags = tags;
    t.updatedAt = new Date();
    res.json({ success: true, topic: cleanTopic(t) });
  } catch (err) {
    console.error('[community/topics/edit]', err.message);
    res.status(500).json({ success: false, error: 'Failed to edit topic' });
  }
});

// DELETE /topics/:id — soft-delete (author only). Hides the topic; comments
// stay in the store but vanish with it since detail lookups 404 on hidden.
router.delete('/topics/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { topics } = getStore();
    const t = topics.find((x) => x._id === id);
    const userId = String((req.body && req.body.userId) || req.query.userId || '');
    if (!requireAuthor(t && !t.hidden ? t : null, userId, 'Topic', res)) return;
    t.hidden = true;
    t.hiddenReason = 'Deleted by author.';
    t.updatedAt = new Date();
    res.json({ success: true, deleted: true });
  } catch (err) {
    console.error('[community/topics/delete]', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete topic' });
  }
});

// PUT /comments/:id — edit content (author only, within 15 min).
router.put('/comments/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { comments } = getStore();
    const c = comments.find((x) => x._id === id);
    const userId = String((req.body && req.body.userId) || '');
    if (!requireAuthor(c && !c.hidden ? c : null, userId, 'Comment', res)) return;
    if (Date.now() - new Date(c.createdAt).getTime() > EDIT_WINDOW_MS) {
      return res.status(403).json({
        success: false,
        error: 'edit_window_expired',
        message: 'Replies can only be edited within 15 minutes of posting.',
      });
    }

    const content = sanitizeContent(req.body?.content).trim();
    if (!content || content.length < 2) return res.status(400).json({ success: false, error: 'Comment is too short.' });
    if (SPAM_BLOCKLIST.test(content)) {
      return res.status(400).json({ success: false, error: 'Comment blocked by spam filter.' });
    }

    c.content = content;
    c.updatedAt = new Date();
    res.json({ success: true, comment: cleanComment(c) });
  } catch (err) {
    console.error('[community/comments/edit]', err.message);
    res.status(500).json({ success: false, error: 'Failed to edit comment' });
  }
});

// DELETE /comments/:id — soft-delete (author only). Keeps thread structure;
// decrements counters so topic/reply counts stay honest.
router.delete('/comments/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { topics, comments } = getStore();
    const c = comments.find((x) => x._id === id);
    const userId = String((req.body && req.body.userId) || req.query.userId || '');
    if (!requireAuthor(c && !c.hidden ? c : null, userId, 'Comment', res)) return;
    c.hidden = true;
    c.hiddenReason = 'Deleted by author.';
    c.updatedAt = new Date();
    if (c.approved !== false) {
      const topic = topics.find((t) => t._id === c.topicId);
      if (topic) topic.commentCount = Math.max(0, (topic.commentCount || 0) - 1);
    }
    const parent = c.parentId ? comments.find((x) => x._id === c.parentId) : null;
    if (parent) parent.replyCount = Math.max(0, (parent.replyCount || 0) - 1);
    res.json({ success: true, deleted: true });
  } catch (err) {
    console.error('[community/comments/delete]', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete comment' });
  }
});

router.get('/me/trusted', async (req, res) => {
  try {
    const userId = String(req.query.userId || `anon-${Date.now()}`);
    const { topics, comments } = getStore();
    const trust = computeTrust(userId, topics, comments);
    res.json({
      success: true,
      userId,
      trust,
      label: trustLabel(trust),
      remainingDailyPosts: Math.max(0, (trust < 30 ? 3 : 25) - userActionsSince(userId, topics, 24 * 3_600_000)),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Trust status unavailable' });
  }
});

async function ensureSeed() {
  if (seedInitialized) return;
  try {
    const topicCount = await Topic.countDocuments();
    const commentCount = await Comment.countDocuments();
    if (topicCount === 0 && commentCount === 0) {
      const seed = readSeed();
      if (seed.topics?.length) {
        const now = Date.now();
        const seedBySeedId = new Map();
        const topicDocs = seed.topics.map((t, i) => {
          const createdAt = new Date(now + (t.createdAtOffsetMin || 0) * 60 * 1000);
          const doc = new Topic({
            title: t.title, content: t.content,
            authorId: `demo-${i + 1}`, authorName: t.authorName,
            authorDistrict: t.authorDistrict, authorTrustLevel: t.authorTrustLevel || 0,
            category: t.category, tags: t.tags || [],
            photoDataUrl: t.photoDataUrl || '', voteCount: t.voteCount || 0,
            commentCount: t.commentCount || 0, viewCount: t.viewCount || 0,
            hotScore: t.hotScore || 0, pinned: !!t.pinned,
            approved: t.approved !== false, createdAt, updatedAt: createdAt,
          });
          seedBySeedId.set(t._seedId, doc);
          return doc;
        });
        const savedTopics = await Topic.insertMany(topicDocs, { ordered: false });
        const seedIdToSaved = new Map(
          seed.topics.map((t, idx) => [t._seedId, savedTopics[idx]._id.toString()]),
        );
        if (seed.comments?.length) {
          const comments = seed.comments.map((c, i) => {
            const createdAt = new Date(now + (c.createdAtOffsetMin || 0) * 60 * 1000);
            return {
              _seedTopicId: c._seedTopicId, _seedParentRef: c._seedParentId,
              _depth: c.depth || 0, body: {
                topicId: seedIdToSaved.get(c._seedTopicId) || null,
                parentId: null, rootId: null, depth: c.depth || 0,
                path: [], content: c.content, photoDataUrl: c.photoDataUrl || '',
                authorId: `demo-c-${i + 1}`, authorName: c.authorName,
                authorDistrict: c.authorDistrict || '', authorTrustLevel: c.authorTrustLevel || 0,
                voteCount: c.voteCount || 0, approved: c.approved !== false,
                createdAt, updatedAt: createdAt,
              }
            };
          });
          const savedMap = new Map();
          for (let i = 0; i < comments.length; i++) {
            const c = comments[i];
            const parentRef = c._seedParentRef;
            let parent = null;
            if (typeof parentRef === 'string' && parentRef.startsWith('@SIBLING_')) {
              const n = Number(parentRef.replace('@SIBLING_', ''));
              const sameTopicSameDepth = comments.filter(
                (x, i2) => x._seedTopicId === c._seedTopicId && x._depth === c._depth - 1 && i2 < i,
              );
              const sib = sameTopicSameDepth[n];
              parent = sib ? savedMap.get(sib) : null;
            } else if (parentRef) {
              parent = savedMap.get(parentRef);
            }
            if (parent) {
              c.body.parentId = parent._id;
              c.body.rootId = parent.rootId || parent._id;
              c.body.depth = Math.min(MAX_COMMENT_DEPTH, (parent.depth || 0) + 1);
              c.body.path = [...(parent.path || [])];
            } else {
              c.body.depth = 0;
              c.body.path = [];
            }
            const doc = new Comment(c.body);
            doc.path.push(doc._id);
            if (!c.body.rootId) doc.rootId = doc._id;
            await doc.save();
            savedMap.set(`__idx_${i}`, doc);
            if (parent) {
              parent.replyCount = (parent.replyCount || 0) + 1;
              await parent.save();
            }
          }
        }
        console.log(`[community] Seeded ${savedTopics.length} topics with ${seed.comments?.length || 0} comments`);
      }
    }
  } catch (err) {
    console.debug('[community] DB seed skipped (DB unavailable or duplicate):', err.message);
  }
  seedInitialized = true;
}
ensureSeed().catch(() => {});

module.exports = router;
module.exports.readSeed = readSeed;
module.exports.computeTrust = computeTrust;
module.exports.trustLabel = trustLabel;
