import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { relativeDate } from '../lib/format';
import type { ListSummary, Trip } from '../lib/types';
import { Sheet } from '../components/Sheet';

const EMOJIS = ['📝', '🧽', '🥩', '🎉', '🍕', '🧴', '🍼', '🐾', '🎂', '🏠', '☕', '🧊'];

export default function Lists() {
  const { lists, refreshLists, trip, setTrip } = useStore();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📝');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  async function create() {
    setError('');
    try {
      await api.post('/lists', { name: name.trim(), emoji });
      await refreshLists();
      setName('');
      setEmoji('📝');
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para criar');
    }
  }

  /**
   * Com carrinho aberto, a lista entra nele. Sem carrinho, ela monta um --
   * que e o caminho de "cheguei no mercado e vou levar so esta lista".
   */
  async function toCart(list: ListSummary) {
    setError('');
    try {
      if (trip) {
        const { added } = await api.post<{ added: number }>(`/trips/${trip.id}/add-list`, { listId: list.id });
        await refreshLists();
        setToast(`${list.name}: ${added} ${added === 1 ? 'item' : 'itens'} no carrinho`);
        window.setTimeout(() => setToast(''), 2600);
        return;
      }
      const { trip: started } = await api.post<{ trip: Trip }>('/trips', { listIds: [list.id] });
      setTrip(started);
      await refreshLists();
      navigate('/carrinho');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para levar ao carrinho');
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="grow">
          <h1>Listas</h1>
          <p className="sub">{trip ? 'toque para trazer ao carrinho' : 'prontas para virar carrinho'}</p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
          Nova
        </button>
      </header>

      <main className="page">
        {toast && (
          <div className="banner ok">
            <span>✅</span>
            <span>{toast}</span>
          </div>
        )}
        {error && (
          <div className="banner danger">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {!lists.length ? (
          <div className="empty">
            <div className="ico">📋</div>
            <h3>Nenhuma lista salva</h3>
            <p>
              Crie listas que você repete sempre — limpeza, churrasco, feira da semana — e leve ao carrinho com um toque. As
              que sobrarem de uma compra também aparecem aqui.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setCreating(true)}>
              Criar a primeira
            </button>
          </div>
        ) : (
          <div className="card">
            {lists.map((list) => (
              <div className="item" key={list.id}>
                <button
                  className="thumb thumb-fallback"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/listas/${list.id}`)}
                  aria-label={`Abrir ${list.name}`}
                >
                  {list.emoji}
                </button>
                <div className="body" onClick={() => navigate(`/listas/${list.id}`)} style={{ cursor: 'pointer' }}>
                  <div className="name">{list.name}</div>
                  <div className="meta">
                    <span>
                      {list.itemCount} {list.itemCount === 1 ? 'item' : 'itens'}
                    </span>
                    {list.reusable ? (
                      <span className="faint">editada {relativeDate(list.updatedAt)}</span>
                    ) : (
                      <span className="badge warn">uso único</span>
                    )}
                  </div>
                </div>
                <button className="btn btn-sm btn-primary" disabled={list.itemCount === 0} onClick={() => void toCart(list)}>
                  → 🛒
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {creating && (
        <Sheet title="Nova lista" subtitle="Um conjunto de itens que você usa de novo e de novo." onClose={() => setCreating(false)}>
          <label className="field">
            <span>Nome</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Limpeza, churrasco, farmácia…"
              autoFocus
            />
          </label>
          <label className="field">
            <span>Ícone</span>
            <div className="chips">
              {EMOJIS.map((e) => (
                <button key={e} className={`chip${emoji === e ? ' on' : ''}`} onClick={() => setEmoji(e)} style={{ fontSize: 18 }}>
                  {e}
                </button>
              ))}
            </div>
          </label>
          <button className="btn btn-primary btn-block btn-lg" disabled={!name.trim()} onClick={() => void create()}>
            Criar lista
          </button>
        </Sheet>
      )}
    </>
  );
}
