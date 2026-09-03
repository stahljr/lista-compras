import { useState } from 'react';
import { Heart, Minus, Plus, ShoppingCart, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { money, quantity as fmtQty } from '@/lib/format';
import { useStore } from '@/lib/store';
import { roundQty, stepOf } from '@/lib/unit';
import type { Product } from '@/lib/types';

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
 * O produto como numa gondola: foto grande no topo, o quanto se economiza
 * escolhendo o mercado certo, preco em destaque, quantidade e um botao largo.
 */
export function ProductCard({
  product,
  onAdd,
  onOpen,
  added,
}: {
  product: Product;
  onAdd: (qty: number, unit?: string) => void;
  onOpen?: () => void;
  added?: boolean;
}) {
  const { favoritos, toggleFavorito } = useStore();
  const favorito = favoritos.includes(product.id);
  const [quebrada, setQuebrada] = useState(false);
  const [carregada, setCarregada] = useState(false);
  // Passo do contador segue a unidade do mercado: meio quilo por toque no que
  // e vendido a peso, uma unidade no resto.
  const passo = stepOf(product.unit);
  const inicial = passo >= 100 ? 500 : 1;
  const [qty, setQty] = useState(inicial);
  const melhor = product.cheapest;
  const outros = Math.max(0, product.marketsCount - 1);
  const economia = savingsOf(product);
  const porUnidade = product.unit && product.unit !== 'un' ? `/${product.unit}` : '';

  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-lg">
      {economia.percent >= 3 && (
        <Badge variant="sale" className="absolute top-2 left-2 z-10 text-[11px]">
          −{economia.percent}%
        </Badge>
      )}

      {/* O coracao fica sobre a foto, no canto: e o gesto rapido de "isso a
          gente compra sempre", sem abrir o produto. */}
      <button
        type="button"
        onClick={() => void toggleFavorito(product.id)}
        aria-label={favorito ? `Desfavoritar ${product.name}` : `Favoritar ${product.name}`}
        aria-pressed={favorito}
        className="absolute top-1.5 right-1.5 z-10 grid size-8 place-items-center rounded-full bg-white/85 backdrop-blur-sm transition-transform active:scale-90"
      >
        <Heart
          className={cn('size-4', favorito ? 'fill-sale text-sale' : 'text-muted-foreground')}
        />
      </button>

      {/* Fundo claro fixo: a foto dos mercados vem recortada em branco, e no
          tema escuro um fundo escuro deixaria a moldura suja. */}
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={`Abrir ${product.name}`}
        className="relative grid aspect-square place-items-center bg-neutral-50 p-2 disabled:cursor-default"
      >
        {product.imageUrl && !quebrada ? (
          <>
            {!carregada && <Skeleton className="absolute inset-0 rounded-none" />}
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              onLoad={() => setCarregada(true)}
              onError={() => setQuebrada(true)}
              className={`relative size-full object-contain transition-opacity duration-300 ${carregada ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        ) : (
          <span className="text-4xl opacity-45" aria-hidden="true">
            {EMOJI[product.category] || '📦'}
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1 px-2.5 pt-2.5">
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className="line-clamp-2 min-h-[2.6em] text-left text-[13px] leading-snug font-semibold tracking-tight hover:underline disabled:cursor-default disabled:no-underline"
        >
          {product.name}
        </button>
        {product.brand && (
          <p className="text-muted-foreground/80 truncate text-[10.5px] font-semibold tracking-wider uppercase">
            {product.brand}
          </p>
        )}

        <div className="mt-auto pt-1">
          {melhor ? (
            <>
              {economia.percent >= 3 && (
                <p className="text-muted-foreground/70 text-xs line-through">{money(economia.max)}</p>
              )}
              <p className="text-[19px] leading-tight font-extrabold tracking-tighter tabular-nums">
                {money(melhor.price)}
                {porUnidade && <span className="text-muted-foreground ml-0.5 text-xs font-semibold">{porUnidade}</span>}
              </p>
              <p className="text-muted-foreground text-[11.5px] font-semibold">
                {melhor.marketLabel}
                {outros > 0 && <span className="text-muted-foreground/70 font-normal"> · +{outros}</span>}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground/70 text-xs">sem preço agora</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-2.5 py-2">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setQty((q) => roundQty(Math.max(passo, q - passo)))}
          disabled={qty <= passo}
          aria-label="Menos"
        >
          <Minus />
        </Button>
        <span className="flex-1 text-center text-sm font-bold tabular-nums">{fmtQty(qty, product.unit)}</span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setQty((q) => roundQty(q + passo))}
          aria-label="Mais"
        >
          <Plus />
        </Button>
      </div>

      <Button
        className={`mx-2.5 mb-2.5 ${added ? 'bg-success text-success-foreground hover:bg-success animate-[pulso_0.4s_ease-out]' : ''}`}
        onClick={() => {
          onAdd(qty, product.unit);
          setQty(inicial);
        }}
      >
        {added ? <Check /> : <ShoppingCart />}
        {added ? 'Adicionado' : 'Adicionar'}
      </Button>
    </Card>
  );
}

/** A silhueta do cartao enquanto os dados nao chegam. */
export function ProductCardSkeleton() {
  return (
    <Card className="pointer-events-none overflow-hidden" aria-hidden="true">
      <Skeleton className="aspect-square rounded-none" />
      <div className="flex flex-col gap-2 p-2.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="mt-1 h-5 w-2/5" />
      </div>
      <Skeleton className="mx-2.5 mb-2.5 h-9" />
    </Card>
  );
}
