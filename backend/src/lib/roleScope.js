/* roleScope.js — which SIDE of the escrow books (offers, payments) a login
 * sits on, and what `?role=` is allowed to say.
 *
 * One definition, imported by both books. It was previously copy-pasted as
 * `['buyer', 'fpo', 'admin']` in four places, and the frontend carried its own
 * copy — which is exactly how the two sides drifted apart and broke the FPO
 * demo login (see below).
 *
 * ── Why FPO is PRODUCER side here ────────────────────────────────────────────
 * An FPO is a producer group: it pools its members' produce and sells the
 * pooled lot. On the offers and payments books it is therefore a SELLER and
 * must see ITS OWN book, exactly like a farmer.
 *
 * Listing it as buyer-side caused a real, silent break: the sell screen asked
 * for `?role=farmer` (matching its own definition of the role), this module
 * answered `buyer`, and the mismatch returned 403 — so an FPO demo login landed
 * on a selling page with an EMPTY offers list and NO payment timeline.
 *
 * ── What this module deliberately does NOT decide ────────────────────────────
 * The same role list shows up in two unrelated policies, which must not be
 * conflated with book scope:
 *   • who may move a GRIEVANCE (the local dispute authority) — routes/grievances.js
 *   • who may trigger a MARKET REFRESH (an operator action) — routes/market.js
 * Both still treat `fpo` as an authority/operator. Those are capabilities, not
 * sides, and they keep their own lists.
 */

/** Buyer-side = may read the whole escrow book. FPO is NOT buyer-side. */
function isBuyerSideRole(role) {
  return ['buyer', 'admin'].includes(role);
}

/** 'buyer' | 'farmer' for a verified token role. */
function sideOfRole(role) {
  return isBuyerSideRole(role) ? 'buyer' : 'farmer';
}

/**
 * Resolve the listing scope for a request whose token is already verified.
 *
 * Scope comes from the TOKEN, never the query string. `?role=` is only a view
 * selector: it must agree with the caller's own side, so a farmer cannot read
 * the escrow book by asking for it. An unknown/garbage value is ignored rather
 * than rejected (the token already decided).
 *
 * Throws an Error with `status = 403` on an escalation attempt.
 */
function listingScope(req) {
  const side = sideOfRole(req.user && req.user.role);
  const requested = String((req.query && req.query.role) || '').toLowerCase();
  if (requested && ['farmer', 'buyer'].includes(requested) && requested !== side) {
    const err = new Error("You cannot view the other side's book with this login");
    err.status = 403;
    throw err;
  }
  return side;
}

/** The Mongo filter for a book: buyer-side reads everything, everyone else own. */
function bookFilter(req) {
  return listingScope(req) === 'buyer' ? {} : { farmerUid: req.user.uid };
}

module.exports = { isBuyerSideRole, sideOfRole, listingScope, bookFilter };
