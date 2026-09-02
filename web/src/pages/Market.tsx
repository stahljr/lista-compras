import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { Shelf } from '../components/Shelf';
import type { Product, ShoppingList } from '../lib/types';

type Shelf = { key: string; label: string; emoji: string; total: number; products: Product[] };

/** Foto para ilustrar o corredor: a do primeiro produto que tiver uma. */
function capaDo(shelf: Shelf) {
  return shelf.products.find((p) => p.imageUrl)?.imageUrl || null;
}

/** Capa do corredor, com shimmer enquanto a foto nao chega. */
function CorredorCapa({ src, emoji }: { src: string | null; emoji: string }) {
  const [carregada, setCarregada] = useState(false);
  const [quebrada, setQuebrada] = useState(false);
  if (!src || quebrada) {
    return (
      <span className="capa">
        <span className="ico" aria-hidden="true">
          {emoji}
        </span>
      </span>
    );
  }
  return (
    <span className="capa">
      {!carregada && <span className="skeleton" aria-hidden="true" />}
      <img
        className={carregada ? 'carregada' : undefined}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setCarregada(true)}
        onError={() => setQuebrada(true)}
      />
    </span>
  );
}
type SearchResponse = { products: Product[]; failed: { market: string; error: string }[] };

/**
 * A tela inicial: o mercado. Sem busca, mostra as prateleiras por categoria --
 * limpeza, higiene, bazar -- para dar para escolher olhando, como numa loja.
 * Com busca, os quatro mercados de uma vez.
 */
