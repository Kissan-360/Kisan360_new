/* ============================================================================
   KISAN360 UI KIT — shared primitives for the unified design system.
   Ported from the Frontend-kisan-360 reference (`ui.jsx`) so every screen
   shares one visual language. Components are data-agnostic: they render
   whatever real API values the screens pass in. No mock business data.
   ============================================================================ */

import React, { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { MOTION } from '../../tokens';

/* Accepts lucide icons, inline SVGs, or any component taking size/className. */
type IconType = React.ElementType;

/* ------------------------------------------------------- Card ---------- */
/* Base surface. `spotlight` adds mouse-tracked glow; `lift` adds hover lift. */
export function Card({
  children,
  className = '',
  onClick,
  spotlight = false,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  spotlight?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });

  const onMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={spotlight ? onMouseMove : undefined}
      whileHover={onClick ? { y: -3 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      transition={MOTION.fast}
      onClick={onClick}
      style={spotlight ? ({ '--mx': `${pos.x}px`, '--my': `${pos.y}px` } as React.CSSProperties) : undefined}
      className={`card ${onClick ? 'card-hover' : ''} ${spotlight ? 'spotlight' : ''} ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------- SectionLabel - */
/* The signature [10-11px uppercase tracking] eyebrow label. */
export function SectionLabel({ children, tone = 'emerald', className = '' }: { children: React.ReactNode; tone?: 'emerald' | 'stone' | 'amber'; className?: string }) {
  const tones = { emerald: 'text-emerald-700', stone: 'text-stone-400', amber: 'text-amber-700' };
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${tones[tone]} ${className}`}>
      {children}
    </p>
  );
}

/* ------------------------------------------------------- PageHeader ---- */
/* Consistent screen header: eyebrow + display title + subtitle + actions. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className = '',
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.base}
      className={`flex flex-wrap items-end justify-between gap-4 mb-6 ${className}`}
    >
      <div className="min-w-0">
        {eyebrow && <SectionLabel className="mb-1">{eyebrow}</SectionLabel>}
        <h1 className="font-display text-2xl md:text-[28px] font-bold text-stone-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-stone-500 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </motion.div>
  );
}

/* ------------------------------------------------------- AnimatedCounter */
/* Number that counts up when scrolled into view. */
export function AnimatedCounter({ value, duration = 0.75, prefix = '', suffix = '', className = '' }: { value: number; duration?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [display, setDisplay] = useState(0);
  const [done, setDone] = useState(false);

  React.useEffect(() => {
    if (!isInView) return;
    const end = Math.max(0, value);
    if (end <= 0) { setDone(true); return; }
    let start = 0;
    const incrementTime = Math.max(8, (duration * 1000) / end);
    const counter = setInterval(() => {
      start += 1;
      setDisplay(start);
      if (start >= end) { clearInterval(counter); setDone(true); }
    }, incrementTime);
    return () => clearInterval(counter);
  }, [value, duration, isInView]);

  const shown = done ? value : display;
  return (
    <span ref={ref} className={`tabular ${className}`}>
      {prefix}{shown.toLocaleString('en-IN')}{suffix}
    </span>
  );
}

/* ------------------------------------------------------- StatCard ------ */
/* Stat with label, count-up value, optional icon and trend. */
export function StatCard({
  label,
  value,
  prefix = '',
  suffix = '',
  trend,
  icon: Icon,
  delay = 0,
  className = '',
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  trend?: { up: boolean; value: string; label: string };
  icon?: IconType;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...MOTION.slow, delay }}
      className={`relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:shadow-lg transition-all duration-300 group ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 to-teal-50/0 group-hover:from-emerald-50/50 group-hover:to-teal-50/30 transition-all duration-500 pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide break-words">{label}</p>
            <p className="text-2xl md:text-3xl font-extrabold text-neutral-900 tabular mt-2">
              {prefix}
              <AnimatedCounter value={value} suffix={suffix} />
            </p>
          </div>
          {Icon && (
            <div className="hidden min-[400px]:flex h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
              <Icon size={20} />
            </div>
          )}
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className={`text-xs font-bold ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.up ? '↑' : '↓'} {trend.value}
            </span>
            <span className="text-[11px] text-neutral-400 truncate">{trend.label}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------- Chip ---------- */
/* Small colored pill. */
export function Chip({ children, color = 'emerald', className = '' }: { children: React.ReactNode; color?: 'emerald' | 'amber' | 'red' | 'sky' | 'stone' | 'teal' | 'violet' | 'rose'; className?: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    sky: 'bg-sky-100 text-sky-800 border-sky-200',
    stone: 'bg-stone-100 text-stone-700 border-stone-200',
    teal: 'bg-teal-100 text-teal-800 border-teal-200',
    violet: 'bg-violet-100 text-violet-800 border-violet-200',
    rose: 'bg-rose-100 text-rose-800 border-rose-200',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${colors[color] || colors.emerald} ${className}`}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------- FreshBadge ---- */
/* Live vs cached data indicator — the product's honesty vocabulary. */
export function FreshBadge({ live = true, label }: { live?: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
      {live ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
          <span className="text-red-600">{label || 'Live'}</span>
        </>
      ) : (
        <span className="text-stone-500">{label || 'Cached'}</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------- TrustBadge ---- */
/* Trust/verification tier badge. Never flattens tiers into "Verified". */
export function TrustBadge({ label, icon: Icon }: { label: string; icon?: IconType }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
      {Icon && <Icon size={10} />}
      {label}
    </span>
  );
}

/* ------------------------------------------------------- DataTag ------- */
/* Provenance / classification tag (REFERENCE, DERIVED, FACT, DEMO, ...). */
export function DataTag({ label, tone = 'stone' }: { label: string; tone?: 'stone' | 'emerald' | 'amber' | 'red' | 'sky' }) {
  const tones: Record<string, string> = {
    stone: 'border-stone-200 bg-stone-50 text-stone-500',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-600',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${tones[tone]}`}>
      {label}
    </span>
  );
}

/* ------------------------------------------------------- EmptyState ---- */
export function EmptyState({ icon: Icon, title, description, action }: { icon?: IconType; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="h-14 w-14 rounded-full bg-stone-50 border border-stone-100 flex items-center justify-center mb-4">
          <Icon size={22} className="text-stone-300" />
        </div>
      )}
      <h3 className="font-display text-lg font-bold text-neutral-900">{title}</h3>
      {description && <p className="text-sm text-neutral-500 max-w-md mt-1.5 leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------- Skeleton ------ */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonLines({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === rows - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
      <div className="sr-only">Loading…</div>
    </div>
  );
}

