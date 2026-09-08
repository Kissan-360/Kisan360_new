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

module.exports = { authenticateUser, optionalAuth };
