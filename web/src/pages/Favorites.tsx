import { useCallback, useEffect, useState } from 'react';
import { Heart, ShoppingBasket } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { quantity } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Banner, EmptyState, Page, SectionTitle, Topbar } from '@/components/Layout';
import { ProductCard } from '@/components/ProductCard';
import { ProductDialog } from '@/components/ProductDialog';
import { Filtros as BarraDeFiltros, SEM_FILTRO, temFiltro, type Facetas, type Filtros } from '@/components/Filtros';
import type { Product, ShoppingList } from '@/lib/types';

/**
 * O que a casa compra sempre.
 *
 * A prateleira de favoritos ja aparecia no alto do Mercado, mas ali ela e uma
 * lembranca de passagem: cabem poucos, e quem entra no app para repor o de
 * sempre tinha de passar pelo corredor inteiro. Aqui eles tem endereco
 * proprio, com filtro de mercado -- que e a pergunta que se faz na porta da
 * loja: "do que eu sempre compro, o que tem aqui?".
 */
export default function Favorites() {
  const { setGeneral, trip, refreshTrip, notify, favoritos } = useStore();
  const [produtos, setProdutos] = useState<Product[] | null>(null);
  const [facetas, setFacetas] = useState<Facetas>({});
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTRO);
  const [aberto, setAberto] = useState<Product | null>(null);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [erro, setErro] = useState('');

  const destino = trip && trip.status === 'active' ? 'carrinho' : 'lista';

  const carregar = useCallback(async (f: Filtros) => {
    const busca = new URLSearchParams({ limit: '60' });
    for (const [chave, valor] of Object.entries(f)) if (valor) busca.set(chave, String(valor));
    const d = await api.get<{ products: Product[]; facets: Facetas }>(`/catalog/favorites?${busca}`);
    setProdutos(d.products);
    setFacetas(d.facets ?? {});
  }, []);

  useEffect(() => {
    void carregar(filtros).catch(() => setProdutos([]));
  }, [carregar, filtros]);

  // Desfavoritar tira o produto da tela na hora: ele nao pertence mais aqui, e
  // deixa-lo ate a proxima carga faria o coracao parecer sem efeito.
  useEffect(() => {
    setProdutos((atual) => (atual ? atual.filter((p) => favoritos.includes(p.id)) : atual));
  }, [favoritos]);

  async function add(product: Product, qty = 1, unit?: string, market?: string | null) {
    setErro('');
    const corpo = { productId: product.id, qty, ...(unit ? { unit } : {}), ...(market ? { market } : {}) };
    try {
      if (trip && trip.status === 'active') {
        await api.post(`/trips/${trip.id}/items`, corpo);
        await refreshTrip();
      } else {
        const { list } = await api.post<{ list: ShoppingList }>('/lists/geral/items', corpo);
        setGeneral(list);
      }
      setAdded((p) => ({ ...p, [product.id]: true }));
      window.setTimeout(() => setAdded((p) => ({ ...p, [product.id]: false })), 1400);
      const medida = quantity(qty, unit || product.unit);
      notify(`${medida === '1' ? '' : `${medida} `}${product.name} ${destino === 'carrinho' ? 'no carrinho' : 'na lista'}`, {
        texto: 'Ver',
        href: destino === 'carrinho' ? '/carrinho' : '/lista',
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para adicionar');
    }
  }

  /** Manda tudo o que esta na tela para a lista, de uma vez. */
  async function adicionarTodos() {
    if (!produtos?.length) return;
    setErro('');
    try {
      for (const p of produtos) {
        const corpo = { productId: p.id, qty: 1 };
        if (trip && trip.status === 'active') await api.post(`/trips/${trip.id}/items`, corpo);
        else {
          const { list } = await api.post<{ list: ShoppingList }>('/lists/geral/items', corpo);
          setGeneral(list);
        }
      }
      if (trip && trip.status === 'active') await refreshTrip();
      notify(`${produtos.length} ${produtos.length === 1 ? 'item' : 'itens'} ${destino === 'carrinho' ? 'no carrinho' : 'na lista'}`, {
        texto: 'Ver',
        href: destino === 'carrinho' ? '/carrinho' : '/lista',
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para adicionar tudo');
    }
  }

  const grade = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
  const quantos = produtos?.length ?? 0;

  return (
    <>
      <Topbar
        title="Favoritos"
        subtitle={
          produtos === null
            ? 'carregando…'
            : destino === 'carrinho'
              ? 'adicionando no carrinho em andamento'
              : `${quantos} ${quantos === 1 ? 'produto' : 'produtos'} que vocês compram sempre`
        }
      >
        {quantos > 0 && (
          <Button variant="outline" size="sm" onClick={() => void adicionarTodos()}>
            <ShoppingBasket />
            Levar tudo
          </Button>
        )}
      </Topbar>

      <Page>
        {erro && <Banner tom="danger">{erro}</Banner>}

        {produtos !== null && (
          <BarraDeFiltros
            facetas={facetas}
            filtros={filtros}
            total={quantos}
            dimensoes={['category', 'brand', 'size', 'market']}
            onChange={setFiltros}
          />
        )}

        {produtos !== null && !quantos && (
          <EmptyState icon={<Heart />} title={temFiltro(filtros) ? 'Nenhum favorito com esses filtros' : 'Nenhum favorito ainda'}>
            {temFiltro(filtros)
              ? 'Solte um filtro, ou toque em Limpar.'
              : 'No Mercado, toque no coração de um produto. Ele fica aqui para a casa toda — e para a próxima lista.'}
          </EmptyState>
        )}

        {quantos > 0 && (
          <>
            <SectionTitle>{temFiltro(filtros) ? 'Com esses filtros' : 'De sempre'}</SectionTitle>
            <div className={grade}>
              {produtos!.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  added={added[p.id]}
                  onAdd={(q, u) => void add(p, q, u)}
                  onOpen={() => setAberto(p)}
                />
              ))}
            </div>
          </>
        )}
      </Page>

      <ProductDialog
        product={aberto}
        open={!!aberto}
        onOpenChange={(v) => !v && setAberto(null)}
        onAdd={(prod, q, u, m) => void add(prod, q, u, m)}
      />
    </>
  );
}
