import React, { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronUp, CornerUpRight, ThumbsUp, ThumbsDown,
  Flag, Camera, Send, ShieldCheck, Shield, Sparkles, Pencil, Trash2,
} from 'lucide-react';
import { Chip, PrimaryButton, GhostButton, TrustBadge } from './ui/kit';
import { useTranslation } from '../i18n';
import { apiFetch, API_URL } from '../lib/api';

export interface CommentNode {
  id: string;
  topicId: string;
  parentId: string | null;
  rootId: string | null;
  depth: number;
  path: string[];
  content: string;
  photoDataUrl?: string;
  authorId: string;
  authorName: string;
  authorDistrict?: string;
  authorTrustLevel: number;
  authorTrustLabel: 'new' | 'member' | 'trusted';
  voteCount: number;
  reportCount?: number;
  hidden?: boolean;
  approved?: boolean;
  replyCount?: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
  replies?: CommentNode[];
}

interface ThreadProps {
  topicId: string;
  comments: CommentNode[];
  currentUserId: string;
  onVoted?: () => void;
  category?: string;
}

function timeAgo(ts: string | Date): string {
  if (!ts) return '';
  const ms = new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (Number.isNaN(diff)) return '';
  const sec = Math.max(1, Math.floor(diff / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

interface NodeProps {
  node: CommentNode;
  topicId: string;
  currentUserId: string;
  onVoted?: () => void;
  category?: string;
}

const CommentNodeComponent: React.FC<NodeProps> = ({ node, topicId, currentUserId, onVoted, category }) => {
  const { t, language } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyPhoto, setReplyPhoto] = useState<string>('');
  const [voteState, setVoteState] = useState<1 | -1 | 0>(0);
  const [localCount, setLocalCount] = useState<number>(node.voteCount || 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isOwner = node.authorId === currentUserId;
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(node.content);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const replies = node.replies || [];
  const hasReplies = replies.length > 0;
  const wasEdited = !!node.updatedAt &&
    new Date(node.updatedAt).getTime() - new Date(node.createdAt).getTime() > 1000;

  // Author-only edit. The server enforces the 15-minute window; a 403 with
  // edit_window_expired surfaces its dedicated message.
  const saveEdit = async () => {
    if (!editText.trim()) return;
    setEditSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(`${API_URL}/community/comments/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, content: editText.trim() }),
      });
      if (res.status === 403) setError(t('community.editWindowExpired'));
      else if (!res.ok) setError(t('community.postRateLimit'));
      else {
        setEditing(false);
        onVoted?.(); // refreshes the thread via the parent's version bump
      }
    } catch {
      setError(t('community.postRateLimit'));
    } finally {
      setEditSubmitting(false);
    }
  };

  // Author-only soft delete — the comment disappears on the parent refresh.
  const removeComment = async () => {
    if (!window.confirm(t('community.deleteConfirm'))) return;
    try {
      const res = await apiFetch(`${API_URL}/community/comments/${node.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId }),
      });
      if (res.ok || res.status === 404) onVoted?.();
    } catch { /* ignore */ }
  };

  const vote = async (value: 1 | -1) => {
    const next = voteState === value ? 0 : value;
    setVoteState(next as 1 | -1 | 0);
    setLocalCount((node.voteCount || 0) + (next - voteState));
    try {
      await apiFetch(`${API_URL}/community/comments/${node.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, value }),
      });
      onVoted?.();
    } catch { /* ignore */ }
  };

  const report = async () => {
    try {
      await apiFetch(`${API_URL}/community/comments/${node.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, reason: 'inappropriate' }),
      });
    } catch { /* ignore */ }
  };

  const submitReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(`${API_URL}/community/topics/${topicId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: node.id,
          userId: currentUserId,
          content: replyText.trim(),
          photoDataUrl: replyPhoto || undefined,
          authorName: 'You',
          language,
        }),
      });
      if (!res.ok) throw new Error('fail');
      setReplyText('');
      setReplyPhoto('');
      setShowReply(false);
      onVoted?.();
    } catch {
      setError(t('community.postRateLimit'));
    } finally {
      setSubmitting(false);
    }
  };

  const onFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError(t('community.photoSizeWarning'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReplyPhoto(String(reader.result));
    reader.onerror = () => setError(t('community.photoSizeWarning'));
    reader.readAsDataURL(file);
  };

  const depth = node.depth || 0;
  const atMaxDepth = depth >= 4;
  const replyColor = depth === 0 ? 'border-l-emerald-200' :
    depth === 1 ? 'border-l-sky-200' :
    depth === 2 ? 'border-l-amber-200' :
    depth === 3 ? 'border-l-violet-200' :
    'border-l-stone-200';
  const replyBg = depth === 0 ? '' : 'bg-white/60';

  const TrustIcon =
    node.authorTrustLabel === 'trusted' ? ShieldCheck :
    node.authorTrustLabel === 'member' ? Shield : Sparkles;

  return (
    <div className={`relative ${replyBg}`}>
      {depth > 0 && (
        <div className={`absolute left-3 top-0 bottom-0 w-px border-l-2 ${replyColor}`} aria-hidden />
      )}
      <div className={`relative ${depth > 0 ? 'pl-10' : 'pl-0'}`}>
        <div className={`rounded-xl border border-stone-100 bg-white p-3.5 ${depth > 0 ? 'ml-6' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-[13px] font-bold text-stone-900">{node.authorName}</p>
                {node.authorDistrict && (
                  <span className="text-[11px] text-stone-500">· {node.authorDistrict}</span>
                )}
                <span className="text-[11px] text-stone-400">· {timeAgo(node.createdAt)}</span>
                {wasEdited && (
                  <span className="text-[11px] text-stone-400 italic">({t('community.edited')})</span>
                )}
                <TrustBadge
                  label={
                    node.authorTrustLabel === 'trusted' ? t('community.trustTrusted') :
                    node.authorTrustLabel === 'member' ? t('community.trustMember') :
                    t('community.trustNew')
                  }
                  icon={TrustIcon}
                />
                {node.approved === false && (
                  <Chip color="amber">
                    <Sparkles size={10} />
                    {t('community.postApproval')}
                  </Chip>
                )}
              </div>
            </div>
            {hasReplies && (
              <button
                onClick={() => setCollapsed((v) => !v)}
                className="shrink-0 h-7 w-7 rounded-lg border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 flex items-center justify-center"
                aria-label={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            )}
          </div>

          {!collapsed && (
            <>
              {editing ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-stone-200 bg-white p-2.5 text-[13px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <GhostButton onClick={() => { setEditing(false); setError(''); }}>
                      {t('community.postCancel')}
                    </GhostButton>
                    <PrimaryButton onClick={saveEdit} disabled={editSubmitting || !editText.trim()}>
                      {editSubmitting ? t('community.saving') : t('community.saveChanges')}
                    </PrimaryButton>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] leading-relaxed text-stone-800 mt-2 whitespace-pre-wrap">{node.content}</p>
              )}
              {node.photoDataUrl && (
                <div className="mt-2 rounded-lg overflow-hidden border border-stone-200 max-w-sm">
                  <img src={node.photoDataUrl} alt="Attached" className="w-full h-auto" />
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => vote(1)}
                  className={`h-8 px-2 inline-flex items-center gap-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                    voteState === 1
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                  }`}
                >
                  <ThumbsUp size={13} />
                  <span className="tabular">{localCount}</span>
                </button>
                {category !== 'government_notices' && (
                  <button
                    onClick={() => vote(-1)}
                    className={`h-8 px-2 inline-flex items-center gap-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                      voteState === -1
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                    }`}
                  >
                    <ThumbsDown size={13} />
                  </button>
                )}
                {!atMaxDepth ? (
                  <button
                    onClick={() => setShowReply((v) => !v)}
                    className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 text-[11px] font-semibold"
                  >
                    <CornerUpRight size={13} />
                    {t('community.reply')}
                    {hasReplies && !!node.replyCount && <span className="tabular">({node.replyCount})</span>}
                  </button>
                ) : (
                  <span className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-dashed border-stone-300 bg-stone-50 text-[10px] text-stone-500 font-semibold">
                    <CornerUpRight size={13} />
                    {t('community.reply')} → thread above
                  </span>
                )}
                <button
                  onClick={report}
                  className="h-8 px-2 inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white text-stone-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-[11px] font-semibold"
                  title={t('community.report')}
                >
                  <Flag size={13} />
                </button>
                {isOwner && !editing && (
                  <button
                    onClick={() => { setEditText(node.content); setEditing(true); }}
                    className="h-8 px-2 inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-[11px] font-semibold"
                    title={t('community.edit')}
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {isOwner && (
                  <button
                    onClick={removeComment}
                    className="h-8 px-2 inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white text-stone-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-[11px] font-semibold"
                    title={t('community.delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {showReply && (
                <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t('community.replyPlaceholder')}
                    rows={2}
                    className="w-full rounded-lg border border-stone-200 bg-white p-2.5 text-[12px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none"
                  />
                  {replyPhoto && (
                    <div className="relative inline-block max-w-[200px] rounded-lg overflow-hidden border border-stone-200">
                      <img src={replyPhoto} alt="preview" className="w-full h-auto" />
                      <button
                        onClick={() => setReplyPhoto('')}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white/90 border border-stone-200 text-stone-600 text-[11px] flex items-center justify-center"
                        aria-label={t('community.photoRemove')}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {error && <p className="text-[11px] text-red-600">{error}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 text-[12px] font-semibold cursor-pointer">
                      <Camera size={14} />
                      {t('community.postPhoto').replace(' (optional)', '')}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => e.target.files && e.target.files[0] && onFile(e.target.files[0])}
                      />
                    </label>
                    <GhostButton onClick={() => { setShowReply(false); setReplyText(''); setError(''); }}>
                      {t('community.postCancel')}
                    </GhostButton>
                    <PrimaryButton onClick={submitReply} icon={Send} disabled={submitting || !replyText.trim()}>
                      {submitting ? '...' : t('community.replySubmit')}
                    </PrimaryButton>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!collapsed && hasReplies && (
          <div className="mt-3 space-y-3">
            {replies.map((child) => (
              <CommentNodeComponent
                key={child.id}
                node={child}
                topicId={topicId}
                currentUserId={currentUserId}
                onVoted={onVoted}
                category={category}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const ThreadedComments: React.FC<ThreadProps> = ({ topicId, comments, currentUserId, onVoted, category }) => {
  const { t } = useTranslation();
  const roots = useMemo(() => (Array.isArray(comments) ? comments : []), [comments]);

  if (!roots.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/60 p-6 text-center">
        <p className="text-[13px] text-stone-500">{t('community.noPosts').replace('posts', 'replies')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {roots.map((r) => (
        <CommentNodeComponent
          key={r.id}
          node={r}
          topicId={topicId}
          currentUserId={currentUserId}
          onVoted={onVoted}
          category={category}
        />
      ))}
    </div>
  );
};

export default ThreadedComments;
