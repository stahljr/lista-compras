import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Page, Row, RowBody, RowMeta, RowName, Topbar } from '@/components/Layout';
import type { TripSummary } from '@/lib/types';

export default function History() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripSummary[] | null>(null);

  useEffect(() => {
    void api.get<{ trips: TripSummary[] }>('/trips?limit=40').then((d) => setTrips(d.trips));
  }, []);

  const total = (trips || []).reduce((acc, t) => acc + t.spent, 0);

  return (
    <>
      <Topbar
        title="Compras anteriores"
        subtitle={trips ? `${trips.length} ${trips.length === 1 ? 'ida' : 'idas'} · ${money(total)} no total` : 'carregando…'}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Voltar">
          <ArrowLeft />
        </Button>
      </Topbar>

      <Page className="max-w-3xl">
        {trips && !trips.length && (
          <EmptyState icon={<Receipt />} title="Nenhuma compra fechada ainda">
            Quando você encerrar a primeira ida ao mercado, ela aparece aqui com o total gasto.
          </EmptyState>
        )}

        {trips && trips.length > 0 && (
          <Card className="overflow-hidden py-0">
            {trips.map((trip) => (
              <Row key={trip.id}>
                <span className="text-muted-foreground grid size-11 shrink-0 place-items-center rounded-xl border bg-neutral-50">
                  {trip.status === 'canceled' ? <Ban className="size-5" /> : <Receipt className="size-5" />}
                </span>
                <RowBody>
                  <RowName>{trip.marketLabel || trip.listName}</RowName>
                  <RowMeta>
                    <span>{dateTime(trip.finishedAt || trip.startedAt)}</span>
                    <span className="text-muted-foreground/70">
                      {trip.pickedItems} de {trip.totalItems} itens
                    </span>
                    {trip.status === 'canceled' && <Badge variant="destructive">descartada</Badge>}
                  </RowMeta>
                </RowBody>
                <strong className="shrink-0 text-[15px] font-bold tabular-nums">{money(trip.spent)}</strong>
              </Row>
            ))}
          </Card>
        )}
      </Page>
    </>
  );
}
