/* Who is signed in, and therefore which workspace they get.
 *
 * There are two distinct sides of this product and one group that straddles
 * them, so role checks live here instead of being re-typed in every screen
 * (three copies had drifted, and one of them had `fpo` on the buyer side):
 *
 *   producer side — farmer, fpo   : list lots, pool with the FPO, sell
 *   buyer side    — buyer, admin  : browse lots, offer, accept, release funds
 *
 * An FPO is a PRODUCER GROUP: /fpo pools member lots into one bulk lot and
 * hands off to /trade. The API also lets `fpo` accept an offer (a permissions
 * convenience), which is why the two sides must not be conflated in the UI —
 * an FPO demo-login that landed in the buyer workspace could never reach the
 * pooling screen that is its entire purpose.
 */

export type RoleSide = 'producer' | 'buyer';

export const isFpoRole = (role?: string): boolean => role === 'fpo';

/** Buyer workspace: browse/offer/accept/release. */
export const isBuyerSideRole = (role?: string): boolean => ['buyer', 'admin'].includes(role || '');

/** Producer workspace: lots, pooling, net realization, selling flow. */
export const isProducerSideRole = (role?: string): boolean => !isBuyerSideRole(role);

export const sideOf = (role?: string): RoleSide => (isBuyerSideRole(role) ? 'buyer' : 'producer');
