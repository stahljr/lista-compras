import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ClipboardList, Plus, ShoppingCart, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { relativeDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Banner, EmptyState, Field, Page, Row, RowBody, RowMeta, RowName, Topbar } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import type { ListSummary, Trip } from '@/lib/types';

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
      <Topbar title="Listas" subtitle={trip ? 'toque para trazer ao carrinho' : 'prontas para virar carrinho'}>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus />
          Nova
        </Button>
      </Topbar>

      <Page className="max-w-3xl">
        {toast && (
          <Banner tom="ok" icon={<Check />} className="mb-3">
            {toast}
          </Banner>
        )}
        {error && (
          <Banner tom="danger" icon={<TriangleAlert />} className="mb-3">
            {error}
          </Banner>
        )}

        {!lists.length ? (
          <EmptyState icon={<ClipboardList />} title="Nenhuma lista salva">
            <p>
              Crie listas que você repete sempre — limpeza, churrasco, feira da semana — e leve ao carrinho com um
              toque. As que sobrarem de uma compra também aparecem aqui.
            </p>
            <Button className="mt-4" onClick={() => setCreating(true)}>
              <Plus />
              Criar a primeira
            </Button>
          </EmptyState>
        ) : (
          <Card className="overflow-hidden py-0">
            {lists.map((list) => (
              <Row key={list.id} className="gap-0 p-0">
                <button
                  type="button"
                  onClick={() => navigate(`/listas/${list.id}`)}
                  aria-label={`Abrir ${list.name}`}
                  className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border bg-neutral-50 text-lg">
                    {list.emoji}
                  </span>
                  <RowBody>
                    <RowName>{list.name}</RowName>
                    <RowMeta>
                      <span>
                        {list.itemCount} {list.itemCount === 1 ? 'item' : 'itens'}
                      </span>
                      {list.reusable ? (
                        <span className="text-muted-foreground/70">editada {relativeDate(list.updatedAt)}</span>
                      ) : (
                        <Badge variant="secondary">uso único</Badge>
                      )}
                    </RowMeta>
                  </RowBody>
                </button>
                <Button
                  size="sm"
                  className="mr-3 shrink-0"
                  disabled={list.itemCount === 0}
                  onClick={() => void toCart(list)}
                  aria-label={`Levar ${list.name} ao carrinho`}
                >
                  <ShoppingCart />
                  {trip ? 'Juntar' : 'Levar'}
                </Button>
              </Row>
            ))}
          </Card>
        )}
      </Page>

      {creating && (
        <Sheet
          title="Nova lista"
          subtitle="Um conjunto de itens que você usa de novo e de novo."
          onClose={() => setCreating(false)}
        >
          <Field label="Nome">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Limpeza, churrasco, farmácia…"
              autoFocus
            />
          </Field>
          <Field label="Ícone">
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    'grid size-10 place-items-center rounded-xl border text-lg transition-colors',
                    emoji === e ? 'border-primary bg-primary/10 ring-primary/30 ring-2' : 'hover:bg-muted',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
          <Button size="lg" className="w-full" disabled={!name.trim()} onClick={() => void create()}>
            Criar lista
          </Button>
        </Sheet>
      )}
    </>
  );
}
