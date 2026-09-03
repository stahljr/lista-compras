import { cn } from '@/lib/utils';
import { money } from '@/lib/format';
import type { Offer } from '@/lib/types';

/** Preco em cada mercado, com o mais barato destacado. */
export function PriceTags({ offers, limit }: { offers: Offer[]; limit?: number }) {
  const available = offers.filter((o) => o.available && o.price > 0);
  if (!available.length) return <span className="text-muted-foreground/70 text-xs">sem preço nos mercados</span>;
  const min = Math.min(...available.map((o) => o.price));
  const shown = limit ? available.slice(0, limit) : available;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((o) => (
        <span
          key={o.market}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
            o.price === min && available.length > 1 && 'border-success/40 bg-success/10 text-success',
          )}
        >
          <span className="text-muted-foreground">{o.marketLabel}</span>
          <span className="font-bold tabular-nums">{money(o.price)}</span>
        </span>
      ))}
      {limit && available.length > limit && (
        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
          +{available.length - limit}
        </span>
      )}
    </div>
  );
}
