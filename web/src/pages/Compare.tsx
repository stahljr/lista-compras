import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { money, quantity } from '../lib/format';
import type { Comparison, Trip } from '../lib/types';

export default function Compare() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const { setTrip } = useStore();
  const [data, setData] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const target = listId || 'geral';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.get<Comparison>(`/lists/${target}/compare`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para comparar');
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startAt(market: string) {
    const { trip } = await api.post<{ trip: Trip }>('/trips', {
      market,
      listIds: listId ? [Number(listId)] : undefined,
    });
    setTrip(trip);
    navigate('/carrinho');
  }

  const best = data?.best;
  const split = data?.split;

  return (
    <>
      <header className="topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} aria-label="Voltar">
          ←
        </button>
        <div className="grow">
          <h1>Onde comprar</h1>
          <p className="sub">{data ? `${data.priced.length} de ${data.itemCount} itens com preço` : 'consultando os mercados…'}</p>
        </div>
        <button className="btn btn-sm" onClick={() => void load()} disabled={loading}>
          {loading ? '…' : '↻'}
        </button>
      </header>

      <main className="page">
        {loading && !data && (
          <div className="center">
            <div className="stack" style={{ alignItems: 'center' }}>
              <div className="spinner" />
              <span className="small muted">buscando preço em Angeloni, Festval, Muffato e Condor…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="banner danger">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {data && !data.priced.length && (
          <div className="empty">
            <div className="ico">💰</div>
            <h3>Nenhum item com preço</h3>
            <p>Itens escritos à mão não têm preço. Busque os produtos no catálogo para poder comparar.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/buscar')}>
              Buscar produtos
            </button>
          </div>
        )}

        {data && data.priced.length > 0 && (
          <>
            {best && (
              <div className="card card-pad">
                <div className="small muted" style={{ fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {best.complete ? 'Melhor mercado para fazer tudo' : 'Mercado que cobre mais itens'}
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 750, color: best.color }}>{best.label}</span>
                  <span className="right money" style={{ fontSize: 22, fontWeight: 700 }}>
                    {money(best.total)}
                  </span>
                </div>
                {!best.complete && (
                  <div className="small muted" style={{ marginTop: 4 }}>
                    faltam {best.missingCount}: {best.missing.slice(0, 3).join(', ')}
                    {best.missing.length > 3 ? '…' : ''}
                  </div>
                )}
                <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => void startAt(best.key)}>
                  📍 Comprar no {best.label}
                </button>
              </div>
            )}

            {split && data.worthSplitting && (
              <>
                <div className="section-title">💡 Vale dividir em dois</div>
                <div className="card card-pad">
                  <div className="row">
                    <div className="grow">
                      <strong>{split.markets.map((m) => m.label).join(' + ')}</strong>
                      <div className="small muted">
                        economiza {money(split.savings)} ({split.savingsPct}%) nos mesmos itens que você levaria
                        {split.comparedTo ? ` só do ${split.comparedTo.label}` : ''}
                      </div>
                    </div>
                    <span className="money" style={{ fontSize: 19, fontWeight: 700 }}>
                      {money(split.total)}
                    </span>
                  </div>

                  {split.extraItems.length > 0 && (
                    <div className="small faint" style={{ marginTop: 6 }}>
                      Do total, {money(split.extraCost)} são {split.extraItems.length}{' '}
                      {split.extraItems.length === 1 ? 'item que não existe' : 'itens que não existem'} no{' '}
                      {split.comparedTo?.label}.
                    </div>
                  )}

                  {split.markets.map((m) => (
                    <div key={m.key} style={{ marginTop: 14 }}>
                      <div className="row" style={{ marginBottom: 6 }}>
                        <span className="badge market" style={{ background: m.color }}>
                          {m.label}
                        </span>
                        <span className="right small money" style={{ fontWeight: 700 }}>
                          {money(m.total)}
                        </span>
                      </div>
                      {m.items.map((item) => (
                        <div className="row small" key={item.id} style={{ padding: '3px 0' }}>
                          <span className="grow" style={{ minWidth: 0 }}>
                            {item.name}
                            {item.qty !== 1 && <span className="faint"> ×{quantity(item.qty)}</span>}
                          </span>
                          <span className="money muted">{money(item.subtotal)}</span>
                        </div>
                      ))}
                      <button className="btn btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => void startAt(m.key)}>
                        Começar pelo {m.label}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Uma segunda parada que nao economiza ainda pode ser a unica forma de
                levar tudo. Isso e informacao, nao recomendacao -- por isso separado. */}
            {split && !data.worthSplitting && split.extraItems.length > 0 && best && (
              <>
                <div className="section-title">🧩 Para levar tudo</div>
                <div className="card card-pad">
                  <div className="small">
                    {split.extraItems.length === 1 ? 'Este item não existe' : 'Estes itens não existem'} no {best.label}:
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {split.extraItems.map((item) => (
                      <div className="row small" key={item.name} style={{ padding: '3px 0' }}>
                        <span className="grow" style={{ minWidth: 0 }}>
                          {item.name}
                        </span>
                        <span className="badge">{item.market}</span>
                        <span className="money muted">{money(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="small muted" style={{ marginTop: 10 }}>
                    Passar também no {split.markets.find((m) => m.key !== best.key)?.label} custa{' '}
                    {money(split.total - best.total)} a mais no total ({money(split.total)}) — a diferença é quase toda o preço
                    {split.extraItems.length === 1 ? ' desse item' : ' desses itens'}, não economia perdida.
                  </div>
                </div>
              </>
            )}

            <div className="section-title">Custo em cada mercado</div>
            <div className="card">
              {data.markets.map((m) => (
                <div className="item" key={m.key}>
                  <span style={{ width: 8, height: 34, borderRadius: 4, background: m.color, flex: 'none' }} />
                  <div className="body">
                    <div className="name">{m.label}</div>
                    <div className="meta">
                      {m.complete ? (
                        <span className="badge ok">tem tudo</span>
                      ) : (
                        <span className="badge warn">faltam {m.missingCount}</span>
                      )}
                      <span className="faint">{m.covered} itens</span>
                    </div>
                  </div>
                  <strong className="money nowrap">{money(m.total)}</strong>
                </div>
              ))}
            </div>

            {data.unpriced.length > 0 && (
              <>
                <div className="section-title">
                  Sem preço <span className="count right">{data.unpriced.length}</span>
                </div>
                <div className="card">
                  {data.unpriced.map((item) => (
                    <div className="item" key={item.id}>
                      <div className="body">
                        <div className="name">{item.name}</div>
                        <div className="meta">
                          {item.lastPaid != null ? (
                            <span>última vez: {money(item.lastPaid)}</span>
                          ) : (
                            <span className="faint">escrito à mão, sem produto vinculado</span>
                          )}
                        </div>
                      </div>
                      <span className="badge">{quantity(item.qty, item.unit)}</span>
                    </div>
                  ))}
                </div>
                <p className="small faint" style={{ margin: '10px 4px 0' }}>
                  Estes itens não entram na conta. Busque-os no catálogo para incluir no comparativo.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
