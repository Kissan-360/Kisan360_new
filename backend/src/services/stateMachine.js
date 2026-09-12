// Server-enforced state machines for the simulated payment/offer flow.
// Illegal transitions are rejected with HTTP 422 by the routes.

const MACHINES = {
  // Payment: PENDING → HELD (buyer accepts) → RELEASED (settled after delivery).
  payment: {
    initial: 'PENDING',
    allowed: {
      PENDING: ['HELD', 'CANCELLED'],
      HELD: ['RELEASED', 'CANCELLED'],
      RELEASED: [],
      CANCELLED: [],
    },
  },
  // Offer: SENT → ACCEPTED (payment moves to HELD) | REJECTED | WITHDRAWN | EXPIRED.
  offer: {
    initial: 'SENT',
    allowed: {
      SENT: ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'],
      ACCEPTED: [],
      REJECTED: [],
      WITHDRAWN: [],
      EXPIRED: [],
    },
  },
  // Grievance (HLD P1): Raise → Open → Under Review → Resolved (or Rejected).
  grievance: {
    initial: 'OPEN',
    allowed: {
      OPEN: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
      UNDER_REVIEW: ['RESOLVED', 'REJECTED'],
      RESOLVED: [],
      REJECTED: [],
    },
  },
  // Logistics: Requested → Quoted → Accepted → Scheduled → In Transit → Delivered.
  logistics: {
    initial: 'REQUESTED',
    allowed: {
      REQUESTED: ['QUOTED', 'CANCELLED'],
      QUOTED: ['ACCEPTED', 'CANCELLED'],
      ACCEPTED: ['SCHEDULED', 'CANCELLED'],
      SCHEDULED: ['IN_TRANSIT', 'CANCELLED'],
      IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [],
      CANCELLED: [],
    },
  },
};

function canTransition(machineName, from, to) {
  const machine = MACHINES[machineName];
  if (!machine) throw new Error(`Unknown state machine: ${machineName}`);
  if (!(from in machine.allowed)) return false;
  return machine.allowed[from].includes(to);
}

function allowedTransitions(machineName, status) {
  const machine = MACHINES[machineName];
  return machine ? (machine.allowed[status] || []) : [];
}

// record: { status, history: [] } (mongoose doc or plain object). Appends to
// record.history and mutates status in place. Returns the updated record.
function transition(machineName, record, to, ctx = {}) {
  const from = record.status || MACHINES[machineName].initial;
  if (!canTransition(machineName, from, to)) {
    const err = new Error(`Illegal transition ${from} → ${to} (allowed: ${allowedTransitions(machineName, from).join(', ') || 'none'})`);
    err.code = 'ILLEGAL_TRANSITION';
    err.from = from;
    err.to = to;
    throw err;
  }
  record.status = to;
  const entry = {
    from,
    to,
    status: to,
    at: new Date().toISOString(),
    by: ctx.by || 'system',
    note: ctx.note || '',
  };
  if (Array.isArray(record.history)) record.history.push(entry);
  return record;
}

module.exports = { MACHINES, canTransition, allowedTransitions, transition };
