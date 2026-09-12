import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, MessageSquare, Eye, ThumbsUp, Plus, X, ChevronDown, ChevronUp,
  Pin, Flame, Clock, TrendingUp, Send, Flag, Camera, Trash2, Pencil,
  Sprout, BarChart3, Landmark, Wrench, Award, Users, Image as ImageIcon,
  BadgeCheck, Shield, MessageCircle, Handshake, ArrowLeftRight,
} from 'lucide-react';
import {
  PageHeader, Card, Chip, PrimaryButton, GhostButton, EmptyState,
  SkeletonLines, StaggerList, StaggerItem, TrustBadge, DataTag,
} from '../components/ui/kit';
import ThreadedComments, { type CommentNode } from '../components/ThreadedComments';
import { useTranslation } from '../i18n';
import { apiFetch, API_URL } from '../lib/api';

interface Topic {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorDistrict?: string;
  authorTrustLevel: number;
  authorTrustLabel: 'new' | 'member' | 'trusted';
  category: 'crop_advice' | 'market_prices' | 'government_schemes' | 'government_notices' | 'equipment' | 'success_stories' | 'general_farming' | 'discussion' | 'trade' | 'exchange';
  authorRole?: string;
  tags: string[];
  photoDataUrl?: string;
  voteCount: number;
  commentCount: number;
  viewCount: number;
  hotScore: number;
  pinned?: boolean;
  locked?: boolean;
  approved?: boolean;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

const CATEGORY_LIST: { key: Topic['category'] | 'all'; labelKey: string; Icon: React.ElementType; tone: 'emerald' | 'amber' | 'sky' | 'violet' | 'rose' | 'stone' }[] = [
  { key: 'all', labelKey: 'community.categoryAll', Icon: Users, tone: 'stone' },
  { key: 'government_notices', labelKey: 'community.categoryNotices', Icon: Shield, tone: 'amber' },
  { key: 'crop_advice', labelKey: 'community.categoryCrop', Icon: Sprout, tone: 'emerald' },
  { key: 'market_prices', labelKey: 'community.categoryMarket', Icon: BarChart3, tone: 'sky' },
  { key: 'government_schemes', labelKey: 'community.categorySchemes', Icon: Landmark, tone: 'amber' },
  { key: 'trade', labelKey: 'community.categoryTrade', Icon: Handshake, tone: 'sky' },
  { key: 'discussion', labelKey: 'community.categoryDiscussion', Icon: MessageCircle, tone: 'stone' },
  { key: 'exchange', labelKey: 'community.categoryExchange', Icon: ArrowLeftRight, tone: 'violet' },
  { key: 'equipment', labelKey: 'community.categoryEquipment', Icon: Wrench, tone: 'violet' },
  { key: 'success_stories', labelKey: 'community.categorySuccess', Icon: Award, tone: 'rose' },
  { key: 'general_farming', labelKey: 'community.categoryGeneral', Icon: Users, tone: 'stone' },
];

const SORT_LIST: { key: 'new' | 'hot' | 'top'; labelKey: string; Icon: React.ElementType }[] = [
  { key: 'new', labelKey: 'community.sortNew', Icon: Clock },
  { key: 'hot', labelKey: 'community.sortHot', Icon: Flame },
  { key: 'top', labelKey: 'community.sortTop', Icon: TrendingUp },
];

function timeAgo(ts: string | Date): string {
  if (!ts) return '';
  const ms = new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (Number.isNaN(diff)) return '';
  const sec = Math.max(1, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function catMeta(cat: Topic['category']) {
  return CATEGORY_LIST.find((c) => c.key === cat) || CATEGORY_LIST[0];
}

const CommunityPage: React.FC = () => {
  const { t, language } = useTranslation();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORY_LIST)[number]['key']>('all');
  const [sort, setSort] = useState<'new' | 'hot' | 'top'>('hot');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedData, setSelectedData] = useState<{ topic: Topic | null; comments: CommentNode[] }>({ topic: null, comments: [] });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailVersion, setDetailVersion] = useState(0);
  const [userId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('kisan360-uid');
      if (stored) return stored;
    } catch { /* ignore */ }
    const id = `u-${Math.random().toString(36).slice(2, 8)}`;
    try { localStorage.setItem('kisan360-uid', id); } catch { /* ignore */ }
    return id;
  });

  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<Topic['category']>('general_farming');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formPhoto, setFormPhoto] = useState<string>('');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formApprovalMsg, setFormApprovalMsg] = useState('');

  const [editTopicId, setEditTopicId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedTopic) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedTopic(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedTopic]);

  const [topicVoteState, setTopicVoteState] = useState<Record<string, 1 | -1 | 0>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (category !== 'all') params.set('category', category);
        if (query) params.set('q', query);
        params.set('sort', sort);
        params.set('limit', '30');
        const res = await apiFetch(`${API_URL}/community/topics?${params.toString()}`);
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!cancelled) setTopics(Array.isArray(data?.topics) ? data.topics : []);
      } catch {
        if (!cancelled) setError(t('community.noPosts'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [category, sort, query, t]);

  useEffect(() => {
    if (!selectedTopic) {
      setSelectedData({ topic: null, comments: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      try {
        const res = await apiFetch(`${API_URL}/community/topics/${selectedTopic}`);
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        if (!cancelled) setSelectedData({ topic: data.topic || null, comments: (data.comments || []) as CommentNode[] });
      } catch {
        if (!cancelled) setSelectedData({ topic: null, comments: [] });
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTopic, detailVersion]);

  const [stableOnline] = useState(() => Math.max(8, Math.floor(Math.random() * 12 + 5)));

  const trendingTags = useMemo(() => {
    const freq: Record<string, number> = {};
    topics.forEach((t) => (t.tags || []).forEach((tag) => { freq[tag] = (freq[tag] || 0) + 1; }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag);
  }, [topics]);

  const counts = useMemo(() => ({
    total: topics.length,
    comments: topics.reduce((a, t) => a + (t.commentCount || 0), 0),
    views: topics.reduce((a, t) => a + (t.viewCount || 0), 0),
    online: stableOnline,
  }), [topics, stableOnline]);

  const onFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setFormError(t('community.photoSizeWarning'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFormPhoto(String(reader.result));
    reader.onerror = () => setFormError(t('community.photoSizeWarning'));
    reader.readAsDataURL(file);
  };

  const submitCreate = async () => {
    setFormError('');
    setFormApprovalMsg('');
    if (formTitle.trim().length < 5) {
      setFormError(t('community.validationTitle'));
      return;
    }
    if (formContent.trim().length < 10) {
      setFormError(t('community.validationContent'));
      return;
    }
    setFormSubmitting(true);
    try {
      const res = await apiFetch(`${API_URL}/community/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: formTitle.trim(),
          category: formCategory,
          content: formContent.trim(),
          tags: formTags.split(/[,#]/).map((s) => s.trim()).filter(Boolean),
          photoDataUrl: formPhoto || undefined,
          authorName: 'You',
          language,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error || 'failed');
      }
      const data = await res.json();
      setFormTitle('');
      setFormContent('');
      setFormTags('');
      setFormPhoto('');
      setShowCreate(false);
      if (data.approvalRequired) setFormApprovalMsg(t('community.postApproval'));
      const freshRes = await apiFetch(`${API_URL}/community/topics?sort=new&limit=30`);
      if (freshRes.ok) {
        const fresh = await freshRes.json();
        setTopics(Array.isArray(fresh?.topics) ? fresh.topics : topics);
      }
      setTimeout(() => setFormApprovalMsg(''), 6000);
    } catch (err: any) {
      setFormError(err?.message || t('community.postRateLimit'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const topicVote = async (id: string, value: 1 | -1) => {
    const prev = topicVoteState[id] || 0;
    const next = prev === value ? 0 : value;
    setTopicVoteState((v) => ({ ...v, [id]: next as 1 | -1 | 0 }));
    const topicDelta = next - prev;
    setTopics((arr) => arr.map((t) => (t.id === id ? { ...t, voteCount: (t.voteCount || 0) + topicDelta } : t)));
    if (selectedData.topic && selectedData.topic.id === id) {
      setSelectedData((s) => s.topic ? { ...s, topic: { ...s.topic, voteCount: (s.topic.voteCount || 0) + topicDelta } } : s);
    }
    try {
      await apiFetch(`${API_URL}/community/topics/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, value }),
      });
    } catch { /* ignore */ }
  };

  const reportTopic = async (id: string) => {
    try {
      await apiFetch(`${API_URL}/community/topics/${id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason: 'inappropriate' }),
      });
    } catch { /* ignore */ }
  };

  // Author-only edit/delete. The server enforces both ownership and the
  // 15-minute edit window; these UI checks just avoid showing dead controls.
  const isOwnerOf = (topic: Topic) => topic.authorId === userId;
  const canStillEdit = (topic: Topic) =>
    isOwnerOf(topic) &&
    !!topic.createdAt &&
    Date.now() - new Date(topic.createdAt).getTime() < 15 * 60 * 1000;

  const startEditTopic = (topic: Topic) => {
    setEditTopicId(topic.id);
    setEditTitle(topic.title);
    setEditContent(topic.content);
    setEditTags((topic.tags || []).join(', '));
    setEditError('');
  };

  const submitEditTopic = async () => {
    if (!editTopicId) return;
    setEditSubmitting(true);
    setEditError('');
    try {
      const res = await apiFetch(`${API_URL}/community/topics/${editTopicId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: editTitle.trim(),
          content: editContent.trim(),
          tags: editTags.split(/[,#]/).map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (res.status === 403) setEditError(t('community.editWindowExpired'));
      else if (!res.ok) setEditError(t('community.postRateLimit'));
      else {
        const data = await res.json();
        const updated = data?.topic;
        setTopics((arr) => arr.map((x) => (x.id === editTopicId ? { ...x, ...updated, id: editTopicId } : x)));
        if (selectedData.topic?.id === editTopicId) {
          setSelectedData((s) => (s.topic ? { ...s, topic: { ...s.topic, ...updated, id: editTopicId } } : s));
        }
        setEditTopicId(null);
      }
    } catch {
      setEditError(t('community.postRateLimit'));
    } finally {
      setEditSubmitting(false);
    }
  };

  const deleteTopic = async (id: string) => {
    if (!window.confirm(t('community.deleteConfirm'))) return;
    try {
      const res = await apiFetch(`${API_URL}/community/topics/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok || res.status === 404) {
        setTopics((arr) => arr.filter((x) => x.id !== id));
        if (selectedTopic === id) setSelectedTopic(null);
      }
    } catch { /* ignore */ }
  };

  const resetCreate = () => {
    setFormTitle('');
    setFormCategory('general_farming');
    setFormContent('');
    setFormTags('');
    setFormPhoto('');
    setFormError('');
    setShowCreate(false);
  };

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={t('community.eyebrow')}
        title={t('community.title')}
        subtitle={t('community.subtitle')}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{t('community.statPosts')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-stone-900 tabular">{loading ? '—' : counts.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">{t('community.statReplies')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-emerald-800 tabular">{loading ? '—' : counts.comments}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">{t('community.statViews')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-sky-800 tabular">{loading ? '—' : counts.views.toLocaleString('en-IN')}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">{t('community.statOnline')}</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-amber-800 tabular">{counts.online}</p>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('community.searchPlaceholder')}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-stone-200 bg-white text-[13px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-h-[44px]"
              />
            </div>
            <div className="flex items-center rounded-xl border border-stone-200 overflow-hidden bg-white">
              {SORT_LIST.map((s) => {
                const active = sort === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    className={`inline-flex items-center gap-1 px-3 py-2 text-[12px] font-semibold min-h-[40px] transition-colors ${
                      active ? 'bg-emerald-600 text-white' : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <s.Icon size={14} />
                    {t(s.labelKey)}
                  </button>
                );
              })}
            </div>
            <PrimaryButton onClick={() => setShowCreate(true)} icon={Plus} className="!px-3 !py-2 !min-h-[40px] text-[12px]">
              {t('community.createPost')}
            </PrimaryButton>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {CATEGORY_LIST.map((c) => {
              const active = category === c.key;
              const Icon = c.Icon;
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold min-h-[40px] border transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm shadow-emerald-600/20'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <Icon size={14} />
                  {t(c.labelKey)}
                </button>
              );
            })}
          </div>

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="p-5"><SkeletonLines rows={5} /></Card>
              ))}
            </div>
          )}

          {!loading && error && (
            <Card className="p-6">
              <EmptyState
                icon={MessageSquare}
                title={t('community.noPosts')}
                description={t('community.errorDesc')}
                action={<PrimaryButton onClick={() => { setCategory('all'); setQuery(''); }}>{t('community.showAll')}</PrimaryButton>}
              />
            </Card>
          )}

          {!loading && !error && topics.length === 0 && (
            <Card className="p-6">
              <EmptyState
                icon={MessageSquare}
                title={t('community.noPosts')}
                description={t('community.emptyDesc')}
                action={<PrimaryButton onClick={() => setShowCreate(true)} icon={Plus}>{t('community.createPost')}</PrimaryButton>}
              />
            </Card>
          )}

          {!loading && topics.length > 0 && (
            <StaggerList className="space-y-3">
              {topics.map((topic) => {
                const meta = catMeta(topic.category);
                const MetaIcon = meta.Icon;
                const vote = topicVoteState[topic.id] || 0;
                const isNotice = topic.category === 'government_notices';
                return (
                  <StaggerItem key={topic.id}>
                    <Card className={`p-5 hover:shadow-md transition-shadow ${isNotice ? 'border-amber-200 bg-amber-50/30' : ''}`}>
                      <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center gap-1 w-12 shrink-0 py-1">
                          <button
                            onClick={() => topicVote(topic.id, 1)}
                            className={`h-9 w-9 rounded-lg border flex items-center justify-center ${
                              vote === 1 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                            }`}
                            aria-label="Upvote"
                          >
                            <ThumbsUp size={15} />
                          </button>
                          <span className={`text-[13px] font-bold tabular ${vote === 1 ? 'text-emerald-700' : vote === -1 ? 'text-red-600' : 'text-stone-700'}`}>
                            {topic.voteCount}
                          </span>
                          {!isNotice && (
                            <button
                              onClick={() => topicVote(topic.id, -1)}
                              className={`h-9 w-9 rounded-lg border flex items-center justify-center ${
                                vote === -1 ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                              }`}
                              aria-label="Downvote"
                            >
                              <ChevronDown size={16} />
                            </button>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            {topic.pinned && <Chip color="emerald"><Pin size={11} /> {t('community.pinned')}</Chip>}
                            <Chip color={meta.tone}>
                              <MetaIcon size={11} /> {t(meta.labelKey)}
                            </Chip>
                            {isNotice && <Chip color="amber"><BadgeCheck size={11} /> {t('community.officialBadge')}</Chip>}
                            {topic.tags?.slice(0, 3).map((tag) => (
                              <span key={tag} className="inline-flex items-center rounded-full bg-stone-100 border border-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                                #{tag}
                              </span>
                            ))}
                            <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-stone-400">
                              <span className="inline-flex items-center gap-1"><Eye size={12} />{(topic.viewCount || 0).toLocaleString('en-IN')}</span>
                              <span className="inline-flex items-center gap-1"><MessageSquare size={12} />{topic.commentCount || 0}</span>
                              <span>{timeAgo(topic.createdAt)}</span>
                            </span>
                          </div>

                          <button
                            className="text-left block w-full group"
                            onClick={() => setSelectedTopic(topic.id)}
                          >
                            <h3 className="font-display text-[15px] md:text-base font-bold text-stone-900 group-hover:text-emerald-800 leading-snug line-clamp-2">
                              {topic.title}
                            </h3>
                            <p className="text-[12.5px] text-stone-600 mt-1.5 line-clamp-2 leading-relaxed">
                              {topic.content}
                            </p>
                          </button>

                          {topic.photoDataUrl && (
                            <div className="mt-2.5 rounded-lg overflow-hidden border border-stone-200 max-w-[320px]">
                              <img src={topic.photoDataUrl} alt="Post attachment" className="w-full h-auto max-h-[240px] object-cover" />
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[11px] font-bold">
                                {topic.authorName.charAt(0)}
                              </div>
                              <div className="text-[11.5px]">
                                <span className="font-semibold text-stone-800">{topic.authorName}</span>
                                {isNotice && <BadgeCheck size={13} className="inline ml-1 text-emerald-600" />}
                                {topic.authorDistrict && <span className="text-stone-500"> · {topic.authorDistrict}</span>}
                                <TrustBadge
                                  label={
                                    topic.authorTrustLabel === 'trusted' ? t('community.trustTrusted') :
                                    topic.authorTrustLabel === 'member' ? t('community.trustMember') :
                                    t('community.trustNew')
                                  }
                                />
                              </div>
                            </div>
                            <div className="ml-auto flex items-center gap-1">
                              <GhostButton
                                className="!px-3 !py-1.5 !min-h-[34px] text-[11.5px]"
                                onClick={() => setSelectedTopic(topic.id)}
                              >
                                <MessageSquare size={13} />
                                {t('community.commentsCount').replace('{count}', String(topic.commentCount || 0))}
                              </GhostButton>
                              {canStillEdit(topic) && (
                                <button
                                  onClick={() => startEditTopic(topic)}
                                  title={t('community.edit')}
                                  className="h-9 w-9 rounded-lg border border-stone-200 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-stone-400 flex items-center justify-center"
                                >
                                  <Pencil size={13} />
                                </button>
                              )}
                              {isOwnerOf(topic) && (
                                <button
                                  onClick={() => deleteTopic(topic.id)}
                                  title={t('community.delete')}
                                  className="h-9 w-9 rounded-lg border border-stone-200 bg-white hover:bg-red-50 text-stone-400 hover:text-red-600 hover:border-red-200 flex items-center justify-center"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                              <button
                                onClick={() => reportTopic(topic.id)}
                                title={t('community.report')}
                                className="h-9 w-9 rounded-lg border border-stone-200 bg-white hover:bg-red-50 text-stone-400 hover:text-red-600 hover:border-red-200 flex items-center justify-center"
                              >
                                <Flag size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </StaggerItem>
                );
              })}
            </StaggerList>
          )}
        </div>

        <aside className="lg:w-72 shrink-0 space-y-4">
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500 mb-3">{t('community.trending')}</p>
            <div className="flex flex-wrap gap-1.5">
              {trendingTags.length === 0 && <span className="text-[12px] text-stone-400">{t('community.loadingTags')}</span>}
              {trendingTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setQuery(tag)}
                  className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800 px-2.5 min-h-[36px] hover:bg-emerald-100"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500 mb-3">{t('community.guidelines')}</p>
            <ul className="space-y-2 text-[12px] text-stone-700">
              <li className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><DataTag label="BE KIND" tone="emerald" /></span> Treat other farmers with respect — personal insults are removed.</li>
              <li className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><DataTag label="NO SPAM" tone="amber" /></span> No MLM, pyramid schemes, or repeated commercial links.</li>
              <li className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><DataTag label="SHOW FIRST" tone="sky" /></span> Attach photos of leaves, soil, or pests — one picture beats 100 words.</li>
              <li className="flex items-start gap-2"><span className="mt-0.5 shrink-0"><DataTag label="3 REPORTS = HIDE" tone="red" /></span> Any post with ≥ 3 independent reports is auto-hidden.</li>
            </ul>
          </Card>
        </aside>
      </div>

      {/* FAB for small screens */}
      <div className="lg:hidden fixed bottom-20 right-4 z-40">
        <button
          onClick={() => setShowCreate(true)}
          className="h-14 w-14 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-600/30 flex items-center justify-center"
          aria-label={t('community.createPost')}
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Edit post modal — pre-filled from the topic, PUT within the window */}
      {editTopicId && (
        <div className="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-stone-900">{t('community.editTitle')}</h2>
              <button
                onClick={() => setEditTopicId(null)}
                className="h-9 w-9 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-500 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-stone-700 block mb-1.5">{t('community.postTitle')}</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[13px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-h-[44px]"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-stone-700 block mb-1.5">{t('community.postContent')}</label>
                <textarea
                  rows={6}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[13px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-stone-700 block mb-1.5">{t('community.postTags')}</label>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[13px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-h-[42px]"
                />
              </div>
              {editError && <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">{editError}</p>}
              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-stone-100 -mx-5 -mb-5 px-5 py-4 bg-stone-50/60">
                <GhostButton onClick={() => setEditTopicId(null)}>{t('community.postCancel')}</GhostButton>
                <PrimaryButton
                  onClick={submitEditTopic}
                  icon={Send}
                  disabled={editSubmitting || editTitle.trim().length < 5 || editContent.trim().length < 10}
                >
                  {editSubmitting ? t('community.saving') : t('community.saveChanges')}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create post modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-stone-900">{t('community.createPost')}</h2>
              <button
                onClick={resetCreate}
                className="h-9 w-9 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-500 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-stone-700 block mb-1.5">{t('community.postTitle')}</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[13px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-h-[44px]"
                  placeholder="e.g. Onion Lasalgaon aaj kya bhav? Nashik Sinnar"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-stone-700 block mb-1.5">{t('community.postCategory')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_LIST.filter((c) => c.key !== 'all').map((c) => {
                    const active = formCategory === c.key;
                    const Icon = c.Icon;
                    return (
                      <button
                        key={c.key}
                        onClick={() => setFormCategory(c.key as Topic['category'])}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold min-h-[38px] border transition-colors ${
                          active ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        <Icon size={13} /> {t(c.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[12px] font-semibold text-stone-700 block mb-1.5">{t('community.postContent')}</label>
                <textarea
                  rows={6}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[13px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none"
                  placeholder="Describe your question or experience in detail. If you are asking about a pest / disease / leaf problem, upload a photo too."
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-stone-700 block mb-1.5">{t('community.postTags')}</label>
                <input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[13px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 min-h-[42px]"
                  placeholder="onion, lasalgaon, nashik, price"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-stone-700 block mb-1.5">{t('community.postPhoto')}</label>
                <p className="text-[11px] text-stone-500 mb-2">{t('community.postPhotoHint')}</p>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-stone-300 bg-white hover:bg-stone-50 text-stone-600 text-[12px] font-semibold cursor-pointer">
                  <Camera size={14} /> Add photo (max 2 MB)
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => e.target.files && e.target.files[0] && onFile(e.target.files[0])}
                  />
                </label>
                {formPhoto && (
                  <div className="mt-2 relative inline-block max-w-[260px] rounded-lg overflow-hidden border border-stone-200">
                    <img src={formPhoto} alt="preview" className="w-full h-auto" />
                    <button
                      onClick={() => setFormPhoto('')}
                      className="absolute top-1 right-1 h-7 w-7 rounded-full bg-white/90 border border-stone-200 text-stone-600 text-[12px] flex items-center justify-center"
                      aria-label={t('community.photoRemove')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              {formError && <p className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">{formError}</p>}
              {formApprovalMsg && <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2.5">{formApprovalMsg}</p>}
              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-stone-100 -mx-5 -mb-5 px-5 py-4 bg-stone-50/60">
                <GhostButton onClick={resetCreate}>{t('community.postCancel')}</GhostButton>
                <PrimaryButton onClick={submitCreate} icon={Send} disabled={formSubmitting}>
                  {formSubmitting ? t('community.publishing') : t('community.postSubmit')}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topic detail modal */}
      {selectedTopic && (
        <div className="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
          <div className={`w-full max-w-4xl md:rounded-3xl rounded-t-3xl bg-white shadow-2xl max-h-[94vh] flex flex-col ${selectedData.topic?.category === 'government_notices' ? 'ring-1 ring-amber-200' : ''}`}>
            <div className="sticky top-0 bg-white border-b border-stone-100 px-4 md:px-6 py-4 flex items-start justify-between gap-3 z-10">
              <div className="min-w-0 flex-1">
                {detailLoading ? (
                  <SkeletonLines rows={2} className="!space-y-2" />
                ) : selectedData.topic ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      {selectedData.topic.pinned && <Chip color="emerald"><Pin size={11} /> {t('community.pinned')}</Chip>}
                      {(() => {
                        const m = catMeta(selectedData.topic.category);
                        const Icon = m.Icon;
                        return (
                          <Chip color={m.tone}>
                            <Icon size={11} /> {t(m.labelKey)}
                          </Chip>
                        );
                      })()}
                      {selectedData.topic.category === 'government_notices' && <Chip color="amber"><BadgeCheck size={11} /> {t('community.officialBadge')}</Chip>}
                      <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-stone-400">
                        <Eye size={12} /> {(selectedData.topic.viewCount || 0).toLocaleString('en-IN')}
                        <MessageSquare size={12} /> {selectedData.topic.commentCount || 0}
                        {timeAgo(selectedData.topic.createdAt)}
                      </span>
                    </div>
                    <h2 className="font-display text-lg md:text-xl font-bold text-stone-900 leading-snug">{selectedData.topic.title}</h2>
                  </>
                ) : <p className="text-stone-500">{t('community.topicUnavailable')}</p>}
              </div>
              <button
                onClick={() => setSelectedTopic(null)}
                className="shrink-0 h-9 w-9 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-500 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-5">
              {detailLoading && <Card className="p-5"><SkeletonLines rows={6} /></Card>}
              {!detailLoading && selectedData.topic && (
                <>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[13px] font-bold">
                        {selectedData.topic.authorName.charAt(0)}
                      </div>
                      <div className="text-[12.5px]">
                        <span className="font-semibold text-stone-800">{selectedData.topic.authorName}</span>
                        {selectedData.topic.category === 'government_notices' && <BadgeCheck size={14} className="inline ml-1 text-emerald-600" />}
                        {selectedData.topic.authorDistrict && <span className="text-stone-500"> · {selectedData.topic.authorDistrict}</span>}
                        <TrustBadge
                          label={
                            selectedData.topic.authorTrustLabel === 'trusted' ? t('community.trustTrusted') :
                            selectedData.topic.authorTrustLabel === 'member' ? t('community.trustMember') :
                            t('community.trustNew')
                          }
                        />
                      </div>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-stone-800 whitespace-pre-wrap">{selectedData.topic.content}</p>
                    {selectedData.topic.photoDataUrl && (
                      <div className="mt-3 rounded-xl overflow-hidden border border-stone-200 max-w-[480px]">
                        <img src={selectedData.topic.photoDataUrl} alt="Topic" className="w-full h-auto" />
                      </div>
                    )}
                    {selectedData.topic.tags?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {selectedData.topic.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center rounded-full bg-stone-100 border border-stone-200 text-[11px] font-semibold text-stone-600 px-2 py-0.5">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <hr className="border-stone-100" />

                  <div>
                    <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-stone-500 mb-3">
                      {t('community.commentsCount').replace('{count}', String(selectedData.topic.commentCount || 0))}
                    </h3>
                    <ThreadedComments
                      topicId={selectedTopic}
                      comments={selectedData.comments}
                      currentUserId={userId}
                      onVoted={() => setDetailVersion((v) => v + 1)}
                      category={selectedData.topic.category}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityPage;
