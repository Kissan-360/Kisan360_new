/**
 * Production DB index manifest.
 *
 * Idempotent compound indexes for the hot query paths used by lots/offers/
 * payments/notifications. Schema-level indexes live on the Mongoose models;
 * this manifest is the operational checklist used by scripts/migrate-indexes.js
 * and covered by unit tests so the schema and deploy runbook cannot drift.
 */
const EXPECTED_INDEXES = [
  {
    model: 'Lot',
    collection: 'lots',
    keys: { status: 1, district: 1, grade: 1, crop: 1, createdAt: -1 },
    options: { name: 'lots_available_market' },
    reason: 'Buy-side available-lot browse: OPEN lots filtered by district/grade/crop, newest first.',
  },
  {
    model: 'Lot',
    collection: 'lots',
    keys: { farmerUid: 1, status: 1, createdAt: -1 },
    options: { name: 'lots_farmer_status_created' },
    reason: 'Farmer lot list and status-scoped lookups.',
  },
  {
    model: 'Offer',
    collection: 'offers',
    keys: { farmerUid: 1, status: 1, createdAt: -1 },
    options: { name: 'offers_farmer_status_created' },
    reason: 'Farmer offer inbox, notifications, and simulate-accept-latest.',
  },
  {
    model: 'Offer',
    collection: 'offers',
    keys: { lotId: 1, status: 1 },
    options: { name: 'offers_lot_status' },
    reason: 'Offer lookup by lot and lifecycle state.',
  },
  {
    model: 'Offer',
    collection: 'offers',
    keys: { buyerId: 1, status: 1, createdAt: -1 },
    options: { name: 'offers_buyer_status_created' },
    reason: 'Buyer-side offer views and acceptance flows.',
  },
  {
    model: 'Payment',
    collection: 'payments',
    keys: { farmerUid: 1, status: 1, createdAt: -1 },
    options: { name: 'payments_farmer_status_created' },
    reason: 'Farmer payment list scoped by escrow status.',
  },
  {
    model: 'Payment',
    collection: 'payments',
    keys: { farmerUid: 1, updatedAt: -1 },
    options: { name: 'payments_farmer_updated' },
    reason: 'Notifications derive recent payment events per farmer.',
  },
  {
    model: 'Payment',
    collection: 'payments',
    keys: { lotId: 1 },
    options: { name: 'payments_lot' },
    reason: 'Payment lookup by lot for trade timeline/receipt joins.',
  },
  {
    model: 'Grievance',
    collection: 'grievances',
    keys: { raisedByUid: 1, status: 1, updatedAt: -1 },
    options: { name: 'grievances_raised_status_updated' },
    reason: 'Farmer grievance list and status updates in notifications.',
  },
  {
    model: 'Detection',
    collection: 'detections',
    keys: { firebaseUid: 1, createdAt: -1 },
    options: { name: 'detections_user_created' },
    reason: 'Recent disease detections per user.',
  },
  {
    model: 'Farm',
    collection: 'farms',
    keys: { firebaseUid: 1, createdAt: -1 },
    options: { name: 'farms_user_created' },
    reason: 'Farmer farm list in creation order.',
  },
  {
    model: 'GradeCertificate',
    collection: 'gradecertificates',
    keys: { fpoStatus: 1, createdAt: -1 },
    options: { name: 'grade_certs_fpo_status_created' },
    reason: 'FPO review queue by certification status.',
  },
  {
    model: 'UsageEvent',
    collection: 'usageevents',
    keys: { installId: 1, at: -1 },
    options: { name: 'usage_install_at' },
    reason: 'Pilot telemetry grouped by anonymous install over time.',
  },
];

function indexKeyName(entry) {
  return `${entry.collection}:${entry.options?.name || Object.keys(entry.keys).join('_')}`;
}

module.exports = { EXPECTED_INDEXES, indexKeyName };
