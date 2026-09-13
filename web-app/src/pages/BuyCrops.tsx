import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, Search, X, Check, ArrowRight, Store, Handshake, Wallet, Info, RefreshCw,
} from 'lucide-react';
import { API_URL, apiFetch } from '../lib/api';
import { MAHARASHTRA_DISTRICTS } from '../lib/maharashtraData';
import { useCropCategories, categoryForCrop, categoryLabel } from '../lib/cropCategories';
import {
  PageTransition, PageHeader, Card, SectionLabel, Chip, EmptyState,
  SkeletonLines, StaggerList, StaggerItem, PrimaryButton, GhostButton, StatCard, CropIcon,
  Quantity,
} from '../components/ui/kit';
import { quantityTriplet } from '../lib/units';
import { isBuyerSideRole } from '../lib/roles';
import { useTranslation } from '../i18n';
import { useAuth } from '../hooks/useAuth';

/* Buy Crops — the BUY side of the marketplace.
 *
 * This page exists because a buyer demo-login previously had nowhere to go:
 * `GET /api/lots` returns only your OWN lots, and `POST /api/offers` used to
 * require owning the lot, so a buyer saw an empty page with no way to buy.
 * Here a buyer browses open lots listed by other producers, filters them by
 * crop category, and sends a purchase offer the producer can accept.
 *
 * Honesty notes surfaced in the UI: producer identity verification is NOT
 * implemented (the API says so and the page repeats it), and every price is
 * the producer's own asking price or the buyer's own offer — nothing is
 * invented here. */

const inr = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

interface ListedLot {
  _id: string;
  crop: string;
  variety?: string;
  grade?: string;
  quantity: number;
  unit: string;
  district?: string;
  producer?: string;
  photos?: string[];
  assayStatus?: string;
  expectedPricePerQuintal?: number | null;
  notes?: string;
  createdAt?: string;
}

interface Offer {
  _id: string;
  lotId: string | { _id: string; crop?: string };
  crop: string;
  quantityQuintals: number;
  offeredPricePerQuintal: number;
  amount: number;
  status: string;
  direction?: string;
  buyerUid?: string;
  history?: { status: string; at: string; note?: string }[];
}

interface Payment {
  _id: string;
  offerId: string;
  lotId: string;
  crop: string;
  quantityQuintals: number;
  amount: number;
  status: string;
}

const lotIdOf = (o: Offer) => (typeof o.lotId === 'object' && o.lotId ? o.lotId._id : String(o.lotId || ''));

