import { money } from '../lib/format';
import type { Offer } from '../lib/types';

/** Preco em cada mercado, com o mais barato destacado. */
export function PriceTags({ offers, limit }: { offers: Offer[]; limit?: number }) {
  const available = offers.filter((o) => o.available && o.price > 0);
  if (!available.length) return <span className="small faint">sem preço nos mercados</span>;
  const min = Math.min(...available.map((o) => o.price));
  const shown = limit ? available.slice(0, limit) : available;
  return (
    <div className="prices">
      {shown.map((o) => (
        <span key={o.market} className={`price-tag${o.price === min && available.length > 1 ? ' best' : ''}`}>
          <span className="m">{o.marketLabel}</span>
          <span className="v">{money(o.price)}</span>
        </span>
      ))}
      {limit && available.length > limit && <span className="price-tag">+{available.length - limit}</span>}
    </div>
  );
}
