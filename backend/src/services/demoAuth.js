const jwt = require('jsonwebtoken');

// Demo-mode auth (simulated for the SIH demo). Tokens are signed with a shared
// secret; production swaps this for Firebase ID-token verification (see
// middleware/auth.js, which still accepts Firebase tokens when the service
// account is configured).
const ISSUER = 'kisan360-demo';
const AUDIENCE = 'kisan360-web';
const ROLES = ['farmer', 'buyer', 'fpo', 'admin'];
const DEV_SECRET = 'kisan360-dev-demo-secret'; // dev convenience only

const DEMO_PROFILES = {
  farmer: { name: 'Demo Farmer', district: 'Pune' },
  buyer: { name: 'Demo Buyer', district: 'Mumbai' },
  fpo: { name: 'Demo FPO', district: 'Nashik' },
  admin: { name: 'Demo Admin', district: 'Mumbai' },
};

function getSecret() {
  if (process.env.DEMO_JWT_SECRET) return process.env.DEMO_JWT_SECRET;
  if (process.env.NODE_ENV === 'production') return null;
  return DEV_SECRET;
}

function normalizeRole(role) {
  return ROLES.includes(role) ? role : 'farmer';
}

function signDemoToken({ uid, role = 'farmer', name, district }) {
  const secret = getSecret();
  if (!secret) throw new Error('DEMO_JWT_SECRET not configured (set it in backend/.env)');
  const cleanRole = normalizeRole(role);
  const profile = DEMO_PROFILES[cleanRole];
  const payload = {
    sub: uid || `demo-${cleanRole}`,
    role: cleanRole,
    name: name || profile.name,
    district: district || profile.district,
    demo: true,
  };
  return jwt.sign(payload, secret, { issuer: ISSUER, audience: AUDIENCE, expiresIn: '7d' });
}

function verifyDemoToken(token) {
  const secret = getSecret();
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret, { issuer: ISSUER, audience: AUDIENCE });
    if (!decoded || !decoded.demo) return null;
    return decoded;
  } catch {
    return null;
  }
}

function toDemoUser(decoded) {
  return {
    uid: decoded.sub,
    role: decoded.role,
    name: decoded.name,
    district: decoded.district,
    auth: 'demo',
    demo: true,
  };
}

module.exports = { ISSUER, AUDIENCE, ROLES, DEMO_PROFILES, normalizeRole, signDemoToken, verifyDemoToken, toDemoUser };
