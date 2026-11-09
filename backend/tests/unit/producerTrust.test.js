const { phoneOnFileUids, annotateProducerTrust } = require('../../src/lib/producerTrust');

describe('producerTrust', () => {
  test('phoneOnFileUids includes only non-empty phones', () => {
    const uids = phoneOnFileUids([
      { firebaseUid: 'demo-farmer', phone: '919999999999' },
      { firebaseUid: 'other', phone: '' },
      { firebaseUid: 'missing', phone: null },
      { uid: 'legacy', phone: ' 919999999998 ' },
    ]);
    expect([...uids].sort()).toEqual(['demo-farmer', 'legacy']);
  });

  test('annotateProducerTrust strips uid and adds phone-on-file signal', () => {
    const listed = annotateProducerTrust([
      { _id: 'l1', farmerUid: 'demo-farmer', farmerName: 'Ramesh', district: 'Nashik', crop: 'Onion' },
      { _id: 'l2', farmerUid: 'no-phone', district: 'Pune', crop: 'Tomato' },
    ], [
      { firebaseUid: 'demo-farmer', phone: '919999999999' },
    ]);

    expect(listed[0]).toMatchObject({
      _id: 'l1',
      producer: 'Ramesh',
      producerPhoneOnFile: true,
    });
    expect(listed[0].farmerUid).toBeUndefined();
    expect(listed[0].phone).toBeUndefined();
    expect(listed[1]).toMatchObject({
      _id: 'l2',
      producer: 'Producer · Pune',
      producerPhoneOnFile: false,
    });
  });
});
