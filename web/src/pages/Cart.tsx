import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { money } from '../lib/format';
import { ListItemRow } from '../components/ListItemRow';
import { Sheet } from '../components/Sheet';
import type { ListItem, ShoppingList, Trip } from '../lib/types';

export default function Cart() {
  const { cart, setCart, categories, markets, trip, setTrip, refreshLists } = useStore();
  const navigate = useNavigate();
  const [quick, setQuick] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'market' | 'save' | 'clear' | null>(null);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    for (const item of cart?.items || []) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: categories.find((c) => c.key === key)?.label || 'Outros',
      emoji: categories.find((c) => c.key === key)?.emoji || '📦',
      items,
    }));
  }, [cart, categories]);

  async function act<T extends { list: ShoppingList }>(promise: Promise<T>) {
    setError('');
    try {
      const data = await promise;
      setCart(data.list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para salvar');
    }
  }

  async function addQuick(event: React.FormEvent) {
    event.preventDefault();
    const name = quick.trim();
    if (!name) return;
    setQuick('');
    await act(api.post<{ list: ShoppingList }>('/lists/cart/items', { name }));
  }

  async function startTrip(market: string | null) {
    setBusy(true);
    setError('');
    try {
      const { trip: started } = await api.post<{ trip: Trip }>('/trips', { market });
      setTrip(started);
      setSheet(null);
      navigate('/compra');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para iniciar a compra');
    } finally {
      setBusy(false);
    }
  }

  const count = cart?.items.length ?? 0;

  return (
    <>
      <header className="topbar">
        <div className="grow">
          <h1>Carrinho</h1>
          <p className="sub">{count === 0 ? 'vazio por enquanto' : `${count} ${count === 1 ? 'item' : 'itens'}`}</p>
        </div>
        {count > 0 && (
          <button className="btn btn-sm" onClick={() => setSheet('save')}>
            Salvar
          </button>
        )}
      </header>

      <main className="page">
        <form className="searchbar" onSubmit={addQuick} style={{ marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Escrever um item…"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            enterKeyHint="done"
          />
          <button className="btn btn-primary" disabled={!quick.trim()}>
            Add
          </button>
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
              <span style={{ fontSize: 22 }}>🛍️</span>
              <div className="grow">
                <strong>Compra em andamento</strong>
                <div className="small muted">
                  {trip.marketLabel ? `${trip.marketLabel} · ` : ''}
                  {trip.progress.picked} de {trip.progress.total} itens · {money(trip.spent)}
                </div>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => navigate('/compra')}>
                Continuar
              </button>
            </div>
          </div>
        )}

        {count === 0 ? (
          <div className="empty">
            <div className="ico">🛒</div>
            <h3>O carrinho está vazio</h3>
            <p>Escreva um item acima, busque nos mercados ou use uma lista pronta.</p>
            <div className="btn-row" style={{ marginTop: 16, maxWidth: 320, marginInline: 'auto' }}>
              <button className="btn" onClick={() => navigate('/buscar')}>
                🔍 Buscar
              </button>
              <button className="btn" onClick={() => navigate('/listas')}>
                📋 Listas
              </button>
            </div>
          </div>
        ) : (
          <>
            {grouped.map((group) => (
              <div key={group.key}>
                <div className="section-title">
                  <span>
                    {group.emoji} {group.label}
                  </span>
                  <span className="count right">{group.items.length}</span>
                </div>
                <div className="card">
                  {group.items.map((item) => (
                    <ListItemRow
                      key={item.id}
                      item={item}
                      onQty={(qty) => act(api.patch<{ list: ShoppingList }>(`/lists/cart/items/${item.id}`, { qty }))}
                      onRemove={() => act(api.del<{ list: ShoppingList }>(`/lists/cart/items/${item.id}`))}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="stack" style={{ marginTop: 22 }}>
              <button className="btn btn-primary btn-block btn-lg" onClick={() => setSheet('market')} disabled={!!trip}>
                📍 Cheguei no mercado
              </button>
              <button className="btn btn-block" onClick={() => navigate('/comparar')}>
                💰 Onde vale mais a pena?
              </button>
              <button className="btn btn-danger btn-block btn-sm" onClick={() => setSheet('clear')}>
                Limpar o carrinho
              </button>
            </div>
          </>
        )}
      </main>

      {sheet === 'market' && (
        <Sheet
          title="Em qual mercado você está?"
          subtitle="Isso define o preço esperado de cada item. Dá para começar sem escolher também."
          onClose={() => setSheet(null)}
        >
          <div className="stack">
            {markets.map((m) => (
              <button
                key={m.key}
                className="btn btn-block btn-lg"
                style={{ borderColor: m.color, color: m.color, justifyContent: 'flex-start' }}
                disabled={busy}
                onClick={() => startTrip(m.key)}
              >
                <span style={{ width: 10, height: 10, borderRadius: 5, background: m.color }} />
                {m.label}
              </button>
            ))}
            <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => startTrip(null)}>
              Outro lugar / não sei ainda
            </button>
          </div>
        </Sheet>
      )}

      {sheet === 'save' && (
        <Sheet
          title="Salvar como lista"
          subtitle="Fica guardada para você jogar no carrinho de novo quando quiser."
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
              await api.post('/lists/cart/save-as', { name: saveName.trim() });
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
        <Sheet title="Limpar o carrinho?" subtitle={`Os ${count} itens saem da lista. Isso não apaga suas listas salvas.`} onClose={() => setSheet(null)}>
          <div className="stack">
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={async () => {
                await act(api.post<{ list: ShoppingList }>('/lists/cart/clear'));
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