export default function Market() {
  const { setGeneral, general, trip, refreshTrip, notify } = useStore();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [carregandoShelves, setCarregandoShelves] = useState(true);
  const [results, setResults] = useState<Product[]>([]);
  const [failed, setFailed] = useState<{ market: string; error: string }[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');
  const debounce = useRef<number | undefined>(undefined);

  const buscando = term.trim().length >= 2;
  const naLista = general?.items.length ?? 0;
  const destino = trip && trip.status === 'active' ? 'carrinho' : 'lista';

  useEffect(() => {
    void api
      .get<{ shelves: Shelf[] }>('/catalog/shelves?perCategory=12')
      .then((d) => setShelves(d.shelves))
      .catch(() => {})
      .finally(() => setCarregandoShelves(false));
  }, []);

  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults([]);
      setFailed([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.get<SearchResponse>(`/catalog/search?q=${encodeURIComponent(query)}&limit=40`);
      setResults(data.products);
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

  async function openCategory(key: string) {
    setCategory(key);
    setTerm('');
    setCategoryProducts([]);
    setLoading(true);
    try {
      // O servidor enche o corredor buscando nos mercados quando ele ainda
      // esta vazio, entao esta chamada pode levar alguns segundos.
      const d = await api.get<{ products: Product[] }>(`/catalog/categories/${key}?limit=60`);
      setCategoryProducts(d.products);
      // O que veio pode ter mudado as contagens dos corredores.
      void api
        .get<{ shelves: Shelf[] }>('/catalog/shelves?perCategory=12')
        .then((r) => setShelves(r.shelves))
        .catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  /** Com carrinho aberto o item vai direto pra ele; fora disso, para a lista. */
  async function add(product: Product, qty = 1) {
    setError('');
    try {
      if (trip && trip.status === 'active') {
        await api.post(`/trips/${trip.id}/items`, { productId: product.id, qty });
        await refreshTrip();
      } else {
        const { list } = await api.post<{ list: ShoppingList }>('/lists/geral/items', { productId: product.id, qty });
        setGeneral(list);
      }
      setAdded((p) => ({ ...p, [product.id]: true }));
      window.setTimeout(() => setAdded((p) => ({ ...p, [product.id]: false })), 1400);
      const onde = destino === 'carrinho' ? 'no carrinho' : 'na lista';
      notify(`${qty > 1 ? `${qty}× ` : ''}${product.name} ${onde}`, {
        texto: 'Ver',
        href: destino === 'carrinho' ? '/carrinho' : '/lista',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para adicionar');
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="grow">
          <h1>Mercado</h1>
          <p className="sub">
            {destino === 'carrinho' ? 'adicionando no carrinho em andamento' : 'preço nos quatro mercados'}
          </p>
        </div>
        {naLista > 0 && destino === 'lista' && (
          <button className="btn btn-sm" onClick={() => navigate('/lista')}>
            📝 {naLista}
          </button>
        )}
      </header>

      <main className="page">
        <div className="searchbar busca-mercado" style={{ marginBottom: 12 }}>
          <span className="lupa" aria-hidden="true">
            🔍
          </span>
          <input
            className="input"
            placeholder="Buscar produto: arroz, detergente, café…"
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

        {shelves.length > 0 && !buscando && (
          <>
            <div className="section-title">Corredores</div>
            <div className="corredores" style={{ marginBottom: 4 }}>
              {shelves.map((c) => (
                <button
                  key={c.key}
                  className={`corredor${category === c.key ? ' on' : ''}`}
                  onClick={() => {
                    if (category === c.key) {
                      setCategory(null);
                      setCategoryProducts([]);
                    } else void openCategory(c.key);
                  }}
                >
                  {/* A capa do corredor e a foto de um produto que esta nele
                      -- nao ha arte propria, e um produto real ilustra bem. */}
                  <CorredorCapa src={capaDo(c)} emoji={c.emoji} />
                  <span className="nome">{c.label}</span>
                </button>
              ))}
            </div>
          </>
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
            <span>Não deu para consultar {failed.map((f) => f.market).join(', ')} agora. Os outros estão aí.</span>
          </div>
        )}

        {/* busca */}
        {buscando && (
          <>
            <div className="section-title">
              <span>Resultados</span>
              <span className="count right">{results.length}</span>
            </div>
            {results.length === 0 && !loading ? (
              <div className="empty">
                <div className="ico">🔍</div>
                <h3>Nada encontrado</h3>
                <p>Tente escrever de outro jeito, ou anote à mão na lista.</p>
              </div>
            ) : (
              <div className="produtos">
                {results.map((p) => (
                  <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(qty) => void add(p, qty)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* categoria aberta */}
        {!buscando && category && (
          <>
            <div className="section-title">
              <span>{shelves.find((c) => c.key === category)?.label}</span>
              <span className="count right">{categoryProducts.length}</span>
            </div>
            {loading && !categoryProducts.length ? (
              <div className="empty">
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                <h3>Enchendo a prateleira</h3>
                <p>Buscando este corredor nos quatro mercados — leva alguns segundos na primeira vez.</p>
              </div>
            ) : (
              <div className="produtos">
                {categoryProducts.map((p) => (
                  <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(qty) => void add(p, qty)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* prateleiras */}
        {!buscando && !category && (
          <>
            {carregandoShelves && shelves.length === 0 ? (
              <>
                {['a', 'b'].map((k) => (
                  <div key={k}>
                    <div className="section-title">
                      <span className="linha-falsa skeleton" style={{ width: 150, height: 18, display: 'block' }} />
                    </div>
                    <div className="prateleira">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <ProductCardSkeleton key={i} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : shelves.length === 0 ? (
              <div className="empty">
                <div className="ico">🏪</div>
                <h3>Catálogo vazio</h3>
                <p>
                  Busque um produto acima para o app trazer dos mercados — ou rode <code>npm run seed</code> no servidor
                  para já começar com as prateleiras cheias.
                </p>
              </div>
            ) : (
              shelves.filter((s) => s.products.length).map((shelf) => (
                <div key={shelf.key}>
                  <div className="section-title">
                    <span>{shelf.label}</span>
                    <button className="btn btn-ghost btn-sm right" onClick={() => void openCategory(shelf.key)}>
                      ver {shelf.total} →
                    </button>
                  </div>
                  <Shelf>
                    {shelf.products.map((p) => (
                      <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(qty) => void add(p, qty)} />
                    ))}
                  </Shelf>
                </div>
              ))
            )}
          </>
        )}
      </main>
    </>
  );
}