export default function BuyCrops() {
  const { t } = useTranslation();
  const { user, demoSignIn } = useAuth();
  const { categories } = useCropCategories();
  const buyer = isBuyerSideRole(user?.role);

  const [lots, setLots] = useState<ListedLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [offers, setOffers] = useState<Offer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Filters — category is the one Charan asked for, the rest narrow the list.
  const [category, setCategory] = useState('');
  const [crop, setCrop] = useState('');
  const [district, setDistrict] = useState('');
  const [grade, setGrade] = useState('');
  const [minQty, setMinQty] = useState('');
  const [search, setSearch] = useState('');

  // Offer sheet
  const [sheetLot, setSheetLot] = useState<ListedLot | null>(null);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerNotes, setOfferNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [banner, setBanner] = useState('');
  const [switching, setSwitching] = useState(false);

  const cropOptions = useMemo(() => {
    const pool = category ? categories.filter((c) => c.id === category) : categories;
    return [...new Set(pool.flatMap((c) => c.crops.map((x) => x.name)))].sort();
  }, [categories, category]);

  const loadLots = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (category && !crop) params.set('category', category);
      if (crop) params.set('crop', crop);
      if (district) params.set('district', district);
      if (grade) params.set('grade', grade);
      if (minQty) params.set('minQty', minQty);
      const res = await apiFetch(`${API_URL}/lots/available?${params.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || t('buy.loadFailed'));
      setLots(json?.lots || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('buy.loadFailed'));
      setLots([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMine = async () => {
    try {
      const [oRes, pRes] = await Promise.allSettled([
        apiFetch(`${API_URL}/offers`),
        apiFetch(`${API_URL}/payments`),
      ]);
      if (oRes.status === 'fulfilled' && oRes.value.ok) {
        const j = await oRes.value.json();
        const mine = (j.offers || []).filter(
          (o: Offer) => o.direction === 'BUYER_TO_FARMER' && (!user?.uid || o.buyerUid === user.uid)
        );
        setOffers(mine);
      }
      if (pRes.status === 'fulfilled' && pRes.value.ok) {
        const j = await pRes.value.json();
        setPayments(j.payments || []);
      }
    } catch { /* the browse list is the primary content; offers are secondary */ }
  };

  useEffect(() => {
    if (!buyer) { setLoading(false); return; }
    loadLots();
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyer, category, crop, district, grade, minQty]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lots;
    return lots.filter((l) =>
      l.crop.toLowerCase().includes(q) ||
      (l.variety || '').toLowerCase().includes(q) ||
      (l.district || '').toLowerCase().includes(q) ||
      (l.producer || '').toLowerCase().includes(q)
    );
  }, [lots, search]);

  const reachableValue = useMemo(
    () => visible.reduce((sum, l) => sum + (Number(l.expectedPricePerQuintal) || 0) * (Number(l.quantity) || 0), 0),
    [visible]
  );

  const paymentForOffer = (offerId: string) => payments.find((p) => String(p.offerId) === String(offerId));

  const openSheet = (lot: ListedLot) => {
    setSheetLot(lot);
    setSendError('');
    setOfferNotes('');
    setOfferPrice(lot.expectedPricePerQuintal ? String(lot.expectedPricePerQuintal) : '');
  };

  const sendOffer = async () => {
    if (!sheetLot) return;
    const price = Number(offerPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setSendError(t('buy.priceInvalid'));
      return;
    }
    setSending(true);
    setSendError('');
    try {
      const res = await apiFetch(`${API_URL}/offers`, {
        method: 'POST',
        body: JSON.stringify({ lotId: sheetLot._id, offeredPricePerQuintal: price, notes: offerNotes }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || t('buy.sendFailed'));
      setSheetLot(null);
      setBanner(t('buy.offerSent', { crop: sheetLot.crop }));
      await Promise.all([loadLots(), loadMine()]);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : t('buy.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const withdraw = async (offer: Offer) => {
    try {
      const res = await apiFetch(`${API_URL}/offers/${offer._id}/withdraw`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || t('buy.withdrawFailed'));
      }
      setBanner(t('buy.withdrawn', { crop: offer.crop }));
      await Promise.all([loadLots(), loadMine()]);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : t('buy.withdrawFailed'));
    }
  };

  const switchToBuyer = async () => {
    setSwitching(true);
    try {
      await demoSignIn('buyer');
      setBanner(t('buy.switched'));
    } catch {
      setBanner(t('buy.switchFailed'));
    } finally {
      setSwitching(false);
    }
  };

  /* A farmer landing here is not an error — but this is the buyer workspace, so
     offer a one-tap demo role switch instead of showing a farmer a dead end. */
  if (!buyer) {
    return (
      <PageTransition>
        <div className="p-6 lg:p-8 space-y-6">
          <PageHeader eyebrow={t('buy.eyebrow')} title={t('buy.title')} subtitle={t('buy.buyerOnly')} />
          <Card className="p-6 max-w-2xl">
            <EmptyState
              icon={Store}
              title={t('buy.buyerOnlyTitle')}
              description={t('buy.buyerOnlyDesc')}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <PrimaryButton onClick={switchToBuyer} icon={Handshake} disabled={switching}>
                    {switching ? t('buy.switching') : t('buy.switchCta')}
                  </PrimaryButton>
                  <GhostButton onClick={() => { window.location.href = '/trade'; }}>
                    {t('buy.goToMyLots')}
                  </GhostButton>
                </div>
              }
            />
          </Card>
          {banner && <p className="text-sm text-emerald-700">{banner}</p>}
        </div>
      </PageTransition>
    );
  }

  const openOffers = offers.filter((o) => o.status === 'SENT');
  const settledOffers = offers.filter((o) => o.status !== 'SENT');

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 space-y-6 pb-24">
        <PageHeader
          eyebrow={t('buy.eyebrow')}
          title={t('buy.title')}
          subtitle={t('buy.subtitle')}
          actions={<Chip color="sky">{t('buy.buyerBadge')}</Chip>}
        />

        {banner && (
          <div className="card p-4 border-emerald-300 bg-emerald-50/70 text-sm text-emerald-900 flex items-start justify-between gap-3">
            <span className="flex items-start gap-2">
              <Check size={16} className="mt-0.5 shrink-0" />
              {banner}
            </span>
            <button className="text-xs text-stone-400 hover:text-stone-600 shrink-0" onClick={() => setBanner('')}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── Execution summary ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={t('buy.statListed')} value={visible.length} icon={Package} />
          <StatCard label={t('buy.statOpenOffers')} value={openOffers.length} icon={Handshake} delay={0.05} />
          <StatCard label={t('buy.statSettled')} value={settledOffers.length} icon={Check} delay={0.1} />
          <StatCard label={t('buy.statValue')} value={reachableValue} prefix="₹" icon={Wallet} delay={0.15} />
        </div>

        {/* ── Filters ── */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <SectionLabel className="mb-0">{t('buy.filterBy')}</SectionLabel>
            <button
              onClick={() => { setCategory(''); setCrop(''); setDistrict(''); setGrade(''); setMinQty(''); setSearch(''); }}
              className="inline-flex items-center gap-1.5 min-h-[36px] text-xs font-semibold text-stone-500 hover:text-stone-800"
            >
              <RefreshCw size={13} /> {t('buy.clearFilters')}
            </button>
          </div>

          {/* Crop category chips — the grouping a buyer actually thinks in. */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => { setCategory(''); setCrop(''); }}
              className={`min-h-[36px] rounded-full px-3 text-xs font-semibold transition-colors ${!category ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
            >
              {t('buy.allCategories')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setCategory(cat.id === category ? '' : cat.id); setCrop(''); }}
                className={`min-h-[36px] rounded-full px-3 text-xs font-semibold transition-colors ${category === cat.id ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
              >
                {categoryLabel(cat, t)} · {cat.cropCount}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1" htmlFor="buy-crop">{t('buy.crop')}</label>
              <select id="buy-crop" className="input-field" value={crop} onChange={(e) => setCrop(e.target.value)}>
                <option value="">{t('buy.allCrops')}</option>
                {cropOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1" htmlFor="buy-district">{t('buy.district')}</label>
              <select id="buy-district" className="input-field" value={district} onChange={(e) => setDistrict(e.target.value)}>
                <option value="">{t('market.allDistricts')}</option>
                {MAHARASHTRA_DISTRICTS.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1" htmlFor="buy-grade">{t('buy.grade')}</label>
              <select id="buy-grade" className="input-field" value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">{t('buy.anyGrade')}</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="Unassessed">{t('buy.unassessed')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1" htmlFor="buy-minq">{t('buy.minQty')}</label>
              <input
                id="buy-minq"
                className="input-field"
                inputMode="numeric"
                placeholder={t('buy.minQtyHint')}
                value={minQty}
                onChange={(e) => setMinQty(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          </div>

          <div className="relative mt-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              className="input-field pl-9"
              placeholder={t('buy.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('buy.searchPlaceholder')}
            />
          </div>
        </Card>

        {/* ── Listed lots ── */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <SectionLabel className="mb-0">{t('buy.listedLots')}</SectionLabel>
              <p className="text-xs text-stone-400 mt-0.5">{t('buy.listedHint')}</p>
            </div>
            <Chip color="stone">{t('buy.countListed', { count: visible.length })}</Chip>
          </div>

          {loading && <Card className="p-5"><SkeletonLines rows={3} /></Card>}

          {!loading && error && (
            <Card className="p-6">
              <EmptyState
                icon={Info}
                title={t('buy.loadFailed')}
                description={error}
                action={<PrimaryButton onClick={loadLots} icon={RefreshCw}>{t('common.retry')}</PrimaryButton>}
              />
            </Card>
          )}

          {!loading && !error && visible.length === 0 && (
            <Card className="p-6">
              <EmptyState
                icon={Package}
                title={t('buy.noLots')}
                description={t('buy.noLotsDesc')}
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <PrimaryButton onClick={() => { setCategory(''); setCrop(''); setDistrict(''); setGrade(''); setMinQty(''); setSearch(''); }}>
                      {t('buy.clearFilters')}
                    </PrimaryButton>
                    <Link to="/market" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 min-h-[36px]">
                      {t('buy.checkPrices')} <ArrowRight size={14} />
                    </Link>
                  </div>
                }
              />
            </Card>
          )}

          {!loading && !error && visible.length > 0 && (
            <StaggerList className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {visible.map((lot) => {
                const asking = Number(lot.expectedPricePerQuintal) || 0;
                const total = asking * (Number(lot.quantity) || 0);
                const catId = categoryForCrop(categories, lot.crop);
                const cat = categories.find((c) => c.id === catId);
                const catLabel = cat ? categoryLabel(cat, t) : undefined;
                return (
                  <StaggerItem key={lot._id}>
                    <Card className="p-4 h-full flex flex-col">
                      <div className="flex items-start gap-3">
                        <div className="h-11 w-11 shrink-0 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                          <CropIcon cropName={lot.crop} size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-stone-900 text-sm break-words">
                            {lot.crop}{lot.variety ? ` · ${lot.variety}` : ''}
                          </p>
                          <p className="text-xs text-stone-400 break-words mt-0.5">
                            {lot.producer || t('buy.producer')}
                            {lot.district ? ` · ${lot.district}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 justify-end shrink-0">
                          {catLabel && <Chip color="stone">{catLabel}</Chip>}
                          <Chip color={lot.grade === 'A' ? 'emerald' : lot.grade === 'B' ? 'sky' : 'stone'}>
                            {lot.grade && lot.grade !== 'Unassessed' ? `${t('buy.grade')} ${lot.grade}` : t('buy.unassessed')}
                          </Chip>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg border border-stone-200 bg-white p-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{t('buy.quantity')}</p>
                          <p className="text-stone-800 font-medium mt-0.5">
                            <Quantity value={lot.quantity} unit={lot.unit} stack />
                          </p>
                        </div>
                        <div className="rounded-lg border border-stone-200 bg-white p-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{t('buy.askingPrice')}</p>
                          <p className="text-stone-800 font-medium mt-0.5 tabular">
                            {asking > 0 ? `${inr(asking)}/q` : t('buy.notStated')}
                          </p>
                        </div>
                      </div>

                      {total > 0 && (
                        <p className="text-xs text-stone-500 mt-2">
                          {t('buy.lotValue', { value: inr(total) })}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <PrimaryButton className="text-sm" onClick={() => openSheet(lot)} icon={Handshake}>
                          {t('buy.makeOffer')}
                        </PrimaryButton>
                        {lot.assayStatus && (
                          <span className="text-[11px] text-stone-400">{t('buy.assay')}: {lot.assayStatus}</span>
                        )}
                      </div>
                    </Card>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          )}
        </div>

        {/* ── My purchase offers ── */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <SectionLabel className="mb-0">{t('buy.myOffers')}</SectionLabel>
              <p className="text-xs text-stone-400 mt-0.5">{t('buy.myOffersHint')}</p>
            </div>
            <Chip color={openOffers.length ? 'amber' : 'stone'}>{t('buy.countOpen', { count: openOffers.length })}</Chip>
          </div>

          {offers.length === 0 ? (
            <Card className="p-4">
              <p className="text-sm text-stone-500">{t('buy.noOffersYet')}</p>
            </Card>
          ) : (
            <Card className="p-5">
              <div className="space-y-3">
                {offers.map((o) => {
                  const pay = paymentForOffer(o._id);
                  return (
                    <div key={o._id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-100 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-stone-900 text-sm break-words">
                          {o.crop} · <Quantity value={o.quantityQuintals} unit="quintals" /> · {inr(o.offeredPricePerQuintal)}/q
                        </p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {t('buy.offerTotal', { value: inr(o.amount) })}
                          {pay ? ` · ${t('buy.payment')}: ${pay.status}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip color={o.status === 'ACCEPTED' ? 'emerald' : o.status === 'SENT' ? 'amber' : 'stone'}>
                          {o.status}
                        </Chip>
                        {o.status === 'SENT' && (
                          <GhostButton className="text-xs" onClick={() => withdraw(o)}>
                            {t('buy.withdraw')}
                          </GhostButton>
                        )}
                        {o.status === 'ACCEPTED' && (
                          <Link to="/trade" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 min-h-[36px]">
                            {t('buy.trackPayment')} <ArrowRight size={13} />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-stone-500 mt-3 flex items-start gap-1.5">
                <Info size={12} className="mt-0.5 shrink-0" />
                {t('buy.simulatedNote')}
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* ── Offer sheet ── */}
      {sheetLot && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t('buy.makeOffer')}>
          <div
            className="absolute inset-0 bg-stone-950/50 backdrop-blur-sm"
            onClick={() => setSheetLot(null)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-lg">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-stone-200 p-5 max-h-[85vh] overflow-y-auto k-scroll">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SectionLabel className="mb-1">{t('buy.makeOffer')}</SectionLabel>
                  <h2 className="font-display text-lg font-bold text-stone-900 break-words">
                    {sheetLot.crop}{sheetLot.variety ? ` · ${sheetLot.variety}` : ''}
                  </h2>
                  <p className="text-xs text-stone-400 mt-0.5 break-words">
                    {quantityTriplet(sheetLot.quantity, sheetLot.unit)}
                    {sheetLot.district ? ` · ${sheetLot.district}` : ''}
                    {sheetLot.producer ? ` · ${sheetLot.producer}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setSheetLot(null)}
                  className="shrink-0 rounded-lg p-2.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                  aria-label={t('buy.close')}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-stone-500 mb-1" htmlFor="buy-offer-price">
                  {t('buy.yourPrice')}
                </label>
                <input
                  id="buy-offer-price"
                  className="input-field"
                  inputMode="numeric"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={t('buy.yourPriceHint')}
                />
                {sheetLot.expectedPricePerQuintal ? (
                  <p className="text-[11px] text-stone-400 mt-1">
                    {t('buy.askingIs', { value: `${inr(sheetLot.expectedPricePerQuintal)}/q` })}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-600 mt-1">{t('buy.noAsking')}</p>
                )}
                {Number(offerPrice) > 0 && (
                  <p className="text-xs text-stone-600 mt-2">
                    {t('buy.offerTotal', { value: inr(Number(offerPrice) * (Number(sheetLot.quantity) || 0)) })}
                  </p>
                )}
              </div>

              <div className="mt-3">
                <label className="block text-xs font-medium text-stone-500 mb-1" htmlFor="buy-offer-notes">
                  {t('buy.notes')}
                </label>
                <textarea
                  id="buy-offer-notes"
                  className="input-field min-h-[70px]"
                  value={offerNotes}
                  onChange={(e) => setOfferNotes(e.target.value)}
                  placeholder={t('buy.notesHint')}
                />
              </div>

              {sendError && (
                <p className="text-xs text-red-600 mt-2 flex items-start gap-1.5">
                  <Info size={12} className="mt-0.5 shrink-0" /> {sendError}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <PrimaryButton onClick={sendOffer} icon={Handshake} disabled={sending}>
                  {sending ? t('buy.sending') : t('buy.sendOffer')}
                </PrimaryButton>
                <GhostButton onClick={() => setSheetLot(null)}>{t('buy.cancel')}</GhostButton>
              </div>
              <p className="text-[11px] text-stone-500 mt-3 flex items-start gap-1.5">
                <Info size={12} className="mt-0.5 shrink-0" />
                {t('buy.offerTerms')}
              </p>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
