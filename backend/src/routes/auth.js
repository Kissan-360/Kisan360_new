const express = require('express');
const { ROLES, DEMO_PROFILES, normalizeRole, signDemoToken } = require('../services/demoAuth');
const { authenticateUser } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/demo-login — simulated login for the demo.
// No real credentials: picks a demo identity (farmer/buyer/fpo), returns a
// signed demo JWT. Production would exchange a Firebase ID token instead.
router.post('/demo-login', (req, res) => {
  const { role, name, district, uid } = req.body || {};
  const cleanRole = normalizeRole(role);
  const profile = DEMO_PROFILES[cleanRole];

  try {
    const token = signDemoToken({ uid, role: cleanRole, name, district });
    return res.json({
      success: true,
      token,
      demo: true,
      user: {
        uid: uid || `demo-${cleanRole}`,
        role: cleanRole,
        name: name || profile.name,
        district: district || profile.district,
        demo: true,
      },
      note: 'Demo login — simulated for the SIH demo. No real account or credentials; production uses Firebase ID-token verification.',
    });
  } catch (error) {
    console.error('demo-login error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/auth/me — current authenticated user
router.get('/me', authenticateUser, (req, res) => {
  res.json({ success: true, user: req.user });
});

// GET /api/auth/roles — discover demo roles (used by the login UI)
router.get('/roles', (req, res) => {
  res.json({
    success: true,
    roles: ROLES.filter(r => r !== 'admin'),
    profiles: Object.fromEntries(ROLES.filter(r => r !== 'admin').map(r => [r, DEMO_PROFILES[r]])),
    note: 'Demo identities — simulated for the SIH demo.',
  });
});

module.exports = router;
