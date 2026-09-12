import React, { useRef, useState } from 'react';
import { Camera, Upload, X, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from '../i18n';

interface PhotoCaptureProps {
  onPhoto: (base64: string | null) => void;
  photo: string | null;
}

export default function PhotoCapture({ onPhoto, photo }: PhotoCaptureProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Compress to reasonable size (max 800px wide)
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 800;
        const scale = img.width > maxW ? maxW / img.width : 1;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        onPhoto(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (photo) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-stone-200">
        <img src={photo} alt="Crop photo" className="w-full max-h-64 object-cover" />
        <button
          onClick={() => onPhoto(null)}
          className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 shadow hover:bg-white transition-colors"
          aria-label="Remove photo"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
        dragOver ? 'border-emerald-400 bg-emerald-50/40' : 'border-stone-300 hover:border-stone-400'
      }`}
      onClick={() => fileRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label={t('grade.takePhoto')}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <div className="flex flex-col items-center gap-2">
        <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <Camera size={22} />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-700">{t('grade.takePhoto')}</p>
          <p className="text-xs text-stone-400 mt-0.5">{t('grade.photoHint')}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Camera size={10} /> Camera
          </span>
          <span className="text-[10px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Upload size={10} /> Upload
          </span>
        </div>
      </div>
    </div>
  );
}
