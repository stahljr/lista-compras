import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Coins, Lightbulb, MapPin, Puzzle, RefreshCw, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { money, quantity } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Banner, EmptyState, Page, Row, RowBody, RowMeta, RowName, SectionTitle, Topbar } from '@/components/Layout';
import type { Comparison, Trip } from '@/lib/types';

/** Rotulo pequeno em caixa alta, do jeito dos outros cartoes do app. */
function Etiqueta({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">{children}</p>;
}

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
      <Topbar
        title="Onde comprar"
        subtitle={data ? `${data.priced.length} de ${data.itemCount} itens com preço` : 'consultando os mercados…'}
      >
        <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} aria-label="Consultar de novo">
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
        </Button>
      </Topbar>

      <Page className="max-w-3xl">
        {loading && !data && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Buscando preço em Angeloni, Festval, Muffato e Condor…
            </p>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && (
          <Banner tom="danger" icon={<TriangleAlert />} className="mb-3">
            {error}
          </Banner>
        )}

        {data && !data.priced.length && !loading && (
          <EmptyState icon={<Coins />} title="Nenhum item com preço">
            <p>Itens escritos à mão não têm preço. Busque os produtos no catálogo para poder comparar.</p>
            <Button className="mt-4" onClick={() => navigate('/')}>
              Buscar produtos
            </Button>
          </EmptyState>
        )}

        {data && data.priced.length > 0 && (
          <>
            {best && (
              <Card className="gap-0 p-4">
                <Etiqueta>{best.complete ? 'Melhor mercado para fazer tudo' : 'Mercado que cobre mais itens'}</Etiqueta>
                <div className="mt-1.5 flex items-baseline gap-3">
                  <span className="text-[26px] leading-none font-extrabold tracking-tight" style={{ color: best.color }}>
                    {best.label}
                  </span>
                  <span className="ml-auto text-[22px] font-bold tabular-nums">{money(best.total)}</span>
                </div>
                {!best.complete && (
                  <p className="text-muted-foreground mt-1.5 text-sm">
                    faltam {best.missingCount}: {best.missing.slice(0, 3).join(', ')}
                    {best.missing.length > 3 ? '…' : ''}
                  </p>
                )}
                <Button className="mt-3.5 w-full" onClick={() => void startAt(best.key)}>
                  <MapPin />
                  Comprar no {best.label}
                </Button>
              </Card>
            )}

            {split && data.worthSplitting && (
              <>
                <SectionTitle>
                  <Lightbulb className="mr-1 inline size-5 align-[-3px]" />
                  Vale dividir em dois
                </SectionTitle>
                <Card className="gap-0 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <strong className="text-[15px]">{split.markets.map((m) => m.label).join(' + ')}</strong>
                      <p className="text-muted-foreground text-sm">
                        economiza {money(split.savings)} ({split.savingsPct}%) nos mesmos itens que você levaria
                        {split.comparedTo ? ` só do ${split.comparedTo.label}` : ''}
                      </p>
                    </div>
                    <span className="text-[19px] font-bold tabular-nums">{money(split.total)}</span>
                  </div>

                  {split.extraItems.length > 0 && (
                    <p className="text-muted-foreground/80 mt-1.5 text-xs">
                      Do total, {money(split.extraCost)} são {split.extraItems.length}{' '}
                      {split.extraItems.length === 1 ? 'item que não existe' : 'itens que não existem'} no{' '}
                      {split.comparedTo?.label}.
                    </p>
                  )}

                  {split.markets.map((m) => (
                    <div key={m.key} className="mt-4">
                      <div className="mb-1.5 flex items-center gap-2">
                        <Badge style={{ background: m.color, color: '#fff', borderColor: 'transparent' }}>
                          {m.label}
                        </Badge>
                        <span className="ml-auto text-sm font-bold tabular-nums">{money(m.total)}</span>
                      </div>
                      {m.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 py-0.5 text-sm">
                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
                            {item.qty !== 1 && (
                              <span className="text-muted-foreground/70"> ×{quantity(item.qty)}</span>
                            )}
                          </span>
                          <span className="text-muted-foreground tabular-nums">{money(item.subtotal)}</span>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void startAt(m.key)}>
                        Começar pelo {m.label}
                      </Button>
                    </div>
                  ))}
                </Card>
              </>
            )}

            {/* Uma segunda parada que nao economiza ainda pode ser a unica forma de
                levar tudo. Isso e informacao, nao recomendacao -- por isso separado. */}
            {split && !data.worthSplitting && split.extraItems.length > 0 && best && (
              <>
                <SectionTitle>
                  <Puzzle className="mr-1 inline size-5 align-[-3px]" />
                  Para levar tudo
                </SectionTitle>
                <Card className="gap-0 p-4">
                  <p className="text-sm">
                    {split.extraItems.length === 1 ? 'Este item não existe' : 'Estes itens não existem'} no {best.label}:
                  </p>
                  <div className="mt-2">
                    {split.extraItems.map((item) => (
                      <div key={item.name} className="flex items-center gap-2 py-0.5 text-sm">
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        <Badge variant="secondary">{item.market}</Badge>
                        <span className="text-muted-foreground tabular-nums">{money(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-muted-foreground mt-2.5 text-sm">
                    Passar também no {split.markets.find((m) => m.key !== best.key)?.label} custa{' '}
                    {money(split.total - best.total)} a mais no total ({money(split.total)}) — a diferença é quase toda
                    o preço{split.extraItems.length === 1 ? ' desse item' : ' desses itens'}, não economia perdida.
                  </p>
                </Card>
              </>
            )}

            <SectionTitle>Custo em cada mercado</SectionTitle>
            <Card className="overflow-hidden py-0">
              {data.markets.map((m) => (
                <Row key={m.key}>
                  <span className="h-8 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
                  <RowBody>
                    <RowName>{m.label}</RowName>
                    <RowMeta>
                      {m.complete ? (
                        <Badge variant="success">tem tudo</Badge>
                      ) : (
                        <Badge variant="secondary">faltam {m.missingCount}</Badge>
                      )}
                      <span className="text-muted-foreground/70">{m.covered} itens</span>
                    </RowMeta>
                  </RowBody>
                  <strong className="shrink-0 text-[15px] font-bold tabular-nums">{money(m.total)}</strong>
                </Row>
              ))}
            </Card>

            {data.unpriced.length > 0 && (
              <>
                <SectionTitle action={<span className="text-muted-foreground text-sm">{data.unpriced.length}</span>}>
                  Sem preço
                </SectionTitle>
                <Card className="overflow-hidden py-0">
                  {data.unpriced.map((item) => (
                    <Row key={item.id}>
                      <RowBody>
                        <RowName>{item.name}</RowName>
                        <RowMeta>
                          {item.lastPaid != null ? (
                            <span>última vez: {money(item.lastPaid)}</span>
                          ) : (
                            <span className="text-muted-foreground/70">escrito à mão, sem produto vinculado</span>
                          )}
                        </RowMeta>
                      </RowBody>
                      <Badge variant="secondary" className="shrink-0">
                        {quantity(item.qty, item.unit)}
                      </Badge>
                    </Row>
                  ))}
                </Card>
                <p className="text-muted-foreground mt-2.5 px-1 text-xs">
                  Estes itens não entram na conta. Busque-os no catálogo para incluir no comparativo.
                </p>
              </>
            )}
          </>
        )}
      </Page>
    </>
  );
}
