import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from './api';

/* Crop categories (cereal, pulse, oilseed, ...) as a single shared source for
   every filter UI: the buy-side marketplace, the market price page, and the
   global search. The backend catalog is authoritative; this module fetches it
   once per session and caches it.

   FALLBACK mirrors backend/src/data/cropCatalog.js so the filter bar paints
   immediately and still works when the API is slow, cold, or unreachable. It
   only ever covers first paint — a successful fetch replaces it. */

export interface CropCategory {
  id: string;
  label: string;
  cropCount: number;
  crops: { id: string; name: string; marketCoverage?: string }[];
}

const c = (id: string, name: string, marketCoverage = 'active') => ({ id, name, marketCoverage });

const FALLBACK_BASE: { id: string; label: string; crops: ReturnType<typeof c>[] }[] = [
  { id: 'cereal', label: 'Cereals & Millets', crops: [c('jowar', 'Jowar (Sorghum)', 'limited'), c('bajra', 'Bajra (Pearl Millet)', 'limited'), c('wheat', 'Wheat'), c('maize', 'Maize', 'limited')] },
  { id: 'pulse', label: 'Pulses', crops: [c('tur-dal', 'Tur Dal (Pigeon Pea)', 'limited'), c('black-gram', 'Black Gram (Urad)'), c('green-gram', 'Green Gram (Moong)'), c('bengal-gram', 'Bengal Gram (Chana)')] },
  { id: 'oilseed', label: 'Oilseeds', crops: [c('soybean', 'Soybean'), c('groundnut', 'Groundnut', 'limited')] },
  { id: 'vegetable', label: 'Vegetables', crops: [c('onion', 'Onion'), c('tomato', 'Tomato'), c('green-peas', 'Green Peas', 'limited')] },
  { id: 'fruit', label: 'Fruits', crops: [c('grapes', 'Grapes', 'limited'), c('pomegranate', 'Pomegranate')] },
  { id: 'spice', label: 'Spices', crops: [c('chilli', 'Chilli'), c('ginger', 'Ginger')] },
  { id: 'fibre', label: 'Fibre', crops: [c('cotton', 'Cotton', 'limited')] },
  { id: 'cash', label: 'Cash Crops', crops: [c('sugarcane', 'Sugarcane', 'not_available')] },
];

export const CROP_CATEGORY_FALLBACK: CropCategory[] = FALLBACK_BASE.map((b) => ({
  ...b,
  cropCount: b.crops.length,
}));

let cache: CropCategory[] | null = null;
let started = false;

/** Strip punctuation and parentheticals so "Jowar (Sorghum)" matches "jowar". */
const norm = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');

export function useCropCategories(): { categories: CropCategory[]; ready: boolean } {
  const [categories, setCategories] = useState<CropCategory[]>(cache || CROP_CATEGORY_FALLBACK);
  const [ready, setReady] = useState(!!cache);

  useEffect(() => {
    if (cache || started) {
      if (cache) setCategories(cache);
      return;
    }
    started = true;
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/market/crop-categories`);
        if (res.ok) {
          const json = await res.json();
          const list = json?.categories;
          if (Array.isArray(list) && list.length > 0) {
            cache = list as CropCategory[];
            if (alive) setCategories(cache);
          }
        }
      } catch {
        /* keep the fallback — the filter bar still works offline */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { categories, ready };
}

/** Translator signature — kept structural so this module stays i18n-library-free. */
type Translate = (key: string, vars?: Record<string, string | number>) => string;

/* Category labels are NOT proper nouns ("Oilseeds", "Pulses"), so they are
   translated client-side by id and only fall back to the backend's English
   label when a locale has no entry. The backend catalog stays English because
   it is also the crop NAME source, and crop/mandi proper nouns remain Latin in
   every locale — same convention as the district selector. */
export function categoryLabel(cat: CropCategory, t: Translate): string {
  const key = `cropCategory.${cat.id}`;
  const translated = t(key);
  return translated === key ? cat.label : translated;
}

/** Category id owning a crop name, tolerating alias spellings and parentheticals. */
export function categoryForCrop(categories: CropCategory[], cropName: string): string | null {
  const target = norm(cropName);
  if (!target) return null;
  for (const cat of categories) {
    for (const crop of cat.crops) {
      if (norm(crop.name) === target || norm(crop.id) === target) return cat.id;
    }
  }
  return null;
}

/** Every crop name in a category — the value a category filter sends to the API. */
export function cropNamesInCategory(categories: CropCategory[], categoryId: string): string[] {
  return categories.find((c) => c.id === categoryId)?.crops.map((c) => c.name) || [];
}
