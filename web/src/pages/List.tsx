import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ListChecks, Pencil, Plus, ShoppingCart, Store, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { money } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, Page, SectionTitle, Topbar } from '@/components/Layout';
import { ListItemRow } from '@/components/ListItemRow';
import { Sheet } from '@/components/Sheet';
import { Thumb } from '@/components/Thumb';
import type { ListItem, Product, ShoppingList, Trip } from '@/lib/types';

/**
 * A lista geral: e aqui que se anota o que precisa comprar. Nao e o carrinho --
 * o carrinho e montado a partir desta lista (e de outras) na hora de ir ao
 * mercado.
 */
export default function List() {
  const { general, setGeneral, lists, categories, markets, trip, setTrip, refreshLists, notify } = useStore();
  const navigate = useNavigate();
  const [quick, setQuick] = useState('');
  const [sugestoes, setSugestoes] = useState<Product[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const debounce = useRef<number | undefined>(undefined);
  const [sheet, setSheet] = useState<'build' | 'save' | 'clear' | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const planned = useMemo(() => {
    let total = 0;
    let semPreco = 0;
    for (const item of general?.items || []) {
      const valores = Object.values(item.priceSnapshot || {}).filter((v) => v > 0);
      if (!valores.length) semPreco++;
      else total += Math.min(...valores) * item.qty;
    }
    return { total: Math.round(total * 100) / 100, semPreco };
  }, [general]);

  const grouped = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    for (const item of general?.items || []) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: categories.find((c) => c.key === key)?.label || 'Outros',
      emoji: categories.find((c) => c.key === key)?.emoji || '📦',
      items,
    }));
  }, [general, categories]);

  // Digitar "detergente" tem de mostrar os detergentes dos mercados, com
  // preco, e nao gravar a palavra crua -- item sem produto vinculado nao entra
  // na comparacao de preco nem leva foto.
  useEffect(() => {
    window.clearTimeout(debounce.current);
    const termo = quick.trim();
    if (termo.length < 2) {
      setSugestoes([]);
      return;
    }
    debounce.current = window.setTimeout(() => {
      setBuscando(true);
      void api
        .get<{ products: Product[] }>(`/catalog/search?q=${encodeURIComponent(termo)}&limit=8`)
        .then((d) => setSugestoes(d.products))
        .catch(() => setSugestoes([]))
        .finally(() => setBuscando(false));
    }, 400);
    return () => window.clearTimeout(debounce.current);
  }, [quick]);

  async function act(promise: Promise<{ list: ShoppingList }>) {
    setError('');
    try {
      setGeneral((await promise).list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para salvar');
    }
  }

  function limparBusca() {
    setQuick('');
    setSugestoes([]);
    setMostrarSugestoes(false);
  }

  /** Item do catalogo: leva foto, categoria e o preco de cada mercado. */
  async function addProduto(product: Product) {
    limparBusca();
    await act(api.post<{ list: ShoppingList }>('/lists/geral/items', { productId: product.id, qty: 1 }));
    notify(`${product.name} na lista`);
  }

  /** Escrito a mao: para o que nao existe no catalogo (papel toalha, gelo...). */
  async function addTexto(event?: React.FormEvent) {
    event?.preventDefault();
    const name = quick.trim();
    if (!name) return;
    limparBusca();
    await act(api.post<{ list: ShoppingList }>('/lists/geral/items', { name }));
  }

  function openBuild() {
    // A lista geral entra por padrao; as rapidas ficam a escolha.
    setChosen(general && general.items.length ? [general.id] : []);
    setSheet('build');
  }

  async function buildCart(market: string | null) {
    setBusy(true);
    setError('');
    try {
      const { trip: started } = await api.post<{ trip: Trip }>('/trips', { market, listIds: chosen });
      setTrip(started);
      setSheet(null);
      await refreshLists();
      navigate('/carrinho');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para montar o carrinho');
    } finally {
      setBusy(false);
    }
  }

  const count = general?.items.length ?? 0;
  const escolhidas = [
    ...(general && chosen.includes(general.id) ? [{ name: general.name, itemCount: count }] : []),
    ...lists.filter((l) => chosen.includes(l.id)),
  ];
  const totalEscolhido = escolhidas.reduce((acc, l) => acc + l.itemCount, 0);

  return (
    <>
      <Topbar
        title="Lista"
        subtitle={
          count === 0
            ? 'vazia por enquanto'
            : `${count} ${count === 1 ? 'item' : 'itens'}${planned.total > 0 ? ` · ≈ ${money(planned.total)}` : ''}`
        }
      >
        {count > 0 && (
          <Button variant="outline" size="sm" onClick={() => setSheet('save')}>
            Salvar
          </Button>
        )}
      </Topbar>

      <Page className="md:max-w-3xl">
        <form className="mb-3 flex items-center gap-2" onSubmit={addTexto}>
          <div className="relative flex-1">
            <Input
              className="h-11"
              placeholder="Preciso comprar…"
              value={quick}
              onChange={(e) => {
                setQuick(e.target.value);
                setMostrarSugestoes(true);
              }}
              onFocus={() => setMostrarSugestoes(true)}
              // O clique numa sugestao precisa acontecer antes de o painel
              // fechar; por isso o atraso no blur.
              onBlur={() => window.setTimeout(() => setMostrarSugestoes(false), 180)}
              enterKeyHint="done"
              autoComplete="off"
            />

            {mostrarSugestoes && quick.trim().length >= 2 && (sugestoes.length > 0 || buscando) && (
              <div className="bg-popover absolute top-[calc(100%+0.4rem)] right-0 left-0 z-30 max-h-[60vh] overflow-y-auto rounded-xl border shadow-2xl">
                {sugestoes.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => void addProduto(p)}
                    className="hover:bg-muted flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-left last:border-b-0"
                  >
                    <Thumb src={p.imageUrl} category={p.category} alt={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {p.cheapest ? `${p.cheapest.marketLabel}${p.marketsCount > 1 ? ` · +${p.marketsCount - 1}` : ''}` : 'sem preço'}
                      </span>
                    </span>
                    {p.cheapest && <span className="text-sm font-bold tabular-nums">{money(p.cheapest.price)}</span>}
                  </button>
                ))}
                {buscando && sugestoes.length === 0 && (
                  <span className="sugestao det" style={{ color: 'var(--muted)' }}>
                    procurando nos mercados…
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void addTexto()}
                  className="hover:bg-muted flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-lg">
                    <Pencil className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">Anotar “{quick.trim()}” à mão</span>
                    <span className="text-muted-foreground block text-xs">sem produto do mercado, então sem preço</span>
                  </span>
                </button>
              </div>
            )}
          </div>
          <Button size="lg" disabled={!quick.trim()}>
            <Plus />
            Add
          </Button>
        </form>

        {error && (
          <div className="banner danger">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {trip && (
          <div className="card card-pad" style={{ marginBottom: 12 }}>
            <div className="row">
              <span style={{ fontSize: 22 }}>🛒</span>
              <div className="grow">
                <strong>Carrinho em andamento</strong>
                <div className="small muted">
                  {trip.marketLabel ? `${trip.marketLabel} · ` : ''}
                  {trip.progress.picked} de {trip.progress.total} pegos · {money(trip.spent)}
                </div>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => navigate('/carrinho')}>
                Abrir
              </button>
            </div>
          </div>
        )}

        {count === 0 ? (
          <EmptyState icon={<ClipboardList />} title="A lista está vazia">
            <p>Anote acima — o app sugere o produto dos mercados com preço. Ou escolha olhando as prateleiras no Mercado.</p>
            <div className="mx-auto mt-4 flex max-w-xs gap-2">
              <Button variant="outline" className="flex-1" onClick={() => navigate('/')}>
                <Store />
                Mercado
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => navigate('/listas')}>
                <ListChecks />
                Listas
              </Button>
            </div>
          </EmptyState>
        ) : (
          <>
            {grouped.map((group) => (
              <div key={group.key}>
                <SectionTitle action={<span className="text-muted-foreground text-sm">{group.items.length}</span>}>
                  {group.label}
                </SectionTitle>
                <Card className="overflow-hidden">
                  {group.items.map((item) => (
                    <ListItemRow
                      key={item.id}
                      item={item}
                      onQty={(qty) => act(api.patch<{ list: ShoppingList }>(`/lists/geral/items/${item.id}`, { qty }))}
                      onRemove={() => act(api.del<{ list: ShoppingList }>(`/lists/geral/items/${item.id}`))}
                      onMarket={(market) =>
                        act(api.patch<{ list: ShoppingList }>(`/lists/geral/items/${item.id}`, { market }))
                      }
                    />
                  ))}
                </Card>
              </div>
            ))}

            <div className="mt-6 flex flex-col gap-2">
              <Button variant="outline" size="lg" className="w-full" onClick={() => navigate('/comparar')}>
                <Wallet />
                Onde vale mais a pena?
              </Button>
              <Button size="lg" className="w-full" onClick={openBuild} disabled={!!trip}>
                <ShoppingCart />
                Montar carrinho
              </Button>
              <p className="small faint" style={{ margin: '0 4px' }}>
                O preço é congelado aqui, na lista — no mercado o app não fica consultando preço, só carrega este número.
                {planned.semPreco > 0 &&
                  ` ${planned.semPreco} ${planned.semPreco === 1 ? 'item escrito' : 'itens escritos'} à mão ${planned.semPreco === 1 ? 'não tem' : 'não têm'} preço.`}
              </p>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 w-full" onClick={() => setSheet('clear')}>
                Limpar a lista
              </Button>
            </div>
          </>
        )}
      </Page>

      {sheet === 'build' && (
        <Sheet
          title="Montar carrinho"
          subtitle="Escolha as listas que vão para o mercado. Item repetido em duas listas soma a quantidade."
          onClose={() => setSheet(null)}
        >
          <div className="stack" style={{ marginBottom: 16 }}>
            {general && (
              <button
                className={`btn btn-block${chosen.includes(general.id) ? ' btn-primary' : ''}`}
                style={{ justifyContent: 'flex-start' }}
                disabled={!count}
                onClick={() =>
                  setChosen((prev) => (prev.includes(general.id) ? prev.filter((i) => i !== general.id) : [...prev, general.id]))
                }
              >
                <span>{chosen.includes(general.id) ? '☑' : '☐'}</span>
                <span className="grow" style={{ textAlign: 'left' }}>
                  📝 {general.name}
                </span>
                <span className="small">{count}</span>
              </button>
            )}
            {lists.map((l) => (
              <button
                key={l.id}
                className={`btn btn-block${chosen.includes(l.id) ? ' btn-primary' : ''}`}
                style={{ justifyContent: 'flex-start' }}
                disabled={!l.itemCount}
                onClick={() => setChosen((prev) => (prev.includes(l.id) ? prev.filter((i) => i !== l.id) : [...prev, l.id]))}
              >
                <span>{chosen.includes(l.id) ? '☑' : '☐'}</span>
                <span className="grow" style={{ textAlign: 'left' }}>
                  {l.emoji} {l.name}
                </span>
                <span className="small">{l.itemCount}</span>
              </button>
            ))}
          </div>

          <div className="section-title" style={{ marginTop: 0 }}>
            Em qual mercado você está?
          </div>
          <div className="stack">
            {markets.map((m) => (
              <button
                key={m.key}
                className="btn btn-block btn-lg"
                style={{ borderColor: m.color, color: m.color, justifyContent: 'flex-start' }}
                disabled={busy || !totalEscolhido}
                onClick={() => buildCart(m.key)}
              >
                <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color }} />
                {m.label}
              </button>
            ))}
            <button className="btn btn-ghost btn-block" disabled={busy || !totalEscolhido} onClick={() => buildCart(null)}>
              Outro lugar / não sei ainda
            </button>
            {!totalEscolhido && <p className="small faint">Escolha ao menos uma lista com itens.</p>}
          </div>
        </Sheet>
      )}

      {sheet === 'save' && (
        <Sheet
          title="Salvar como lista rápida"
          subtitle="Fica cadastrada para você usar de novo. Diferente da lista geral, usá-la no carrinho não a apaga."
          onClose={() => setSheet(null)}
        >
          <label className="field">
            <span>Nome da lista</span>
            <input
              className="input"
              placeholder="Limpeza, churrasco, feira…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              autoFocus
            />
          </label>
          <button
            className="btn btn-primary btn-block btn-lg"
            disabled={!saveName.trim()}
            onClick={async () => {
              await api.post('/lists/geral/save-as', { name: saveName.trim() });
              await refreshLists();
              setSaveName('');
              setSheet(null);
              navigate('/listas');
            }}
          >
            Salvar lista
          </button>
        </Sheet>
      )}

      {sheet === 'clear' && (
        <Sheet
          title="Limpar a lista?"
          subtitle={`Os ${count} itens saem da lista geral. Suas listas rápidas não são afetadas.`}
          onClose={() => setSheet(null)}
        >
          <div className="stack">
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={async () => {
                await act(api.post<{ list: ShoppingList }>('/lists/geral/clear'));
                setSheet(null);
              }}
            >
              Sim, limpar
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setSheet(null)}>
              Deixa como está
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
