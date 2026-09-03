import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Coins, Plus, ShoppingCart, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Banner, EmptyState, Page, SectionTitle, Topbar } from '@/components/Layout';
import { ListItemRow } from '@/components/ListItemRow';
import { Sheet } from '@/components/Sheet';
import type { ShoppingList, Trip } from '@/lib/types';

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
      <Page className="max-w-3xl">
        {error ? (
          <Banner tom="danger" icon={<TriangleAlert />}>
            {error}
          </Banner>
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
      </Page>
    );
  }

  return (
    <>
      <Topbar
        title={`${list.emoji} ${list.name}`}
        subtitle={`${list.items.length} ${list.items.length === 1 ? 'item' : 'itens'}`}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate('/listas')} aria-label="Voltar">
          <ArrowLeft />
        </Button>
      </Topbar>

      <Page className="max-w-3xl">
        <form
          className="mb-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = quick.trim();
            if (!name) return;
            setQuick('');
            await act(api.post<{ list: ShoppingList }>(`/lists/${list.id}/items`, { name }));
          }}
        >
          <Input placeholder="Adicionar item…" value={quick} onChange={(e) => setQuick(e.target.value)} />
          <Button type="submit" disabled={!quick.trim()}>
            <Plus />
            Add
          </Button>
        </form>

        {error && (
          <Banner tom="danger" icon={<TriangleAlert />} className="mb-3">
            {error}
          </Banner>
        )}

        {!list.items.length ? (
          <EmptyState icon={<span className="text-4xl">{list.emoji}</span>} title="Lista vazia">
            Escreva os itens acima, ou busque produtos no catálogo, monte a lista geral e salve-a como lista rápida.
          </EmptyState>
        ) : (
          grouped.map((group) => (
            <div key={group.key}>
              <SectionTitle action={<span className="text-muted-foreground text-sm">{group.items.length}</span>}>
                {group.emoji} {group.label}
              </SectionTitle>
              <Card className="overflow-hidden py-0">
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
              </Card>
            </div>
          ))
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button
            size="lg"
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
            <ShoppingCart />
            {trip ? 'Trazer para o carrinho' : 'Montar carrinho com esta lista'}
          </Button>
          <Button variant="outline" disabled={!list.items.length} onClick={() => navigate(`/comparar/${list.id}`)}>
            <Coins />
            Comparar preços desta lista
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
            Apagar lista
          </Button>
        </div>
      </Page>

      {confirmDelete && (
        <Sheet
          title={`Apagar “${list.name}”?`}
          subtitle="A lista e seus itens somem. A lista geral não é afetada."
          onClose={() => setConfirmDelete(false)}
        >
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              variant="destructive"
              onClick={async () => {
                await api.del(`/lists/${list.id}`);
                await refreshLists();
                navigate('/listas');
              }}
            >
              Sim, apagar
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
