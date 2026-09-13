import { Shield } from 'lucide-react';

/* Official Kisan360 mark — emblem image + wordmark with green 360°. */
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <img
        src="/kisan360-mark.png"
        alt=""
        className={`${small ? 'h-8 w-8' : 'h-9 w-9'} object-contain shrink-0`}
        aria-hidden="true"
      />
      <div className="leading-none min-w-0">
        <p className={`${small ? 'text-base' : 'text-[17px]'} font-extrabold tracking-tight text-stone-900 whitespace-nowrap`}>
          Kisan<span className="text-emerald-600">360</span>
          <span className="text-emerald-600">°</span>
        </p>
        {!small && (
          <p className="text-[9px] font-semibold text-stone-500 mt-0.5 tracking-[0.14em] uppercase">
            Market Realization
          </p>
        )}
      </div>
    </div>
  );
}

/* AGMARKNET feed status — the reference topbar's signature green pill.
   Wording attributes the SOURCE without claiming a live connection: the pill
   says where prices come from; live/cached state per request is labeled by
   <FreshBadge/> on the screens themselves, never claimed statically here. */
export function AgmarkPill() {
  return (
    <span
      title="Market prices are sourced from AGMARKNET pulls. Live vs cached state is labeled per request on each screen."
      className="hidden lg:inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" />
      <span className="text-xs font-semibold text-emerald-900">AGMARKNET · Maharashtra</span>
    </span>
  );
}

/* SIH prototype indicator — simulation must stay explicit everywhere. */
export function DemoBadge({ dark = false, topbar = false }: { dark?: boolean; topbar?: boolean }) {
  return (
    <span
      title="Payments, buyer verification and FPO data are simulated for the Smart India Hackathon demo. No real money moves."
      className={`items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
        topbar ? 'hidden xl:inline-flex' : 'inline-flex'
      } ${
        dark
          ? 'border-amber-200/20 bg-white/5 text-amber-400'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 pulse-dot" />
      SIH Prototype · simulated
    </span>
  );
}

/* MANDI DIRECT trust card — reference sidebar footer. */
export function MandiDirect() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5">
      <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
        <Shield size={12} /> MANDI DIRECT
      </p>
      <p className="text-[10px] text-stone-500 mt-1 leading-relaxed">
        Fewer intermediaries · APMC auction rates via AGMARKNET
      </p>
    </div>
  );
}