import { useEffect, useState } from 'react';
import { Check, ImageIcon, Minus, Plus, ShoppingCart, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { money, quantity as fmtQty } from '@/lib/format';
import { roundQty, stepOf, unitChoices } from '@/lib/unit';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EMOJI, savingsOf } from '@/components/ProductCard';
import type { Product } from '@/lib/types';

type Historico = { times: number; avg: number | null; min: number | null; max: number | null; last: number | null } | null;

/**
 * O produto aberto: a foto grande, o preco em cada um dos quatro mercados
 * (inclusive os que nao tem), o que a casa ja pagou por ele, e a chance de
 * corrigir o corredor quando o classificador errou.
 */
export function ProductDialog({
  product,
  open,
  onOpenChange,
  onAdd,
  onCoverChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (p: Product, qty: number, unit: string, market: string | null) => void;
  onCoverChange?: () => void;
}) {
  const { markets, categories, notify } = useStore();
  const [detalhe, setDetalhe] = useState<Product | null>(product);
  const [historico, setHistorico] = useState<Historico>(null);
  const [buscando, setBuscando] = useState(false);
  const [qty, setQty] = useState(1);
  const [unidade, setUnidade] = useState(product?.unit || 'un');
  const [mercado, setMercado] = useState<string | null>(null);
  const [trocandoCategoria, setTrocandoCategoria] = useState(false);
  const [quebrada, setQuebrada] = useState(false);

  useEffect(() => {
    if (!open || !product) return;
    setDetalhe(product);
    setQty(1);
    setUnidade(product.unit);
    setMercado(null);
    setQuebrada(false);
    setTrocandoCategoria(false);
    setBuscando(true);
    // refresh=1 procura o produto nos mercados que ainda nao o tinham, para o
    // dialogo poder mostrar os quatro em vez de so os que a busca trouxe.
    void api
      .get<{ product: Product; history: Historico }>(`/catalog/products/${product.id}?refresh=1`)
      .then((d) => {
        setDetalhe(d.product);
        setHistorico(d.history);
      })
      .catch(() => {})
      .finally(() => setBuscando(false));
  }, [open, product]);

  const p = detalhe;
  if (!p) return null;

  // Os mercados vem na ordem do preco: os dois melhores primeiro, que e o que
  // se quer saber antes de decidir.
  const disponiveis = [...p.offers.filter((o) => o.available && o.price > 0)].sort((a, b) => a.price - b.price);
  const ausentes = markets.filter((m) => !disponiveis.some((o) => o.market === m.key));
  const barato = disponiveis.length ? disponiveis[0].price : null;
  // O preco que vale para este item: o do mercado escolhido, senao o menor.
  const valor = mercado ? (disponiveis.find((o) => o.market === mercado)?.price ?? null) : barato;
  const economia = savingsOf(p);
  const categoriaAtual = categories.find((c) => c.key === p.category);

  // Bandeja ou peso: a unidade do mercado e so o padrao. Quando as duas
  // fazem sentido (carne, frios, hortifruti) quem compra escolhe, e o total
  // vira estimativa se a conta do mercado for na outra unidade.
  const escolhas = unitChoices(p);
  const passo = stepOf(unidade);
  const pesos = [0.5, 1, 1.5, 2];
  const naUnidadeDoPreco = unidade === p.unit;
  const total = valor != null ? valor * qty : null;

  function trocarUnidade(u: string) {
    setUnidade(u);
    setQty(1);
  }

  async function usarComoCapa() {
    if (!p?.imageUrl) return;
    try {
      await api.patch(`/catalog/categories/${p.category}/cover`, { productId: p.id });
      onCoverChange?.();
      notify(`Foto de ${categoriaAtual?.label} trocada`);
    } catch {
      notify('não deu para trocar a foto');
    }
  }

  async function mudarCategoria(key: string) {
    try {
      const { product: atualizado } = await api.patch<{ product: Product }>(`/catalog/products/${p!.id}/category`, {
        category: key,
      });
      setDetalhe(atualizado);
      setTrocandoCategoria(false);
      notify(`Movido para ${categories.find((c) => c.key === key)?.label}`);
    } catch {
      notify('não deu para mudar a categoria');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex gap-3.5">
            <div className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border bg-neutral-50">
              {p.imageUrl && !quebrada ? (
                <img
                  src={p.imageUrl}
                  alt=""
                  className="size-full object-contain p-1.5"
                  onError={() => setQuebrada(true)}
                />
              ) : (
                <span className="text-3xl" aria-hidden="true">
                  {EMOJI[p.category] || '📦'}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle>{p.name}</DialogTitle>
              <DialogDescription className="mt-1">
                {p.brand && <span className="font-semibold">{p.brand}</span>}
                {p.brand && p.ean && ' · '}
                {p.ean && <span className="tabular-nums">{p.ean}</span>}
              </DialogDescription>
              {economia.percent >= 3 && (
                <Badge variant="success" className="mt-2">
                  economize {money(economia.value)} escolhendo o mercado
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* preço em cada mercado, e a escolha de onde comprar este item */}
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-bold tracking-wider uppercase">
            Onde comprar este item
          </p>
          <div className="overflow-hidden rounded-xl border">
            {disponiveis.map((oferta, i) => {
              const m = markets.find((x) => x.key === oferta.market);
              const escolhido = mercado === oferta.market;
              return (
                <button
                  key={oferta.market}
                  type="button"
                  onClick={() => setMercado(escolhido ? null : oferta.market)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b px-3.5 py-2.5 text-left last:border-b-0 transition-colors',
                    escolhido ? 'bg-primary/10' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: m?.color }} />
                  <span className="flex-1 text-sm font-semibold">{m?.label || oferta.marketLabel}</span>
                  {i === 0 && disponiveis.length > 1 && <Badge variant="success">mais barato</Badge>}
                  {i === 1 && <Badge variant="secondary">2º melhor</Badge>}
                  <span className="text-[15px] font-bold tabular-nums">{money(oferta.price)}</span>
                  <Check className={cn('size-4 shrink-0', escolhido ? 'text-primary' : 'opacity-0')} />
                </button>
              );
            })}
            {ausentes.map((m) => (
              <div key={m.key} className="flex items-center gap-3 border-b px-3.5 py-2.5 opacity-60 last:border-b-0">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="flex-1 text-sm font-semibold">{m.label}</span>
                {buscando ? <Skeleton className="h-4 w-16" /> : <span className="text-muted-foreground text-sm">não tem</span>}
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs">
            {mercado
              ? `Este item fica marcado para o ${markets.find((m) => m.key === mercado)?.label}. Toque de novo para soltar.`
              : 'Sem escolha, vale onde estiver mais barato. Toque num mercado para fixar este item lá.'}
          </p>
        </div>

        {/* o que a casa já pagou */}
        {historico && historico.times > 0 && (
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-bold tracking-wider uppercase">Já pagamos</p>
            <div className="bg-muted/50 flex items-center gap-4 rounded-xl px-3.5 py-2.5 text-sm">
              <span>
                <span className="text-muted-foreground">última</span>{' '}
                <strong className="tabular-nums">{money(historico.last)}</strong>
              </span>
              {historico.times > 1 && (
                <span>
                  <span className="text-muted-foreground">média</span>{' '}
                  <strong className="tabular-nums">{money(historico.avg)}</strong>
                </span>
              )}
              <span className="text-muted-foreground ml-auto text-xs">
                {historico.times}× {historico.times === 1 ? 'compra' : 'compras'}
              </span>
            </div>
          </div>
        )}

        {/* corredor, com a chance de corrigir */}
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-bold tracking-wider uppercase">Corredor</p>
          {trocandoCategoria ? (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {categories.map((c) => (
                <Button
                  key={c.key}
                  variant={c.key === p.category ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start"
                  onClick={() => void mudarCategoria(c.key)}
                >
                  <span aria-hidden="true">{c.emoji}</span>
                  <span className="truncate">{c.label}</span>
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 text-[13px]">
                <span aria-hidden="true">{categoriaAtual?.emoji}</span>
                {categoriaAtual?.label}
              </Badge>
              {p.categoryLocked && <span className="text-muted-foreground text-xs">definido por você</span>}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setTrocandoCategoria(true)}>
                <Tag />
                Corrigir
              </Button>
            </div>
          )}
          {!trocandoCategoria && p.imageUrl && (
            <div className="mt-2">
              <Button variant="outline" size="sm" className="w-full" onClick={() => void usarComoCapa()}>
                <ImageIcon />
                Usar esta foto no corredor {categoriaAtual?.label}
              </Button>
            </div>
          )}
        </div>

        {/* bandeja ou peso */}
        {escolhas.length > 1 && (
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-bold tracking-wider uppercase">Como comprar</p>
            <div className="bg-muted inline-flex rounded-lg p-1">
              {escolhas.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => trocarUnidade(u)}
                  className={cn(
                    'rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors',
                    unidade === u ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {u === 'un' ? 'Bandeja / unidade' : 'Peso (kg)'}
                </button>
              ))}
            </div>
            {unidade === 'kg' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pesos.map((v) => (
                  <Button
                    key={v}
                    variant={qty === v ? 'default' : 'outline'}
                    size="sm"
                    className="tabular-nums"
                    onClick={() => setQty(v)}
                  >
                    {fmtQty(v, 'kg')}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* adicionar */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQty((q) => roundQty(Math.max(passo, q - passo)))}
              disabled={qty <= passo}
              aria-label="Menos"
            >
              <Minus />
            </Button>
            <span className="w-16 text-center font-bold tabular-nums">{fmtQty(qty, unidade)}</span>
            <Button variant="outline" size="icon" onClick={() => setQty((q) => roundQty(q + passo))} aria-label="Mais">
              <Plus />
            </Button>
          </div>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              onAdd(p, qty, unidade, mercado);
              onOpenChange(false);
            }}
          >
            <ShoppingCart />
            Adicionar{' '}
            {total != null && (
              <span className="opacity-80">
                · {naUnidadeDoPreco ? '' : '≈'}
                {money(total)}
              </span>
            )}
          </Button>
        </div>

        {total != null && !naUnidadeDoPreco && (
          <p className="text-muted-foreground text-xs">
            {p.unit === 'kg'
              ? 'O mercado cobra por kg — o valor da bandeja sai na balança, e dá para corrigir no carrinho.'
              : 'O preço é por unidade — o total do peso você confirma no mercado.'}
          </p>
        )}

        {p.categoryLocked && (
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <Check className="mt-px size-3.5 shrink-0" />
            Corredor escolhido por vocês — a reclassificação automática não mexe mais neste produto.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
