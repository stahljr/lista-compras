import { useState } from 'react';
import { money, quantity as fmtQty } from '../lib/format';
import type { Product } from '../lib/types';

export const EMOJI: Record<string, string> = {
  hortifruti: '🥬', padaria: '🥖', acougue: '🥩', frios: '🧀', matinais: '☕',
  mercearia: '🍚', doces: '🍫', congelados: '🧊', bebidas: '🧴', limpeza: '🧽',
  higiene: '🧼', bebe: '🍼', pet: '🐾', casa: '🏠', outros: '📦',
};

/** Diferenca entre o mercado mais caro e o mais barato, em reais e em %. */
export function savingsOf(product: Product) {
  const prices = product.offers.filter((o) => o.available && o.price > 0).map((o) => o.price);
  if (prices.length < 2) return { value: 0, percent: 0, max: 0 };
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  return { value: Math.round((max - min) * 100) / 100, percent: Math.round(((max - min) / max) * 100), max };
}

/**
 * O produto como numa gondola de mercado: foto grande, o quanto se economiza
 * escolhendo o mercado certo, o preco em destaque, quantidade e um botao largo
 * de adicionar. Da para escolher e pegar dois sem sair da tela.
 */
export function ProductCard({ product, onAdd, added }: { product: Product; onAdd: (qty: number) => void; added?: boolean }) {
  const [broken, setBroken] = useState(false);
  const [qty, setQty] = useState(1);
  const melhor = product.cheapest;
  const outros = Math.max(0, product.marketsCount - 1);
  const economia = savingsOf(product);
  const porUnidade = product.unit && product.unit !== 'un' ? `/${product.unit}` : '';

  return (
    <div className="produto">
      {economia.percent >= 3 && <span className="produto-desconto">−{economia.percent}%</span>}

      <div className="produto-foto">
        {product.imageUrl && !broken ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" onError={() => setBroken(true)} />
        ) : (
          <span className="vazio" aria-hidden="true">
            {EMOJI[product.category] || '📦'}
          </span>
        )}
      </div>

      <div className="produto-corpo">
        <div className="produto-nome">{product.name}</div>
        {product.brand && <div className="produto-marca">{product.brand}</div>}
        <div className="produto-preco">
          {melhor ? (
            <>
              {/* O "de" e o preco do mercado mais caro: mostra o que se ganha
                  comprando no lugar certo, nao uma promocao inventada. */}
              {economia.percent >= 3 && <div className="produto-de">{money(economia.max)}</div>}
              <div className="linha">
                <span className="valor">{money(melhor.price)}</span>
                {porUnidade && <span className="unidade">{porUnidade}</span>}
              </div>
              <div className="onde">
                {melhor.marketLabel}
                {outros > 0 && <span className="outros"> · +{outros}</span>}
              </div>
            </>
          ) : (
            <div className="outros">sem preço agora</div>
          )}
        </div>
      </div>

      <div className="produto-qtd">
        <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos" disabled={qty <= 1}>
          −
        </button>
        <span className="n">{fmtQty(qty)}</span>
        <button onClick={() => setQty((q) => q + 1)} aria-label="Mais">
          +
        </button>
      </div>

      <button
        className={`produto-botao${added ? ' ok' : ''}`}
        onClick={() => {
          onAdd(qty);
          setQty(1);
        }}
      >
        {added ? '✓ Adicionado' : '🛒 Adicionar'}
      </button>
    </div>
  );
}
