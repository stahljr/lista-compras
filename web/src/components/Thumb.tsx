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

/**
 * Foto do produto; quando o mercado nao tem foto, cai no emoji da categoria.
 * O emoji fica atras da imagem, entao carregamento lento no 4G mostra o icone
 * em vez de um quadrado vazio. Fundo claro fixo: a foto vem recortada em
 * branco.
 */
export function Thumb({ src, category, alt }: { src?: string | null; category?: string; alt?: string }) {
  const [broken, setBroken] = useState(false);
  const emoji = FALLBACK[category || 'outros'] || '📦';
  const moldura = 'grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border bg-neutral-50 text-lg';

  if (!src || broken) {
    return (
      <div className={moldura} aria-hidden="true">
        {emoji}
      </div>
    );
  }
  return (
    <div className={`relative ${moldura}`}>
      <span aria-hidden="true">{emoji}</span>
      <img
        className="absolute inset-0 size-full object-contain p-0.5"
        src={src}
        alt={alt || ''}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    </div>
  );
}
