import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, semRede } from '../lib/api';
import { enfileirar } from '../lib/offline';
import { aplicarPatch } from '../lib/tripLocal';
import { useStore } from '../lib/store';
import { money, quantity } from '../lib/format';
import {
  Check,
  ClipboardList,
  PartyPopper,
  Plus,

  Search,
  ShoppingCart,
  Signal,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Banner, EmptyState, Field, Page, Row, RowBody, RowMeta, RowName, SectionTitle, Topbar } from '@/components/Layout';
import { Thumb } from '@/components/Thumb';
import { Sheet } from '@/components/Sheet';
import type { FinishResult, ListSummary, Product, Trip as TripType, TripItem } from '../lib/types';

type Parecido = { product: Product; priceHere: number };

/**
 * O carrinho: a lista de conferencia do mercado. Montado de uma ou mais
 * listas, aqui so se marca o que foi pego -- e, se a etiqueta estiver
 * diferente, corrige o preco.
 */
export default function Cart() {
  const { trip, setTrip, refreshGeneral, refreshLists, lists, categories, markets, user, online, pendingWrites, notePendingWrite } = useStore();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'finish' | 'add' | 'addList' | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [focusPrice, setFocusPrice] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [newItem, setNewItem] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [parecidos, setParecidos] = useState<{ item: TripItem; marketLabel: string; options: Parecido[] } | null>(null);

  const groups = useMemo(() => {
    if (!trip) return [];
    const pending = trip.items.filter((i) => !i.picked);
    const map = new Map<string, TripItem[]>();
    for (const item of pending) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: categories.find((c) => c.key === key)?.label || items[0].categoryLabel,
      emoji: categories.find((c) => c.key === key)?.emoji || '📦',
      items,
    }));
  }, [trip, categories]);

  const picked = trip?.items.filter((i) => i.picked) ?? [];

  async function update(item: TripItem, patch: { picked?: boolean; unitPrice?: number | null }) {
    if (!trip) return;
    setError('');
    const anterior = trip;
    // Marca na tela na hora: no corredor do mercado a resposta tem de ser
    // imediata, e o servidor confirma em seguida.
    setTrip(aplicarPatch(trip, item.id, patch, user ? { id: user.id, name: user.name, color: user.color } : null));
    try {
      const { trip: updated } = await api.patch<{ trip: TripType }>(`/trips/${trip.id}/items/${item.id}`, patch);
      setTrip(updated);
    } catch (err) {
      if (semRede(err)) {
        // Sem sinal: a marcacao fica na fila e sobe quando a rede voltar.
        enfileirar('PATCH', `/trips/${trip.id}/items/${item.id}`, patch);
        notePendingWrite();
        return;
      }
      setTrip(anterior);
      setError(err instanceof Error ? err.message : 'não deu para salvar');
    }
  }

  /**
   * "O Festval nao tem esse arroz": procura no proprio catalogo o que este
   * mercado tem de mais parecido, para dar para resolver ali e nao voltar
   * para casa sem o item.
   */
  async function verParecidos(item: TripItem) {
    if (!trip) return;
    setError('');
    setBusy(true);
    try {
      const d = await api.get<{ marketLabel: string; options: Parecido[] }>(
        `/trips/${trip.id}/items/${item.id}/alternatives`,
      );
      setParecidos({ item, marketLabel: d.marketLabel, options: d.options });
    } catch (err) {
      setError(semRede(err) ? 'sem sinal para procurar parecidos agora' : 'não deu para procurar parecidos');
    } finally {
      setBusy(false);
    }
  }

  async function trocarPor(item: TripItem, productId: number) {
    if (!trip) return;
    setBusy(true);
    try {
      const { trip: atualizado } = await api.post<{ trip: TripType }>(
        `/trips/${trip.id}/items/${item.id}/swap`,
        { productId },
      );
      setTrip(atualizado);
      setParecidos(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para trocar o item');
    } finally {
      setBusy(false);
    }
  }

  function priceValue(item: TripItem) {
    // Enquanto digita, mostra o que foi digitado. Parado, mostra o preco que
    // vale: o da lista, ou o corrigido a mao se voce mexeu na etiqueta.
    if (drafts[item.id] !== undefined) return drafts[item.id];
    return item.price != null ? item.price.toFixed(2).replace('.', ',') : '';
  }

  async function commitPrice(item: TripItem) {
    const raw = drafts[item.id];
    if (raw === undefined) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    const parsed = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    if (parsed !== null && !Number.isFinite(parsed)) return;
    if (parsed === item.unitPrice) return;
    // Digitar exatamente o preco da lista nao e correcao: nao vale uma escrita.
    if (!item.corrected && parsed !== null && parsed === item.expected) return;
    await update(item, { unitPrice: parsed });
  }

  async function finish() {
    if (!trip) return;
    setBusy(true);
    try {
      const data = await api.post<FinishResult>(`/trips/${trip.id}/finish`);
      setTrip(null);
      await Promise.all([refreshGeneral(), refreshLists()]);
      // Mostra o resultado antes de sair: pegamos tudo, ou o que sobrou e
      // para onde foi.
      setResult(data);
      setSheet(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para fechar o carrinho');
    } finally {
      setBusy(false);
    }
  }

  async function addList(list: ListSummary) {
    if (!trip) return;
    setError('');
    try {
      const { trip: updated } = await api.post<{ trip: TripType }>(`/trips/${trip.id}/add-list`, { listId: list.id });
      setTrip(updated);
      await refreshLists();
      setSheet(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para adicionar a lista');
    }
  }

  if (result) {
    const { complete, leftover, trip: fechado } = result;
    return (
      <>
        <Topbar
          title={complete ? 'Pegamos tudo' : 'Faltou coisa'}
          subtitle={`${fechado.marketLabel ? `${fechado.marketLabel} · ` : ''}${money(fechado.spent)}`}
        />
        <Page className="max-w-3xl">
          <Card className="items-center gap-0 p-6 text-center">
            <span className="text-[44px] leading-none" aria-hidden="true">
              {complete ? '🎉' : '🔁'}
            </span>
            <h3 className="mt-2.5 text-base font-bold">
              {complete
                ? `Tudo no carrinho — ${money(fechado.spent)}`
                : `${fechado.progress.picked} de ${fechado.progress.total} itens`}
            </h3>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {complete ? (
                'Nada ficou para trás.'
              ) : (
                <>
                  Os {fechado.progress.missing} que faltaram viraram a lista <strong>{leftover?.name}</strong> — pronta
                  para outro mercado ou outro dia.
                </>
              )}
            </p>
          </Card>

          <div className="mt-4 flex flex-col gap-2">
            {leftover && (
              <Button size="lg" onClick={() => navigate(`/listas/${leftover.id}`)}>
                Abrir “{leftover.name}”
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/historico')}>
              Ver compras anteriores
            </Button>
            <Button variant="ghost" onClick={() => navigate('/lista')}>
              Voltar para a lista
            </Button>
          </div>
        </Page>
      </>
    );
  }

  if (!trip) {
    return (
      <>
        <Topbar title="Carrinho" subtitle="nenhum carrinho em andamento" />
        <Page className="max-w-3xl">
          <EmptyState icon={<ShoppingCart />} title="Carrinho vazio">
            <p>Ao chegar no mercado, abra a lista e toque em “Montar carrinho” para escolher o que levar.</p>
            <Button className="mt-4" onClick={() => navigate('/lista')}>
              Ir para a lista
            </Button>
          </EmptyState>
        </Page>
      </>
    );
  }

  const { progress } = trip;

  return (
    <>
      <Topbar
        title={trip.marketLabel || 'Compra'}
        subtitle={`${progress.picked} de ${progress.total} pegos · ${trip.lists.map((l) => l.name).join(' + ') || trip.listName}`}
      >
        <Button size="sm" onClick={() => setSheet('finish')}>
          Fechar
        </Button>
      </Topbar>

      <Page className="max-w-3xl">
        <Card className="gap-0 p-4">
          <div className="bg-muted mb-3 h-2 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-success/10 rounded-xl px-3.5 py-2.5">
              <p className="text-success/80 text-[11px] font-bold tracking-wider uppercase">Gasto</p>
              <p className="text-success text-xl font-extrabold tabular-nums">{money(trip.spent)}</p>
            </div>
            <div className="bg-muted/60 rounded-xl px-3.5 py-2.5">
              <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">Falta pegar</p>
              <p className="text-xl font-extrabold tabular-nums">{money(trip.remainingEstimate)}</p>
            </div>
          </div>

          {progress.complete ? (
            <Banner tom="ok" icon={<PartyPopper />} className="mt-3">
              <strong>Pegamos tudo!</strong> Total de {money(trip.spent)}. Toque em “Fechar” para encerrar a compra.
            </Banner>
          ) : (
            <Banner icon={<ClipboardList />} className="mt-3">
              Ainda faltam <strong>{progress.missing}</strong> {progress.missing === 1 ? 'item' : 'itens'}
              {groups.length > 1 ? ` em ${groups.length} seções` : ''}.
            </Banner>
          )}

          {pendingWrites > 0 && (
            <Banner tom="warn" icon={<Signal />} className="mt-2.5">
              {pendingWrites} {pendingWrites === 1 ? 'marcação salva' : 'marcações salvas'} só neste aparelho
              {online ? ' — enviando…' : ' — sobem quando o sinal voltar'}.
            </Banner>
          )}

          {progress.notHere > 0 && (
            <Banner tom="warn" icon={<Search />} className="mt-2.5">
              {progress.notHere === 1
                ? '1 item que falta este mercado não tem'
                : `${progress.notHere} itens que faltam este mercado não tem`}
              . Toque em <strong>parecido</strong> para trocar por algo que existe aqui — ou deixe sem marcar, que no
              fecho volta como lista.
            </Banner>
          )}

          {progress.withoutPrice > 0 && (
            <p className="text-muted-foreground/80 mt-2.5 text-xs">
              {progress.withoutPrice} {progress.withoutPrice === 1 ? 'item foi escrito' : 'itens foram escritos'} à mão
              e não{progress.withoutPrice === 1 ? ' entra' : ' entram'} na soma.
            </p>
          )}
        </Card>

        {error && (
          <Banner tom="danger" icon={<TriangleAlert />} className="mt-3">
            {error}
          </Banner>
        )}

        {groups.map((group) => (
          <div key={group.key}>
            <SectionTitle action={<span className="text-muted-foreground text-sm">{group.items.length}</span>}>
              {group.emoji} {group.label}
            </SectionTitle>
            <Card className="overflow-hidden py-0">
              {group.items.map((item) => (
                <Row key={item.id}>
                  {/* O alvo de toque grande e de proposito: marcar itens e o que
                      se faz de pe, com uma mao, empurrando o carrinho. */}
                  <button
                    type="button"
                    aria-label={`Marcar ${item.name} como pego`}
                    onClick={() => {
                      setFocusPrice(item.id);
                      void update(item, { picked: true });
                    }}
                    className="text-muted-foreground/40 hover:border-primary hover:text-primary grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors"
                  >
                    <Check className="size-4" />
                  </button>
                  <Thumb src={item.imageUrl} category={item.category} alt={item.name} />
                  <RowBody>
                    <RowName>{item.name}</RowName>
                    <RowMeta>
                      <span>{quantity(item.qty, item.unit)}</span>
                      {item.expected != null && (
                        <span className="text-muted-foreground/70 tabular-nums">{money(item.expected)}</span>
                      )}
                      {item.availableHere === false && <Badge variant="secondary">não tem aqui</Badge>}
                      {item.market && item.market !== trip.market && (
                        <Badge
                          style={{
                            background: markets.find((m) => m.key === item.market)?.color,
                            color: '#fff',
                            borderColor: 'transparent',
                          }}
                        >
                          é do {markets.find((m) => m.key === item.market)?.label}
                        </Badge>
                      )}
                      {item.swappedFrom && (
                        <span className="text-muted-foreground/70 truncate">no lugar de {item.swappedFrom}</span>
                      )}
                    </RowMeta>
                  </RowBody>
                  {trip.market && item.availableHere === false && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={busy}
                      onClick={() => void verParecidos(item)}
                    >
                      <Search />
                      parecido
                    </Button>
                  )}
                </Row>
              ))}
            </Card>
          </div>
        ))}

        {picked.length > 0 && (
          <>
            <SectionTitle action={<span className="text-sm font-bold tabular-nums">{money(trip.spent)}</span>}>
              ✅ No carrinho
            </SectionTitle>
            <p className="text-muted-foreground/80 mb-2 px-1 text-xs">
              O preço já vem da lista. Só mexa no campo se a etiqueta estiver diferente.
            </p>
            <Card className="overflow-hidden py-0">
              {picked.map((item) => (
                <Row key={item.id} className="bg-success/5">
                  <button
                    type="button"
                    aria-label={`Desmarcar ${item.name}`}
                    onClick={() => void update(item, { picked: false })}
                    className="bg-success text-success-foreground grid size-8 shrink-0 place-items-center rounded-full"
                  >
                    <Check className="size-4" />
                  </button>
                  <RowBody>
                    <RowName className="text-muted-foreground line-through">{item.name}</RowName>
                    <RowMeta>
                      <span>{quantity(item.qty, item.unit)}</span>
                      {item.subtotal != null && (
                        <strong className="text-foreground tabular-nums">{money(item.subtotal)}</strong>
                      )}
                      {item.corrected && <Badge variant="success">preço corrigido</Badge>}
                      {item.pickedBy && <span style={{ color: item.pickedBy.color }}>{item.pickedBy.name}</span>}
                    </RowMeta>
                  </RowBody>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-muted-foreground/70 text-xs">R$</span>
                    <Input
                      className="h-9 w-20 px-2 text-right tabular-nums"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={priceValue(item)}
                      autoFocus={focusPrice === item.id}
                      onFocus={() => setFocusPrice(item.id)}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      onBlur={() => void commitPrice(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      aria-label={`Preço de ${item.name}`}
                    />
                  </div>
                </Row>
              ))}
            </Card>
          </>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button variant="outline" onClick={() => setSheet('add')}>
            <Plus />
            Lembrei de outra coisa
          </Button>
          {lists.some((l) => l.itemCount > 0 && !trip.lists.some((s) => s.id === l.id)) && (
            <Button variant="outline" onClick={() => setSheet('addList')}>
              <ClipboardList />
              Trazer outra lista para o carrinho
            </Button>
          )}
        </div>
      </Page>

      {sheet === 'add' && (
        <Sheet title="Adicionar na compra" subtitle="Entra direto nesta ida ao mercado." onClose={() => setSheet(null)}>
          <Field label="Item">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Pilha AA, guardanapo…"
              autoFocus
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              disabled={!newItem.trim()}
              onClick={async () => {
                const { trip: updated } = await api.post<{ trip: TripType }>(`/trips/${trip.id}/items`, { name: newItem.trim() });
                setTrip(updated);
                setNewItem('');
                setSheet(null);
              }}
            >
              Adicionar
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              Escolher no Mercado
            </Button>
          </div>
        </Sheet>
      )}

      {sheet === 'addList' && (
        <Sheet
          title="Trazer outra lista"
          subtitle="Os itens entram neste carrinho. Repetido soma a quantidade."
          onClose={() => setSheet(null)}
        >
          <div className="flex flex-col gap-2">
            {lists
              .filter((l) => l.itemCount > 0 && !trip.lists.some((s) => s.id === l.id))
              .map((l) => (
                <Button key={l.id} variant="outline" size="lg" className="justify-start" onClick={() => void addList(l)}>
                  <span aria-hidden="true">{l.emoji}</span>
                  <span className="flex-1 truncate text-left">{l.name}</span>
                  <span className="text-muted-foreground text-sm">{l.itemCount}</span>
                </Button>
              ))}
          </div>
        </Sheet>
      )}

      {parecidos && (
        <Sheet
          title={`Parecidos no ${parecidos.marketLabel}`}
          subtitle={`no lugar de ${parecidos.item.name}`}
          onClose={() => setParecidos(null)}
        >
          {!parecidos.options.length ? (
            <p className="text-muted-foreground text-sm">
              Este mercado não tem nada parecido no catálogo. Deixe o item sem marcar: no fecho ele volta como lista
              para outro dia.
            </p>
          ) : (
            <Card className="overflow-hidden py-0">
              {parecidos.options.map(({ product, priceHere }) => (
                <Row key={product.id} onClick={() => void trocarPor(parecidos.item, product.id)}>
                  <Thumb src={product.imageUrl} category={product.category} alt={product.name} />
                  <RowBody>
                    <RowName>{product.name}</RowName>
                    <RowMeta>
                      {product.brand && <span>{product.brand}</span>}
                      {product.sizeLabel && <Badge variant="secondary">{product.sizeLabel}</Badge>}
                    </RowMeta>
                  </RowBody>
                  <strong className="shrink-0 text-[15px] font-bold tabular-nums">{money(priceHere)}</strong>
                </Row>
              ))}
            </Card>
          )}
          <p className="text-muted-foreground mt-2.5 text-xs">
            A quantidade continua a mesma. O item trocado fica marcado como “no lugar de {parecidos.item.name}”.
          </p>
        </Sheet>
      )}

      {sheet === 'finish' && (
        <Sheet
          title="Fechar o carrinho"
          subtitle={
            progress.missing === 0
              ? `Tudo pego, ${money(trip.spent)} no total.`
              : `${progress.picked} pegos (${money(trip.spent)}). Os ${progress.missing} que faltaram viram uma lista nova, para outro mercado ou outro dia.`
          }
          onClose={() => setSheet(null)}
        >
          <div className="flex flex-col gap-2">
            <Button size="lg" disabled={busy} onClick={() => void finish()}>
              {progress.missing === 0 ? 'Fechar' : 'Fechar e guardar o que faltou'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setSheet(null)}>
              Continuar comprando
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={async () => {
                await api.post(`/trips/${trip.id}/cancel`);
                setTrip(null);
                setSheet(null);
                navigate('/lista');
              }}
            >
              Descartar este carrinho
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
