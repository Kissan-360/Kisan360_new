const { admin } = require('../config/firebase');
const { verifyDemoToken, toDemoUser } = require('../services/demoAuth');

const isFirebaseReady = () => admin.apps && admin.apps.length > 0;

function readBearer(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

// Accepts a demo JWT (from POST /api/auth/demo-login) or, when Firebase Admin is
// configured, a Firebase ID token.
const authenticateUser = async (req, res, next) => {
  const token = readBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided. Use POST /api/auth/demo-login to get one.' });
  }

  const demo = verifyDemoToken(token);
  if (demo) {
    req.user = toDemoUser(demo);
    return next();
  }

  if (!isFirebaseReady()) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = { uid: decodedToken.uid, email: decodedToken.email || '', name: decodedToken.name || '', auth: 'firebase' };
    return next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Best-effort identity for a request, without rejecting anything.
 *
 * Some recorded milestones sit on PUBLIC routes (net-realization, market
 * prices) that never run auth middleware — so a farmer's decision was landing in
 * the pilot report as `anonymous`, which made the role and district breakdown
 * useless. This decodes the token when one is present and otherwise returns
 * null; it is called AFTER the response has been sent, so a Firebase round-trip
 * here costs the user nothing.
 *
 * Never use this for authorization — it does not reject.
 */
async function peekUser(req) {
  if (req.user) return req.user;
  const token = readBearer(req);
  if (!token) return null;
  const demo = verifyDemoToken(token);
  if (demo) return toDemoUser(demo);
  if (!isFirebaseReady()) return null;
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return { uid: decodedToken.uid, email: decodedToken.email || '', name: decodedToken.name || '', auth: 'firebase' };
  } catch {
    return null;
  }
}

/**
 * The one identity policy for authenticated writes.
 *
 * Who the actor is comes ONLY from the verified token — never from the request
 * body, which any client can forge (the pre-hardening community routes trusted
 * body.userId/authorName). `name` is a display label read from the token
 * (demo JWTs and Firebase tokens both carry one when set), falling back to
 * `fallback` when absent.
 */
function identityOf(req, fallback = 'Farmer') {
  const user = req.user || {};
  return {
    uid: String(user.uid || ''),
    name: String(user.name || '').trim() || fallback,
    role: String(user.role || ''),
    district: String(user.district || ''),
  };
}

// Like authenticateUser but never rejects: attaches a user when a valid token
// is present and otherwise proceeds anonymously.
const optionalAuth = async (req, res, next) => {
  const token = readBearer(req);
  if (token) {
    const demo = verifyDemoToken(token);
    if (demo) {
      req.user = toDemoUser(demo);
      return next();
    }
    if (isFirebaseReady()) {
      try {
        req.user = await admin.auth().verifyIdToken(token);
        return next();
      } catch {
        // ignore invalid firebase token — treat as anonymous
      }
    }
  }
  return next();
};

module.exports = { authenticateUser, optionalAuth, identityOf, peekUser, readBearer };
