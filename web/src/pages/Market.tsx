import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Store, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, Page, SectionTitle, Topbar } from '@/components/Layout';
import { ProductCard, ProductCardSkeleton } from '@/components/ProductCard';
import { Shelf } from '@/components/Shelf';
import type { Product, ShoppingList } from '@/lib/types';

type Corredor = { key: string; label: string; emoji: string; total: number; products: Product[] };
type Busca = { products: Product[]; failed: { market: string; error: string }[] };

/** Foto para ilustrar o corredor: a do primeiro produto que tiver uma. */
function capaDo(c: Corredor) {
  return c.products.find((p) => p.imageUrl)?.imageUrl || null;
}

/** A placa do corredor: foto de um produto que esta nele, ou o emoji. */
function CorredorTile({ c, ativo, onClick }: { c: Corredor; ativo: boolean; onClick: () => void }) {
  const [carregada, setCarregada] = useState(false);
  const [quebrada, setQuebrada] = useState(false);
  const capa = capaDo(c);
  return (
    <button onClick={onClick} className="group flex snap-start flex-col items-center gap-1.5">
      <span
        className={cn(
          'relative grid size-[5.75rem] place-items-center overflow-hidden rounded-2xl border bg-neutral-50 shadow-sm transition-all md:size-28',
          ativo ? 'border-primary ring-primary/30 ring-2' : 'group-hover:border-primary/50',
        )}
      >
        {capa && !quebrada ? (
          <>
            {!carregada && <Skeleton className="absolute inset-0 rounded-none" />}
            <img
              src={capa}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setCarregada(true)}
              onError={() => setQuebrada(true)}
              className={cn('relative size-full object-contain p-2 transition-opacity duration-300', carregada ? 'opacity-100' : 'opacity-0')}
            />
          </>
        ) : (
          <span className="text-3xl" aria-hidden="true">
            {c.emoji}
          </span>
        )}
      </span>
      <span className="w-[5.75rem] text-center text-xs leading-tight font-semibold tracking-tight md:w-28 md:text-[12.5px]">
        {c.label}
      </span>
    </button>
  );
}

/**
 * A tela inicial: o mercado. Sem busca, mostra os corredores e as prateleiras
 * por categoria -- da para escolher olhando, como numa loja. Com busca, os
 * quatro mercados de uma vez.
 */
