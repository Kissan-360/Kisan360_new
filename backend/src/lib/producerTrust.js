/**
 * Producer trust signals for buy-side lot listings.
 *
 * `producerPhoneOnFile` means the producer stored a WhatsApp opt-in phone on
 * their User record. It is a contact signal only — it is NOT KYC identity
 * verification and must never be presented as such.
 */
function phoneOnFileUids(users = []) {
  const uids = new Set();
  for (const user of users || []) {
    const uid = user?.firebaseUid || user?.uid;
    const phone = typeof user?.phone === 'string' ? user.phone.trim() : '';
    if (uid && phone) uids.add(String(uid));
  }
  return uids;
}

/**
 * Annotate lot rows for buyer display without leaking producer uids or phone
 * numbers. Input lots are lean objects that still contain `farmerUid`.
 */
function annotateProducerTrust(lots = [], users = []) {
  const phoneUids = phoneOnFileUids(users);
  return (lots || []).map(({ farmerUid, ...rest }) => ({
    ...rest,
    producer: rest.farmerName || (rest.district ? `Producer · ${rest.district}` : 'Producer'),
    producerPhoneOnFile: phoneUids.has(String(farmerUid)),
  }));
}

module.exports = { phoneOnFileUids, annotateProducerTrust };
