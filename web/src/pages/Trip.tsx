import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, semRede } from '../lib/api';
import { enfileirar } from '../lib/offline';
import { aplicarPatch } from '../lib/tripLocal';
import { useStore } from '../lib/store';
import { money, quantity } from '../lib/format';
import { Thumb } from '../components/Thumb';
import { Sheet } from '../components/Sheet';
import type { Trip as TripType, TripItem } from '../lib/types';

export default function Trip() {
  const { trip, setTrip, refreshCart, refreshLists, categories, user, online, pendingWrites, notePendingWrite } = useStore();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'finish' | 'add' | null>(null);
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
    // Enquanto digita, mostra o que foi digitado; parado, mostra como dinheiro.
    if (drafts[item.id] !== undefined) return drafts[item.id];
    return item.unitPrice != null ? item.unitPrice.toFixed(2).replace('.', ',') : '';
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
    await update(item, { unitPrice: parsed });
  }

  async function finish(outcome: 'remove-picked' | 'clear' | 'keep') {
    if (!trip) return;
    setBusy(true);
    try {
      await api.post(`/trips/${trip.id}/finish`, { outcome });
      setTrip(null);
      await Promise.all([refreshCart(), refreshLists()]);
      setSheet(null);
      navigate('/historico');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para encerrar');
    } finally {
      setBusy(false);
    }
  }

  if (!trip) {
    return (
      <>
        <header className="topbar">
          <div className="grow">
            <h1>Compra</h1>
            <p className="sub">nenhuma compra em andamento</p>
          </div>
        </header>
        <main className="page">
          <div className="empty">
            <div className="ico">🛍️</div>
            <h3>Nada em andamento</h3>
            <p>Quando chegar no mercado, abra o carrinho e toque em “Cheguei no mercado”.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
              Ir para o carrinho
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
            {progress.picked} de {progress.total} itens · {trip.listName}
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setSheet('finish')}>
          Encerrar
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
              <div className="label">Falta (est.)</div>
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

          {progress.pickedWithoutPrice > 0 && (
            <div className="banner warn" style={{ marginTop: 10, marginBottom: 0 }}>
              <span>💰</span>
              <span>
                {progress.pickedWithoutPrice} {progress.pickedWithoutPrice === 1 ? 'item pego está' : 'itens pegos estão'} sem
                preço — o total fica incompleto.
              </span>
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
                      {item.expected != null && <span className="faint">~{money(item.expected)}</span>}
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
                      {item.subtotal != null ? (
                        <strong className="money">{money(item.subtotal)}</strong>
                      ) : (
                        <span className="badge warn">falta o preço{item.expected != null ? ` (~${money(item.expected)})` : ''}</span>
                      )}
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

      {sheet === 'finish' && (
        <Sheet
          title="Encerrar a compra"
          subtitle={
            progress.missing === 0
              ? `Tudo pego, ${money(trip.spent)} no total.`
              : `${progress.picked} pegos (${money(trip.spent)}) e ${progress.missing} ainda faltando. O que fazer com a lista?`
          }
          onClose={() => setSheet(null)}
        >
          <div className="stack">
            <button className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={() => void finish('remove-picked')}>
              Tirar o que comprei, deixar o resto
            </button>
            <button className="btn btn-block" disabled={busy} onClick={() => void finish('clear')}>
              Limpar a lista inteira
            </button>
            <button className="btn btn-block" disabled={busy} onClick={() => void finish('keep')}>
              Não mexer na lista
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
              Descartar esta compra
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