/* ------------------------------------------------------- Reveal -------- */
export function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: delay / 1000, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------- Stagger ------- */
export function StaggerList({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.97 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------- Buttons ------- */
export function PrimaryButton({ children, onClick, icon: Icon, className = '', type = 'button', disabled = false }: { children: React.ReactNode; onClick?: () => void; icon?: IconType; className?: string; type?: 'button' | 'submit'; disabled?: boolean }) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      className={`btn-shine inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold px-5 py-2.5 shadow-lg shadow-emerald-600/25 hover:shadow-xl hover:shadow-emerald-600/35 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] ${className}`}
    >
      {Icon && <Icon size={18} />}
      {children}
    </motion.button>
  );
}

export function GhostButton({ children, onClick, className = '', type = 'button', disabled = false }: { children: React.ReactNode; onClick?: () => void; className?: string; type?: 'button' | 'submit'; disabled?: boolean }) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white text-stone-700 font-semibold px-5 py-2.5 hover:bg-stone-50 transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </motion.button>
  );
}

/* ------------------------------------------------------- GradientText -- */
export function GradientText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`bg-gradient-to-r from-emerald-500 to-teal-400 bg-clip-text text-transparent ${className}`}>{children}</span>;
}

/* ------------------------------------------------------- Spinner ------- */
export function Spinner({ size = 24, light = false }: { size?: number; light?: boolean }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 ${light ? 'border-white/30 border-t-white' : 'border-stone-200 border-t-emerald-600'}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

/* ------------------------------------------------------- CropIcon ------ */
/* Stylized inline-SVG crop illustrations. Zero image files, zero licensing
   risk, offline-safe. Accepts any crop name; unrecognized crops fall back
   to a generic leaf. Renders in `currentColor` so it inherits the parent
   text color, and `aria-hidden` — crops are always labeled by real text. */
const CROP_PATHS: Record<string, React.ReactNode> = {
  Onion: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10.5c-3.2 0-4.6 1.7-4.6 3.9 0 2.1 1.9 3.8 4.6 3.8s4.6-1.7 4.6-3.8c0-2.2-1.4-3.9-4.6-3.9z" />
      <path d="M10.6 8.6c-.6-.9-.5-1.9.3-2.7M13.4 8.6c.6-.9.5-1.9-.3-2.7" />
      <path d="M12 10.5c0-1.4.4-2.9 1-4.2.3-.7.7-1.3 1.2-1.8M12 10.5c0-1.4-.4-2.9-1-4.2-.3-.7-.7-1.3-1.2-1.8" />
      <path d="M8.8 11.4c-.8-.4-1.6-.3-2.2.3M15.2 11.4c.8-.4 1.6-.3 2.2.3" />
    </g>
  ),
  Soybean: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V9" />
      <path d="M12 9c-2.8-1.6-5.3-1.7-7.5-.4M12 9c2.8-1.6 5.3-1.7 7.5-.4" />
      <path d="M9.5 14.5c-1.9 1.2-3 3-3.2 5.1M14.5 14.5c1.9 1.2 3 3 3.2 5.1" />
      <path d="M6.2 19.6c.8.6 1.8.7 2.6.2l2-1.6M17.8 19.6c-.8.6-1.8.7-2.6.2l-2-1.6" />
    </g>
  ),
  Tomato: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="14" r="5.4" />
      <path d="M12 8.6c0-1.6.5-2.9 1.6-3.9M12 8.6c0-1.6-.5-2.9-1.6-3.9" />
      <path d="M10.2 5.2c-.4.6-.6 1.3-.6 2.1M13.8 5.2c.4.6.6 1.3.6 2.1" />
    </g>
  ),
  Chilli: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19c-2.9-2.4-4.3-5.4-4.2-8.4.1-2.4 1.6-4.1 4.2-5.1 2.6 1 4.1 2.7 4.2 5.1.1 3-1.3 6-4.2 8.4z" />
      <path d="M12 5.5c-.3-1.5.2-2.8 1.4-3.9M12 5.5c.3-1.5-.2-2.8-1.4-3.9" />
    </g>
  ),
  Wheat: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V6" />
      <path d="M12 7.5c-2-1.1-3.7-1-5.2.4M12 7.5c2-1.1 3.7-1 5.2.4" />
      <path d="M12 12c-2.2-1.1-4-.9-5.5.7M12 12c2.2-1.1 4-.9 5.5.7" />
      <path d="M12 16.5c-2.3-1.1-4.2-.8-5.7.9M12 16.5c2.3-1.1 4.2-.8 5.7.9" />
    </g>
  ),
  Pomegranate: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="14.5" r="5" />
      <path d="M12 9.5c-.9-1.1-.8-2.3.2-3.4M12 9.5c.9-1.1.8-2.3-.2-3.4" />
      <path d="M10.6 6.7c.8.9 2.2.9 3 0M9.5 14.5c1.4 1.4 3.6 1.4 5 0" />
    </g>
  ),
  Jowar: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V5" />
      <path d="M9.8 12.5c-2-1.6-4-2.2-5.8-2M14.2 12.5c2-1.6 4-2.2 5.8-2" />
      <path d="M9.8 12.5c-.4 2.2.3 4 2 5.4M14.2 12.5c.4 2.2-.3 4-2 5.4" />
    </g>
  ),
  Maize: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 20.5c0-4.5 0-8.5.3-12.8.1-1.2 1-2 2.2-2s2.1.8 2.2 2c.3 4.3.3 8.3.3 12.8" />
      <path d="M9.5 20.5c-1.3-.9-2.6-1.3-4-.9M14.5 20.5c1.3-.9 2.6-1.3 4-.9" />
      <path d="M12 6.5c0 1.2 0 2.4.2 3.6M12 6.5c0 1.2 0 2.4-.2 3.6" />
    </g>
  ),
  'Tur Dal': (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19.5c-2.5-1.8-3.8-4.3-3.8-7.3 0-2.4 1.5-4.2 3.8-5.2 2.3 1 3.8 2.8 3.8 5.2 0 3-1.3 5.5-3.8 7.3z" />
      <path d="M10.2 9.5c.9 1.6 1.6 3.2 2.1 5M12 8c.4 2 .5 4 .3 6" />
    </g>
  ),
  Bajra: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V6" />
      <path d="M12 6c-2.3 2.8-4.2 5.6-5.5 9M12 6c2.3 2.8 4.2 5.6 5.5 9" />
      <path d="M12 10c-1.6 1.6-2.9 3.3-3.8 5.2M12 10c1.6 1.6 2.9 3.3 3.8 5.2" />
    </g>
  ),
  Grapes: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5.5c0 1.2 0 2.4-.4 3.5M12 5.5c0 1.2 0 2.4.4 3.5" />
      <circle cx="8.5" cy="11" r="1.5" /><circle cx="11" cy="13.5" r="1.5" /><circle cx="13.5" cy="11" r="1.5" /><circle cx="8.8" cy="16" r="1.5" /><circle cx="12" cy="17.8" r="1.5" /><circle cx="15" cy="16" r="1.5" /><circle cx="11.2" cy="10.2" r="1.5" />
    </g>
  ),
  Cotton: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="13.5" r="2.4" /><circle cx="12.5" cy="10.5" r="2.6" /><circle cx="15.5" cy="13.8" r="2.2" />
      <path d="M8.5 13.5c0 2.8 1.2 4.8 3.6 6M12.5 10.5c.6 3.6 1.6 6.4 3.6 8M15.5 13.8c-.8 3 .2 5 2.4 6.2" />
    </g>
  ),
  Groundnut: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 19c-1.8-1.6-2.6-3.6-2.2-5.8.4-2.2 1.8-3.6 3.8-3.9M16 19c1.8-1.6 2.6-3.6 2.2-5.8-.4-2.2-1.8-3.6-3.8-3.9" />
      <path d="M9.6 9.3c.9.9 1.4 2.1 1.5 3.5M14.4 9.3c-.9.9-1.4 2.1-1.5 3.5" />
      <path d="M12 9.2v1M10.6 11c1 .4 2 .4 2.8 0" />
    </g>
  ),
  Ginger: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16.5c-1.3-1.3-1.7-3-.9-4.7.7-1.6 2-2.6 3.8-2.9" />
      <path d="M9.9 8.9c.2-1.5 1-2.5 2.4-3.1 1.3-.5 2.5-.3 3.5.7" />
      <path d="M15.8 6.5c.9.4 1.4 1.2 1.6 2.3" />
      <path d="M7 16.5c.8 1.2 2 1.7 3.5 1.5" />
    </g>
  ),
  'Black Gram': (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V8" />
      <path d="M10 14c-1.4 1.4-2.4 3-3 4.9M14 14c1.4 1.4 2.4 3 3 4.9" />
      <path d="M9.6 10.5c.7 1 1.4 1.9 2.4 2.6.9-.7 1.7-1.6 2.4-2.6" />
    </g>
  ),
  'Green Gram': (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19.5V8.5" />
      <circle cx="8.8" cy="13" r="1.9" /><circle cx="15.2" cy="13" r="1.9" />
      <path d="M8.8 8.5c.9 1 2.2 1.4 3.2 1.1M15.2 8.5c-.9 1-2.2 1.4-3.2 1.1" />
    </g>
  ),
  'Bengal Gram': (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="3.6" />
      <path d="M12 9.4c.6-.6 1.3-.8 2.1-.6M12 9.4c.6.9 1.6 1.3 2.6 1.1" />
      <path d="M12 16.6c-1 0-1.8-.4-2.4-1.2" />
    </g>
  ),
  'Green Peas': (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5c-2.6 1.4-4 3.6-4 6.4 0 2.8 1.6 5.4 4 7.2 2.4-1.8 4-4.4 4-7.2 0-2.8-1.4-5-4-6.4z" />
      <circle cx="9.2" cy="11.5" r="1" /><circle cx="12" cy="13" r="1" /><circle cx="14.8" cy="11.5" r="1" />
    </g>
  ),
  Sugarcane: (
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20c-.4-4.5-.5-9-.3-13.2.1-1.2.9-2 2-2s1.9.8 2 2c.2 4.2.1 8.7-.3 13.2" />
      <path d="M12 20c-1.3-.8-2.6-1.2-4-.9M15.7 19.1c1.3-.8 2.6-1.2 4-.9" />
      <path d="M13.7 9.5c1.2-.6 2.3-1 3.3-1.3M13.7 9.5c-.2 1.3-.5 2.5-.9 3.7" />
    </g>
  ),
};

