import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { money } from '../lib/format';
import { Thumb } from '../components/Thumb';
import { PriceTags } from '../components/PriceTags';
import type { Product, ShoppingList } from '../lib/types';

type SearchResponse = { products: Product[]; failed: { market: string; error: string }[] };

/** Quanto se ganha comprando no mercado mais barato em vez do mais caro. */
function savingsOf(product: Product) {
  const prices = product.offers.filter((o) => o.available && o.price > 0).map((o) => o.price);
  if (prices.length < 2) return 0;
  return Math.round((Math.max(...prices) - Math.min(...prices)) * 100) / 100;
}

export default function Search() {
  const { setGeneral, categories, trip, refreshTrip } = useStore();
  const [term, setTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [failed, setFailed] = useState<{ market: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');
  const debounce = useRef<number | undefined>(undefined);

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setProducts([]);
      setFailed([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.get<SearchResponse>(`/catalog/search?q=${encodeURIComponent(query)}&limit=30`);
      setProducts(data.products);
      setFailed(data.failed || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'a busca falhou');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void runSearch(term), 450);
    return () => window.clearTimeout(debounce.current);
  }, [term, runSearch]);

  async function browseCategory(key: string) {
    setCategory(key);
    setTerm('');
    setLoading(true);
    try {
      const data = await api.get<{ products: Product[] }>(`/catalog/categories/${key}?limit=60`);
      setProducts(data.products);
      setFailed([]);
    } finally {
      setLoading(false);
    }
  }

  /** Com carrinho aberto, o item vai direto pra ele; fora disso, para a lista. */
  async function add(product: Product) {
    setError('');
    try {
      if (trip && trip.status === 'active') {
        await api.post(`/trips/${trip.id}/items`, { productId: product.id, qty: 1 });
        await refreshTrip();
      } else {
        const { list } = await api.post<{ list: ShoppingList }>('/lists/geral/items', { productId: product.id, qty: 1 });
        setGeneral(list);
      }
      setAdded((prev) => ({ ...prev, [product.id]: true }));
      window.setTimeout(() => setAdded((prev) => ({ ...prev, [product.id]: false })), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para adicionar');
    }
  }

  const withCategories = categories.filter((c) => c.total > 0);

  return (
    <>
      <header className="topbar">
        <div className="grow">
          <h1>Buscar</h1>
          <p className="sub">
            {trip && trip.status === 'active' ? 'adiciona no carrinho em andamento' : 'preço nos quatro mercados'}
          </p>
        </div>
      </header>

      <main className="page">
        <div className="searchbar" style={{ marginBottom: 10 }}>
          <input
            className="input"
            placeholder="Arroz, detergente, café…"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setCategory(null);
            }}
            enterKeyHint="search"
            autoComplete="off"
          />
          {loading && <div className="spinner" />}
        </div>

        {withCategories.length > 0 && (
          <div className="chips">
            {withCategories.map((c) => (
              <button
                key={c.key}
                className={`chip${category === c.key ? ' on' : ''}`}
                onClick={() => (category === c.key ? (setCategory(null), setProducts([])) : void browseCategory(c.key))}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="banner danger">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {failed.length > 0 && (
          <div className="banner warn">
            <span>⚠️</span>
            <span>
              Não deu para consultar {failed.map((f) => f.market).join(', ')} agora. Os outros mercados estão aí embaixo.
            </span>
          </div>
        )}

        {!loading && !products.length && (
          <div className="empty">
            <div className="ico">🔍</div>
            <h3>{term.trim().length >= 2 ? 'Nada encontrado' : 'O que você precisa?'}</h3>
            <p>
              {term.trim().length >= 2
                ? 'Tente escrever de outro jeito, ou adicione o item à mão no carrinho.'
                : 'Busque pelo nome do produto — a gente traz o preço de cada mercado.'}
            </p>
          </div>
        )}

        {products.map((product) => (
          <div className="card card-pad" key={product.id} style={{ marginBottom: 10 }}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Thumb src={product.imageUrl} category={product.category} alt={product.name} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="name" style={{ fontWeight: 600 }}>
                  {product.name}
                </div>
                <div className="meta small muted" style={{ marginTop: 2 }}>
                  {product.brand && <span>{product.brand}</span>}
                  {savingsOf(product) > 0 && <span className="badge ok">economize {money(savingsOf(product))}</span>}
                </div>
                <PriceTags offers={product.offers} />
              </div>
              <button
                className={`btn btn-sm ${added[product.id] ? '' : 'btn-primary'}`}
                onClick={() => void add(product)}
                aria-label={`Adicionar ${product.name}`}
              >
                {added[product.id] ? '✓' : '+'}
              </button>
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
