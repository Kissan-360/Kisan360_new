// FarmerAvatar — the demo farmer's profile photo. An inline SVG (no binary
// asset, no network fetch) so it renders offline in demo halls and never
// 404s. Warm, simple illustration: pagri, smile, kurta. Used in the Topbar
// and on the Profile page instead of a bare initial letter.
import React from 'react';

const FarmerAvatar: React.FC<{ size?: number; square?: boolean; className?: string }> = ({
  size = 36,
  square = false,
  className = '',
}) => (
  <span
    role="img"
    aria-label="Farmer photo"
    className={`inline-flex items-center justify-center overflow-hidden shrink-0 select-none ${square ? 'rounded-2xl' : 'rounded-full'} ${className}`}
    style={{
      width: size,
      height: size,
      background: 'linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 55%, #34d399 100%)',
    }}
  >
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      {/* shoulders / kurta */}
      <path d="M12 64 Q14 50 32 50 Q50 50 52 64 Z" fill="#047857" />
      <path d="M28 50 L32 56 L36 50 Z" fill="#065f46" />
      {/* neck */}
      <rect x="28" y="42" width="8" height="8" rx="3" fill="#e8b07e" />
      {/* face */}
      <circle cx="32" cy="34" r="13" fill="#f2c89b" />
      {/* ears */}
      <circle cx="19.5" cy="35" r="2" fill="#e8b07e" />
      <circle cx="44.5" cy="35" r="2" fill="#e8b07e" />
      {/* pagri (turban) over the forehead */}
      <ellipse cx="32" cy="20" rx="19" ry="11" fill="#b45309" />
      <ellipse cx="32" cy="16.5" rx="19" ry="9.5" fill="#d97706" />
      <ellipse cx="32" cy="13.5" rx="14" ry="6" fill="#f59e0b" />
      <circle cx="46" cy="12" r="3.2" fill="#92400e" />
      {/* eyes */}
      <circle cx="27" cy="34" r="1.9" fill="#3f2d20" />
      <circle cx="37" cy="34" r="1.9" fill="#3f2d20" />
      {/* smile */}
      <path d="M27 40 Q32 44.5 37 40" stroke="#7c4a2d" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* cheeks */}
      <circle cx="24" cy="38" r="1.6" fill="#e8956b" opacity="0.7" />
      <circle cx="40" cy="38" r="1.6" fill="#e8956b" opacity="0.7" />
    </svg>
  </span>
);

export default FarmerAvatar;

// FarmerPhoto — the ORIGINAL demo-farmer photo (public/farmer-ramesh-256.png,
// downscaled from the 1024px original) layered over the SVG fallback. If the
// photo ever fails to load, the <img> removes itself and the illustration
// beneath shows — the avatar slot never renders broken.
export const FarmerPhoto: React.FC<{ size?: number; square?: boolean; className?: string }> = ({
  size = 36,
  square = false,
  className = '',
}) => (
  <span
    className={`relative inline-flex shrink-0 select-none ${square ? 'rounded-2xl' : 'rounded-full'} ${className}`}
    style={{ width: size, height: size }}
  >
    <FarmerAvatar size={size} square={square} />
    <img
      src="/farmer-ramesh-256.png"
      alt="Demo farmer"
      width={size}
      height={size}
      className={`absolute inset-0 h-full w-full object-cover ${square ? 'rounded-2xl' : 'rounded-full'}`}
      onError={(e) => {
        e.currentTarget.remove();
      }}
    />
  </span>
);
