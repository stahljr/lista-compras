import { cn } from '@/lib/utils';
import { diaEMes, money, precoVelho } from '@/lib/format';
import type { Offer } from '@/lib/types';

/** Preco em cada mercado, com o mais barato destacado. */
export function PriceTags({ offers, limit }: { offers: Offer[]; limit?: number }) {
  const available = offers.filter((o) => o.available && o.price > 0);
  if (!available.length) return <span className="text-muted-foreground/70 text-xs">sem preço nos mercados</span>;
  const min = Math.min(...available.map((o) => o.price));
  const shown = limit ? available.slice(0, limit) : available;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((o) => {
        const velho = o.stale ?? precoVelho(o.updatedAt);
        return (
          <span
            key={o.market}
            // Preco velho nao ganha o destaque de "mais barato" mesmo quando e
            // o menor numero: seria apontar a compra para um preco que talvez
            // nao exista mais.
            title={velho ? `Preço de ${diaEMes(o.updatedAt)} — este mercado parou de responder` : undefined}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
              o.price === min && available.length > 1 && !velho && 'border-success/40 bg-success/10 text-success',
              velho && 'border-dashed opacity-70',
            )}
          >
            <span className="text-muted-foreground">{o.marketLabel}</span>
            <span className={cn('font-bold tabular-nums', velho && 'font-semibold')}>{money(o.price)}</span>
            {velho && <span className="text-muted-foreground/80 font-medium">de {diaEMes(o.updatedAt)}</span>}
          </span>
        );
      })}
      {limit && available.length > limit && (
        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
          +{available.length - limit}
        </span>
      )}
    </div>
  );
}
