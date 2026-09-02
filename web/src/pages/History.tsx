import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { dateTime, money } from '../lib/format';
import type { TripSummary } from '../lib/types';

export default function History() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);

  useEffect(() => {
    void api.get<{ trips: TripSummary[] }>('/trips?limit=40').then((d) => setTrips(d.trips));
  }, []);

  const total = (trips || []).reduce((acc, t) => acc + t.spent, 0);

  return (
    <>
      <header className="topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} aria-label="Voltar">
          ←
        </button>
        <div className="grow">
          <h1>Compras anteriores</h1>
          <p className="sub">{trips ? `${trips.length} idas · ${money(total)} no total` : 'carregando…'}</p>
        </div>
      </header>

      <main className="page">
        {trips && !trips.length && (
          <div className="empty">
            <div className="ico">🧾</div>
            <h3>Nenhuma compra fechada ainda</h3>
            <p>Quando você encerrar a primeira ida ao mercado, ela aparece aqui com o total gasto.</p>
          </div>
        )}

        {trips && trips.length > 0 && (
          <div className="card">
            {trips.map((trip) => (
              <div className="item" key={trip.id}>
                <div className="thumb thumb-fallback">{trip.status === 'canceled' ? '🚫' : '🧾'}</div>
                <div className="body">
                  <div className="name">{trip.marketLabel || trip.listName}</div>
                  <div className="meta">
                    <span>{dateTime(trip.finishedAt || trip.startedAt)}</span>
                    <span className="faint">
                      {trip.pickedItems} de {trip.totalItems} itens
                    </span>
                    {trip.status === 'canceled' && <span className="badge danger">descartada</span>}
                  </div>
                </div>
                <strong className="money nowrap">{money(trip.spent)}</strong>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
