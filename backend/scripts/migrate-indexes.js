#!/usr/bin/env node
/**
 * migrate-indexes.js — apply the production DB index manifest.
 *
 * Usage (from backend/):
 *   node scripts/migrate-indexes.js --dry-run   # print expected indexes only
 *   node scripts/migrate-indexes.js             # create missing indexes
 *
 * The script intentionally disables the demo in-memory fallback: a migration
 * must only run against the configured MongoDB, never silently against an
 * ephemeral database.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.KISAN_DEMO_MEMORY_DB = '0';

const mongoose = require('mongoose');
const connectDB = require('../src/config/mongodb');
const { EXPECTED_INDEXES } = require('../src/lib/dbIndexes');

const models = {
  Lot: require('../src/models/Lot'),
  Offer: require('../src/models/Offer'),
  Payment: require('../src/models/Payment'),
  Grievance: require('../src/models/Grievance'),
  Detection: require('../src/models/Detection'),
  Farm: require('../src/models/Farm'),
  GradeCertificate: require('../src/models/GradeCertificate'),
  UsageEvent: require('../src/models/UsageEvent'),
};

function printManifest() {
  console.log(`Expected indexes: ${EXPECTED_INDEXES.length}`);
  for (const entry of EXPECTED_INDEXES) {
    console.log(
      `- ${entry.collection}.${entry.options?.name || 'unnamed'} ${JSON.stringify(entry.keys)} — ${entry.reason}`,
    );
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    printManifest();
    console.log('[dry-run] No database connection was opened.');
    return;
  }

  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ MongoDB is not connected. Set MONGODB_URI and retry.');
    process.exit(2);
  }

  let created = 0;
  let existing = 0;
  for (const entry of EXPECTED_INDEXES) {
    const Model = models[entry.model];
    if (!Model) {
      console.error(`❌ Unknown model in index manifest: ${entry.model}`);
      process.exit(2);
    }
    const before = await Model.collection.indexes();
    const wanted = entry.options?.name;
    const alreadyThere = before.some((idx) => idx.name === wanted);
    await Model.collection.createIndex(entry.keys, entry.options || {});
    if (alreadyThere) {
      existing += 1;
      console.log(`… ${entry.collection}.${wanted} already present`);
    } else {
      created += 1;
      console.log(`✅ ${entry.collection}.${wanted} created`);
    }
  }

  console.log(`\nIndex migration complete: ${created} created, ${existing} already present.`);
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('Index migration failed:', err.message);
  process.exit(2);
});