export default function Market() {
  const { setGeneral, general, trip, refreshTrip, notify } = useStore();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [carregandoCorredores, setCarregandoCorredores] = useState(true);
  const [resultados, setResultados] = useState<Product[]>([]);
  const [falhas, setFalhas] = useState<{ market: string; error: string }[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [doCorredor, setDoCorredor] = useState<Product[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [erro, setErro] = useState('');
  const debounce = useRef<number | undefined>(undefined);

  const buscando = term.trim().length >= 2;
  const naLista = general?.items.length ?? 0;
  const destino = trip && trip.status === 'active' ? 'carrinho' : 'lista';

  const recarregarCorredores = useCallback(
    () =>
      api
        .get<{ shelves: Corredor[] }>('/catalog/shelves?perCategory=12')
        .then((d) => setCorredores(d.shelves))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    void recarregarCorredores().finally(() => setCarregandoCorredores(false));
  }, [recarregarCorredores]);

  const buscar = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResultados([]);
      setFalhas([]);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const d = await api.get<Busca>(`/catalog/search?q=${encodeURIComponent(q)}&limit=40`);
      setResultados(d.products);
      setFalhas(d.failed || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'a busca falhou');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void buscar(term), 450);
    return () => window.clearTimeout(debounce.current);
  }, [term, buscar]);

  async function abrirCorredor(key: string) {
    setAberto(key);
    setTerm('');
    setDoCorredor([]);
    setCarregando(true);
    try {
      // O servidor enche o corredor buscando nos mercados quando ainda esta
      // vazio, entao esta chamada pode levar alguns segundos.
      const d = await api.get<{ products: Product[] }>(`/catalog/categories/${key}?limit=60`);
      setDoCorredor(d.products);
      void recarregarCorredores();
    } finally {
      setCarregando(false);
    }
  }

  /** Com carrinho aberto o item vai direto pra ele; fora disso, para a lista. */
  async function add(product: Product, qty = 1) {
    setErro('');
    try {
      if (trip && trip.status === 'active') {
        await api.post(`/trips/${trip.id}/items`, { productId: product.id, qty });
        await refreshTrip();
      } else {
        const { list } = await api.post<{ list: ShoppingList }>('/lists/geral/items', { productId: product.id, qty });
        setGeneral(list);
      }
      setAdded((p) => ({ ...p, [product.id]: true }));
      window.setTimeout(() => setAdded((p) => ({ ...p, [product.id]: false })), 1400);
      notify(`${qty > 1 ? `${qty}× ` : ''}${product.name} ${destino === 'carrinho' ? 'no carrinho' : 'na lista'}`, {
        texto: 'Ver',
        href: destino === 'carrinho' ? '/carrinho' : '/lista',
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para adicionar');
    }
  }

  const grade = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
  const corredorAberto = corredores.find((c) => c.key === aberto);

  return (
    <>
      <Topbar
        title="Mercado"
        subtitle={destino === 'carrinho' ? 'adicionando no carrinho em andamento' : 'preço nos quatro mercados'}
      >
        {naLista > 0 && destino === 'lista' && (
          <Button variant="outline" size="sm" onClick={() => navigate('/lista')}>
            <ClipboardList />
            {naLista}
          </Button>
        )}
      </Topbar>

      <Page>
        <div className="relative">
          <Search className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <Input
            className="h-12 pl-10.5 text-base"
            placeholder="Buscar produto: arroz, detergente, café…"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setAberto(null);
            }}
            enterKeyHint="search"
            autoComplete="off"
          />
          {carregando && (
            <div className="border-muted border-t-primary absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin rounded-full border-2" />
          )}
        </div>

        {!buscando && corredores.length > 0 && (
          <>
            <SectionTitle>Corredores</SectionTitle>
            <div className="grid snap-x auto-cols-max grid-flow-col gap-3 overflow-x-auto pb-2 [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden">
              {corredores.map((c) => (
                <CorredorTile
                  key={c.key}
                  c={c}
                  ativo={aberto === c.key}
                  onClick={() => (aberto === c.key ? (setAberto(null), setDoCorredor([])) : void abrirCorredor(c.key))}
                />
              ))}
            </div>
          </>
        )}

        {erro && (
          <div className="bg-destructive/10 text-destructive mt-3 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium">
            <TriangleAlert className="size-4 shrink-0" />
            {erro}
          </div>
        )}

        {falhas.length > 0 && (
          <div className="bg-accent/20 text-accent-foreground mt-3 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium">
            <TriangleAlert className="size-4 shrink-0" />
            Não deu para consultar {falhas.map((f) => f.market).join(', ')} agora. Os outros estão aí.
          </div>
        )}

        {buscando && (
          <>
            <SectionTitle action={<span className="text-muted-foreground text-sm">{resultados.length}</span>}>
              Resultados
            </SectionTitle>
            {!resultados.length && !carregando ? (
              <EmptyState icon={<Search />} title="Nada encontrado">
                Tente escrever de outro jeito, ou anote à mão na lista.
              </EmptyState>
            ) : (
              <div className={grade}>
                {resultados.map((p) => (
                  <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(q) => void add(p, q)} />
                ))}
              </div>
            )}
          </>
        )}

        {!buscando && aberto && (
          <>
            <SectionTitle action={<span className="text-muted-foreground text-sm">{doCorredor.length}</span>}>
              {corredorAberto?.label}
            </SectionTitle>
            {carregando && !doCorredor.length ? (
              <>
                <p className="text-muted-foreground mb-4 text-sm">
                  Enchendo a prateleira: buscando este corredor nos quatro mercados.
                </p>
                <div className={grade}>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              </>
            ) : (
              <div className={grade}>
                {doCorredor.map((p) => (
                  <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(q) => void add(p, q)} />
                ))}
              </div>
            )}
          </>
        )}

        {!buscando &&
          !aberto &&
          (carregandoCorredores && !corredores.length ? (
            ['a', 'b'].map((k) => (
              <div key={k}>
                <SectionTitle>
                  <Skeleton className="h-5 w-36" />
                </SectionTitle>
                <div className="grid auto-cols-[9.5rem] grid-flow-col gap-2.5 overflow-hidden md:auto-cols-[12rem] md:gap-4">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              </div>
            ))
          ) : !corredores.length ? (
            <EmptyState icon={<Store />} title="Catálogo vazio">
              Busque um produto acima para o app trazer dos mercados — ou rode <code>npm run seed</code> no servidor para
              já começar com as prateleiras cheias.
            </EmptyState>
          ) : (
            corredores
              .filter((c) => c.products.length)
              .map((c) => (
                <div key={c.key}>
                  <SectionTitle
                    action={
                      <Button variant="ghost" size="sm" onClick={() => void abrirCorredor(c.key)}>
                        ver {c.total} →
                      </Button>
                    }
                  >
                    {c.label}
                  </SectionTitle>
                  <Shelf>
                    {c.products.map((p) => (
                      <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(q) => void add(p, q)} />
                    ))}
                  </Shelf>
                </div>
              ))
          ))}
      </Page>
    </>
  );
}