const LeafGlyph = (
  <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 5c-7 0-12 4-12 10 0 0 0 4 0 4 0 0 4 0 4 0 6 0 10-5 10-12l-2-2z" />
    <path d="M7 15c3-1 5-3 6-6" />
  </g>
);

/* Precomputed normalized-name → key lookup so CropIcon does no per-render
   iteration. Keeps the paren/alias handling in one place. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const CROP_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.keys(CROP_PATHS).map(k => [norm(k), k])
);

export function CropIcon({ cropName, size = 16, className = '' }: { cropName: string; size?: number; className?: string }) {
  // Normalize both sides so spelling variants ("Soyabean"), parenthetical
  // qualifiers ("Jowar (Sorghum)", "Tur Dal (Pigeon Pea)") and spaced vs
  // unspaced names all resolve to the right illustration, not the fallback.
  // Parens must be stripped BEFORE the alpha-collapse — otherwise "Jowar
  // (Sorghum)" would become "jowarsorghum" and miss the "jowar" key.
  const raw = String(cropName || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z]+/g, '')
    .replace('soyabean', 'soybean');
  const key = CROP_LOOKUP[raw];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {key ? CROP_PATHS[key] : LeafGlyph}
    </svg>
  );
}

/* ------------------------------------------------------- PageTransition */
export function PageTransition({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.base}
      className={className}
    >
      {children}
    </motion.div>
  );
}