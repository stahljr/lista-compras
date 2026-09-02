import { useState } from 'react';

const FALLBACK: Record<string, string> = {
  hortifruti: '🥬',
  padaria: '🥖',
  acougue: '🥩',
  frios: '🧀',
  matinais: '☕',
  mercearia: '🍚',
  doces: '🍫',
  congelados: '🧊',
  bebidas: '🧴',
  limpeza: '🧽',
  higiene: '🧼',
  bebe: '🍼',
  pet: '🐾',
  casa: '🏠',
  outros: '📦',
};

/** Foto do produto; quando o mercado nao tem foto, cai no emoji da categoria. */
export function Thumb({ src, category, alt }: { src?: string | null; category?: string; alt?: string }) {
  const [broken, setBroken] = useState(false);
  const emoji = FALLBACK[category || 'outros'] || '📦';
  if (!src || broken) {
    return (
      <div className="thumb thumb-fallback" aria-hidden="true">
        {emoji}
      </div>
    );
  }
  return (
    <div className="thumb-wrap">
      <div className="thumb thumb-fallback" aria-hidden="true">
        {emoji}
      </div>
      <img className="thumb" src={src} alt={alt || ''} loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </div>
  );
}
