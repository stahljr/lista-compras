import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, semRede } from '../lib/api';
import { enfileirar } from '../lib/offline';
import { aplicarPatch } from '../lib/tripLocal';
import { useStore } from '../lib/store';
import { money, quantity } from '../lib/format';
import { Thumb } from '../components/Thumb';
import { Sheet } from '../components/Sheet';
import type { FinishResult, ListSummary, Trip as TripType, TripItem } from '../lib/types';

/**
 * O carrinho: a lista de conferencia do mercado. Montado de uma ou mais
 * listas, aqui so se marca o que foi pego -- e, se a etiqueta estiver
 * diferente, corrige o preco.
 */
export default function Cart() {
  const { trip, setTrip, refreshGeneral, refreshLists, lists, categories, user, online, pendingWrites, notePendingWrite } = useStore();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'finish' | 'add' | 'addList' | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [focusPrice, setFocusPrice] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [newItem, setNewItem] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
        <header className="topbar">
          <div className="grow">
            <h1>{complete ? 'Pegamos tudo' : 'Faltou coisa'}</h1>
            <p className="sub">
              {fechado.marketLabel ? `${fechado.marketLabel} · ` : ''}
              {money(fechado.spent)}
            </p>
          </div>
        </header>
        <main className="page">
          <div className="card card-pad">
            <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
              <div style={{ fontSize: 44 }}>{complete ? '🎉' : '🔁'}</div>
              <h3 style={{ margin: '10px 0 6px' }}>
                {complete
                  ? `Tudo no carrinho — ${money(fechado.spent)}`
                  : `${fechado.progress.picked} de ${fechado.progress.total} itens`}
              </h3>
              {complete ? (
                <p className="muted" style={{ margin: 0 }}>
                  Nada ficou para trás.
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Os {fechado.progress.missing} que faltaram viraram a lista{' '}
                  <strong>{leftover?.name}</strong> — pronta para outro mercado ou outro dia.
                </p>
              )}
            </div>
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            {leftover && (
              <button className="btn btn-primary btn-block btn-lg" onClick={() => navigate(`/listas/${leftover.id}`)}>
                Abrir “{leftover.name}”
              </button>
            )}
            <button className="btn btn-block" onClick={() => navigate('/historico')}>
              Ver compras anteriores
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => navigate('/')}>
              Voltar para a lista
            </button>
          </div>
        </main>
      </>
    );
  }

  if (!trip) {
    return (
      <>
        <header className="topbar">
          <div className="grow">
            <h1>Carrinho</h1>
            <p className="sub">nenhum carrinho em andamento</p>
          </div>
        </header>
        <main className="page">
          <div className="empty">
            <div className="ico">🛒</div>
            <h3>Carrinho vazio</h3>
            <p>Ao chegar no mercado, abra a lista e toque em “Montar carrinho” para escolher o que levar.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
              Ir para a lista
            </button>
          </div>
        </main>
      </>
    );
  }

  const { progress } = trip;

  return (
    <>
      <header className="topbar">
        <div className="grow">
          <h1>{trip.marketLabel || 'Compra'}</h1>
          <p className="sub">
            {progress.picked} de {progress.total} pegos · {trip.lists.map((l) => l.name).join(' + ') || trip.listName}
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setSheet('finish')}>
          Fechar
        </button>
      </header>

      <main className="page">
        <div className="card card-pad">
          <div className="progress" style={{ marginBottom: 12 }}>
            <div style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="stat-row">
            <div className="stat spent">
              <div className="label">Gasto</div>
              <div className="value">{money(trip.spent)}</div>
            </div>
            <div className="stat">
              <div className="label">Falta pegar</div>
              <div className="value">{money(trip.remainingEstimate)}</div>
            </div>
          </div>

          {progress.complete ? (
            <div className="banner ok" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>🎉</span>
              <span>
                <strong>Pegamos tudo!</strong> Total de {money(trip.spent)}. Toque em “Encerrar” para fechar a compra.
              </span>
            </div>
          ) : (
            <div className="banner info" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>📝</span>
              <span>
                Ainda faltam <strong>{progress.missing}</strong> {progress.missing === 1 ? 'item' : 'itens'}
                {groups.length > 1 ? ` em ${groups.length} seções` : ''}.
              </span>
            </div>
          )}

          {pendingWrites > 0 && (
            <div className="banner warn" style={{ marginTop: 10, marginBottom: 0 }}>
              <span>📶</span>
              <span>
                {pendingWrites} {pendingWrites === 1 ? 'marcação salva' : 'marcações salvas'} só neste aparelho
                {online ? ' — enviando…' : ' — sobem quando o sinal voltar'}.
              </span>
            </div>
          )}

          {progress.withoutPrice > 0 && (
            <div className="small faint" style={{ marginTop: 10 }}>
              {progress.withoutPrice} {progress.withoutPrice === 1 ? 'item foi escrito' : 'itens foram escritos'} à mão e não
              {progress.withoutPrice === 1 ? ' entra' : ' entram'} na soma.
            </div>
          )}
        </div>

        {error && (
          <div className="banner danger" style={{ marginTop: 12 }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.key}>
            <div className="section-title">
              <span>
                {group.emoji} {group.label}
              </span>
              <span className="count right">{group.items.length}</span>
            </div>
            <div className="card">
              {group.items.map((item) => (
                <div className="item" key={item.id}>
                  <button
                    className="check"
                    aria-label={`Marcar ${item.name} como pego`}
                    onClick={() => {
                      setFocusPrice(item.id);
                      void update(item, { picked: true });
                    }}
                  >
                    ✓
                  </button>
                  <Thumb src={item.imageUrl} category={item.category} alt={item.name} />
                  <div className="body">
                    <div className="name">{item.name}</div>
                    <div className="meta">
                      <span>{quantity(item.qty, item.unit)}</span>
                      {item.expected != null && <span className="faint">{money(item.expected)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {picked.length > 0 && (
          <>
            <div className="section-title">
              <span>✅ No carrinho</span>
              <span className="count right">{money(trip.spent)}</span>
            </div>
            <p className="small faint" style={{ margin: '0 4px 8px' }}>
              O preço já vem da lista. Só mexa no campo se a etiqueta estiver diferente.
            </p>
            <div className="card">
              {picked.map((item) => (
                <div className="item done" key={item.id}>
                  <button className="check on" aria-label={`Desmarcar ${item.name}`} onClick={() => void update(item, { picked: false })}>
                    ✓
                  </button>
                  <div className="body">
                    <div className="name">{item.name}</div>
                    <div className="meta">
                      <span>{quantity(item.qty, item.unit)}</span>
                      {item.subtotal != null && <strong className="money">{money(item.subtotal)}</strong>}
                      {item.corrected && <span className="badge ok">preço corrigido</span>}
                      {item.pickedBy && <span style={{ color: item.pickedBy.color }}>{item.pickedBy.name}</span>}
                    </div>
                  </div>
                  <div className="row" style={{ flex: 'none', gap: 4 }}>
                    <span className="small faint">R$</span>
                    <input
                      className="input"
                      style={{ width: 76, padding: '7px 9px', textAlign: 'right' }}
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
                </div>
              ))}
            </div>
          </>
        )}

        <div className="stack" style={{ marginTop: 20 }}>
          <button className="btn btn-block" onClick={() => setSheet('add')}>
            ➕ Lembrei de outra coisa
          </button>
          {lists.some((l) => l.itemCount > 0 && !trip.lists.some((s) => s.id === l.id)) && (
            <button className="btn btn-block" onClick={() => setSheet('addList')}>
              📋 Trazer outra lista para o carrinho
            </button>
          )}
        </div>
      </main>

      {sheet === 'add' && (
        <Sheet title="Adicionar na compra" subtitle="Entra direto nesta ida ao mercado." onClose={() => setSheet(null)}>
          <label className="field">
            <span>Item</span>
            <input
              className="input"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Pilha AA, guardanapo…"
              autoFocus
            />
          </label>
          <div className="stack">
            <button
              className="btn btn-primary btn-block btn-lg"
              disabled={!newItem.trim()}
              onClick={async () => {
                const { trip: updated } = await api.post<{ trip: TripType }>(`/trips/${trip.id}/items`, { name: newItem.trim() });
                setTrip(updated);
                setNewItem('');
                setSheet(null);
              }}
            >
              Adicionar
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => navigate('/buscar')}>
              Buscar no catálogo em vez disso
            </button>
          </div>
        </Sheet>
      )}

      {sheet === 'addList' && (
        <Sheet
          title="Trazer outra lista"
          subtitle="Os itens entram neste carrinho. Repetido soma a quantidade."
          onClose={() => setSheet(null)}
        >
          <div className="stack">
            {lists
              .filter((l) => l.itemCount > 0 && !trip.lists.some((s) => s.id === l.id))
              .map((l) => (
                <button
                  key={l.id}
                  className="btn btn-block btn-lg"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => void addList(l)}
                >
                  <span>{l.emoji}</span>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    {l.name}
                  </span>
                  <span className="small">{l.itemCount}</span>
                </button>
              ))}
          </div>
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
          <div className="stack">
            <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => void finish()}>
              {progress.missing === 0 ? 'Fechar' : 'Fechar e guardar o que faltou'}
            </button>
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => setSheet(null)}>
              Continuar comprando
            </button>
            <button
              className="btn btn-danger btn-block btn-sm"
              disabled={busy}
              onClick={async () => {
                await api.post(`/trips/${trip.id}/cancel`);
                setTrip(null);
                setSheet(null);
                navigate('/');
              }}
            >
              Descartar este carrinho
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
