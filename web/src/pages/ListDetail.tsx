import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { ListItemRow } from '../components/ListItemRow';
import { Sheet } from '../components/Sheet';
import type { ShoppingList, Trip } from '../lib/types';

export default function ListDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { categories, refreshLists, trip, setTrip } = useStore();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [quick, setQuick] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ list: ShoppingList }>(`/lists/${id}`);
      setList(data.list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lista não encontrada');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof list>['items']>();
    for (const item of list?.items || []) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: categories.find((c) => c.key === key)?.label || 'Outros',
      emoji: categories.find((c) => c.key === key)?.emoji || '📦',
      items,
    }));
  }, [list, categories]);

  async function act(promise: Promise<{ list: ShoppingList }>) {
    setError('');
    try {
      setList((await promise).list);
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para salvar');
    }
  }

  if (!list) {
    return (
      <main className="page">
        {error ? (
          <div className="banner danger">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        ) : (
          <div className="center">
            <div className="spinner" />
          </div>
        )}
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/listas')} aria-label="Voltar">
          ←
        </button>
        <div className="grow">
          <h1>
            {list.emoji} {list.name}
          </h1>
          <p className="sub">
            {list.items.length} {list.items.length === 1 ? 'item' : 'itens'}
          </p>
        </div>
      </header>

      <main className="page">
        <form
          className="searchbar"
          style={{ marginBottom: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const name = quick.trim();
            if (!name) return;
            setQuick('');
            await act(api.post<{ list: ShoppingList }>(`/lists/${list.id}/items`, { name }));
          }}
        >
          <input className="input" placeholder="Adicionar item…" value={quick} onChange={(e) => setQuick(e.target.value)} />
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

        {!list.items.length ? (
          <div className="empty">
            <div className="ico">{list.emoji}</div>
            <h3>Lista vazia</h3>
            <p>Escreva os itens acima, ou busque produtos no catálogo, monte a lista geral e salve-a como lista rápida.</p>
          </div>
        ) : (
          grouped.map((group) => (
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
                    showWho={false}
                    onQty={(qty) => act(api.patch<{ list: ShoppingList }>(`/lists/${list.id}/items/${item.id}`, { qty }))}
                    onRemove={() => act(api.del<{ list: ShoppingList }>(`/lists/${list.id}/items/${item.id}`))}
                    onMarket={(market) =>
                      act(api.patch<{ list: ShoppingList }>(`/lists/${list.id}/items/${item.id}`, { market }))
                    }
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <div className="stack" style={{ marginTop: 20 }}>
          <button
            className="btn btn-primary btn-block btn-lg"
            disabled={!list.items.length}
            onClick={async () => {
              if (trip) {
                await api.post(`/trips/${trip.id}/add-list`, { listId: list.id });
              } else {
                const { trip: started } = await api.post<{ trip: Trip }>('/trips', { listIds: [list.id] });
                setTrip(started);
              }
              await refreshLists();
              navigate('/carrinho');
            }}
          >
            🛒 {trip ? 'Trazer para o carrinho' : 'Montar carrinho com esta lista'}
          </button>
          <button className="btn btn-block" disabled={!list.items.length} onClick={() => navigate(`/comparar/${list.id}`)}>
            💰 Comparar preços desta lista
          </button>
          <button className="btn btn-danger btn-block btn-sm" onClick={() => setConfirmDelete(true)}>
            Apagar lista
          </button>
        </div>
      </main>

      {confirmDelete && (
        <Sheet title={`Apagar “${list.name}”?`} subtitle="A lista e seus itens somem. A lista geral não é afetada." onClose={() => setConfirmDelete(false)}>
          <div className="stack">
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={async () => {
                await api.del(`/lists/${list.id}`);
                await refreshLists();
                navigate('/listas');
              }}
            >
              Sim, apagar
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
