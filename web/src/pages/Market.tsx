import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ClipboardList, Heart, PackageOpen, RefreshCw, Search, Store, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { quantity as fmtQty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, Page, SectionTitle, Topbar } from '@/components/Layout';
import { ProductCard, ProductCardSkeleton } from '@/components/ProductCard';
import { ProductDialog } from '@/components/ProductDialog';
import { Shelf } from '@/components/Shelf';
import { Hero } from '@/components/Hero';
import { Filtros as BarraDeFiltros, SEM_FILTRO, paraBusca, temFiltro } from '@/components/Filtros';
import type { Facetas, Filtros, Ordem } from '@/components/Filtros';
import type { Product, ShoppingList } from '@/lib/types';

type Corredor = {
  key: string;
  label: string;
  emoji: string;
  total: number;
  coverUrl: string | null;
  coverChosen: boolean;
  products: Product[];
};
type Busca = { products: Product[]; total: number; facets: Facetas; failed: { market: string; error: string }[] };
/** Estado do aquecimento do catalogo (o app enchendo as prateleiras). */
type Aquecimento = { rodando: boolean; total: number; feitos: number; produtos: number; corredor: string | null };

/** A foto do corredor vem escolhida do servidor, com recurso automatico. */
function capaDo(c: Corredor) {
  return c.coverUrl;
}

/** A placa do corredor: foto de um produto que esta nele, ou o emoji. */
function CorredorTile({ c, ativo, onClick }: { c: Corredor; ativo: boolean; onClick: () => void }) {
  const [carregada, setCarregada] = useState(false);
  const [quebrada, setQuebrada] = useState(false);
  const capa = capaDo(c);
  return (
    <button onClick={onClick} className="group flex snap-start flex-col items-center gap-1.5">
      <span
        className={cn(
          'relative grid size-[4.5rem] place-items-center overflow-hidden rounded-2xl border bg-neutral-50 shadow-sm transition-all md:size-[5.25rem]',
          ativo ? 'border-primary ring-primary/30 ring-2' : 'group-hover:border-primary/50',
        )}
      >
        {capa && !quebrada ? (
          <>
            {!carregada && <Skeleton className="absolute inset-0 rounded-none" />}
            <img
              src={capa}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setCarregada(true)}
              onError={() => setQuebrada(true)}
              className={cn('relative size-full object-contain p-1.5 transition-opacity duration-300', carregada ? 'opacity-100' : 'opacity-0')}
            />
          </>
        ) : (
          <span className="text-2xl" aria-hidden="true">
            {c.emoji}
          </span>
        )}
      </span>
      <span className="w-[4.5rem] text-center text-[11px] leading-tight font-semibold tracking-tight md:w-[5.25rem] md:text-xs">
        {c.label}
      </span>
    </button>
  );
}

/**
 * A tela inicial: o mercado. Sem busca, mostra os corredores e as prateleiras
 * por categoria -- da para escolher olhando, como numa loja. Com busca, os
 * quatro mercados de uma vez.
 */
export default function Market() {
  const { setGeneral, general, trip, refreshTrip, notify, favoritos, markets } = useStore();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [carregandoCorredores, setCarregandoCorredores] = useState(true);
  const [resultados, setResultados] = useState<Product[]>([]);
  const [falhas, setFalhas] = useState<{ market: string; error: string }[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [doCorredor, setDoCorredor] = useState<Product[]>([]);
  const [totalCorredor, setTotalCorredor] = useState(0);
  const [facetas, setFacetas] = useState<Facetas>({});
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTRO);
  /**
   * Em que mercados estou comprando. Fica fora de `filtros` e `filtrosBusca`
   * de proposito: "hoje eu vou no Angeloni" nao e um filtro de prateleira que
   * se troca ao abrir outro corredor -- vale para a tela toda, e por isso e
   * um estado so, que a faixa de cima mostra e as duas prateleiras herdam.
   */
  const [mercados, setMercados] = useState<string[]>([]);
  // A ordem e por prateleira: no corredor "menor preco" e uma escolha que
  // vale enquanto se olha aquele corredor; na busca, cada palavra recomeca.
  const [ordem, setOrdem] = useState<Ordem>(null);
  const [ordemBusca, setOrdemBusca] = useState<Ordem>(null);
  const [facetasBusca, setFacetasBusca] = useState<Facetas>({});
  const [filtrosBusca, setFiltrosBusca] = useState<Filtros>(SEM_FILTRO);
  const [totalBusca, setTotalBusca] = useState(0);
  const [aquecendo, setAquecendo] = useState<Aquecimento | null>(null);
  const [favoritados, setFavoritados] = useState<Product[]>([]);
  const [buscandoMais, setBuscandoMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [erro, setErro] = useState('');
  const [aberto2, setAberto2] = useState<Product | null>(null);
  const debounce = useRef<number | undefined>(undefined);

  // O mercado escolhido vale para as duas prateleiras, e por isso e costurado
  // aqui na entrada e desfeito na saida (`escolherFiltros`): as telas de baixo
  // continuam recebendo um `Filtros` normal, sem saber desse arranjo.
  const comMercado = (f: Filtros): Filtros => ({ ...f, market: mercados.join(',') || null });
  const filtrosCorredor = comMercado(filtros);
  const filtrosDaBusca = comMercado(filtrosBusca);

  const buscando = term.trim().length >= 2;
  const naLista = general?.items.length ?? 0;
  const destino = trip && trip.status === 'active' ? 'carrinho' : 'lista';

  const recarregarCorredores = useCallback(
    () =>
      api
        .get<{ shelves: Corredor[] }>(
          `/catalog/shelves?perCategory=12${mercados.length ? `&market=${mercados.join(',')}` : ''}`,
        )
        .then((d) => setCorredores(d.shelves))
        .catch(() => {}),
    [mercados],
  );

  useEffect(() => {
    void recarregarCorredores().finally(() => setCarregandoCorredores(false));
    void api
      .get<{ products: Product[] }>('/catalog/favorites?limit=20')
      .then((d) => setFavoritados(d.products))
      .catch(() => {});
    // O servidor comeca a encher o catalogo sozinho quando o banco e novo;
    // perguntar aqui faz a tela mostrar o progresso em vez de parecer vazia.
    void api
      .get<{ warmup: Aquecimento }>('/catalog/warmup')
      .then((d) => setAquecendo(d.warmup))
      .catch(() => {});
  }, [recarregarCorredores]);

  // Enquanto as prateleiras enchem, a tela se atualiza sozinha.
  useEffect(() => {
    if (!aquecendo?.rodando) return;
    const id = window.setInterval(async () => {
      try {
        const d = await api.get<{ warmup: Aquecimento }>('/catalog/warmup');
        setAquecendo(d.warmup);
        await recarregarCorredores();
      } catch {
        /* sem rede agora; a proxima volta tenta de novo */
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [aquecendo?.rodando, recarregarCorredores]);

  /** Proxima pagina do corredor, acrescentada ao que ja esta na tela. */
  async function verMais() {
    if (!aberto) return;
    setCarregando(true);
    try {
      const busca = new URLSearchParams({ limit: '60', offset: String(doCorredor.length), fill: '0' });
      for (const [chave, valor] of Object.entries(filtrosCorredor)) if (valor) busca.set(chave, String(valor));
      if (ordem) busca.set('sort', ordem);
      const d = await api.get<{ products: Product[] }>(`/catalog/categories/${aberto}?${busca}`);
      setDoCorredor((atual) => [...atual, ...d.products]);
    } finally {
      setCarregando(false);
    }
  }

  /** Vai aos mercados buscar mais produtos deste corredor. */
  async function buscarMaisNoCorredor() {
    if (!aberto) return;
    setErro('');
    setBuscandoMais(true);
    try {
      const r = await api.post<{ novos: number }>(`/catalog/categories/${aberto}/fill`, { termos: 4 });
      await carregarCorredor(aberto, filtrosCorredor, ordem);
      void recarregarCorredores();
      notify(r.novos > 0 ? `${r.novos} produtos novos no corredor` : 'Nada novo por aqui desta vez');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para buscar mais');
    } finally {
      setBuscandoMais(false);
    }
  }

  async function encherPrateleiras() {
    setErro('');
    try {
      const { warmup } = await api.post<{ warmup: Aquecimento }>('/catalog/warmup', { porCategoria: 4 });
      setAquecendo(warmup.rodando ? warmup : { ...warmup, rodando: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para encher as prateleiras');
    }
  }

  const buscar = useCallback(async (q: string, f: Filtros, o: Ordem) => {
    if (q.trim().length < 2) {
      setResultados([]);
      setFalhas([]);
      setFacetasBusca({});
      setTotalBusca(0);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const extra = paraBusca(f, o);
      const d = await api.get<Busca>(
        `/catalog/search?q=${encodeURIComponent(q)}&limit=40${extra ? `&${extra}` : ''}`,
      );
      setResultados(d.products);
      setFalhas(d.failed || []);
      setFacetasBusca(d.facets || {});
      setTotalBusca(d.total ?? d.products.length);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'a busca falhou');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void buscar(term, comMercado(filtrosBusca), ordemBusca), 450);
    return () => window.clearTimeout(debounce.current);
    // `comMercado` e recriado a cada render; o que importa e o que ele carrega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, filtrosBusca, mercados, ordemBusca, buscar]);

  // Palavra nova comeca sem filtro: a marca da busca anterior nao vale para a
  // proxima, e deixa-la ligada esconderia o resultado sem explicacao.
  useEffect(() => {
    setFiltrosBusca(SEM_FILTRO);
    setOrdemBusca(null);
  }, [term]);

  /**
   * Carrega o corredor com os filtros marcados. A resposta traz tambem as
   * faixas de filtro (tipo, marca, tamanho) com a contagem de cada uma, ja
   * cruzada com o que esta marcado.
   */
  const carregarCorredor = useCallback(
    async (key: string, f: Filtros, o: Ordem = null) => {
      setCarregando(true);
      try {
        const busca = new URLSearchParams({ limit: '60' });
        for (const [chave, valor] of Object.entries(f)) if (valor) busca.set(chave, String(valor));
        if (o) busca.set('sort', o);
        // O servidor enche o corredor buscando nos mercados quando ainda esta
        // vazio, entao esta chamada pode levar alguns segundos.
        const d = await api.get<{ products: Product[]; total: number; facets: Facetas }>(
          `/catalog/categories/${key}?${busca}`,
        );
        setDoCorredor(d.products);
        setTotalCorredor(d.total ?? d.products.length);
        setFacetas(d.facets ?? {});
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  async function abrirCorredor(key: string) {
    setAberto(key);
    setTerm('');
    setDoCorredor([]);
    setFiltros(SEM_FILTRO);
    // Abrir corredor solta tipo, marca e tamanho -- mas nao o mercado: quem
    // escolheu o Angeloni na faixa quer o Angeloni em todo corredor que abrir.
    setOrdem(null);
    await carregarCorredor(key, comMercado(SEM_FILTRO), null);
    void recarregarCorredores();
  }

  /**
   * Recebe os filtros da prateleira ja com o mercado dentro, guarda o mercado
   * no estado de cima e o resto no da prateleira. E o desfazer do `comMercado`.
   */
  function escolherFiltros(proximo: Filtros, alvo: 'corredor' | 'busca') {
    const { market, ...resto } = proximo;
    const proximosMercados = market ? String(market).split(',').filter(Boolean) : [];
    setMercados(proximosMercados);
    if (alvo === 'corredor') {
      setFiltros(resto);
      if (aberto) void carregarCorredor(aberto, { ...resto, market: market || null }, ordem);
    } else {
      setFiltrosBusca(resto);
    }
  }

  /** Troca a ordem da prateleira aberta e recarrega com ela. */
  function escolherOrdem(o: Ordem) {
    setOrdem(o);
    if (aberto) void carregarCorredor(aberto, filtrosCorredor, o);
  }

  /** Liga ou desliga um mercado na faixa de cima. */
  function alternarMercado(chave: string) {
    const proximos = mercados.includes(chave) ? mercados.filter((m) => m !== chave) : [...mercados, chave];
    setMercados(proximos);
    if (aberto) void carregarCorredor(aberto, { ...filtros, market: proximos.join(',') || null }, ordem);
  }

  /** Com carrinho aberto o item vai direto pra ele; fora disso, para a lista. */
  async function add(product: Product, qty = 1, unit?: string, market?: string | null) {
    setErro('');
    // A unidade vem do cartao ou do dialogo (bandeja ou peso); sem ela o
    // servidor usa a do mercado. O mercado so vem do dialogo, quando alguem
    // fixou onde quer comprar aquele item.
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
      const medida = fmtQty(qty, unit || product.unit);
      notify(`${medida === '1' ? '' : `${medida} `}${product.name} ${destino === 'carrinho' ? 'no carrinho' : 'na lista'}`, {
        texto: 'Ver',
        href: destino === 'carrinho' ? '/carrinho' : '/lista',
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para adicionar');
    }
  }

  const fecharCorredor = () => {
    setAberto(null);
    setDoCorredor([]);
    setFiltros(SEM_FILTRO);
    setFacetas({});
  };

  // Corredor nenhum com produto: banco novo, catalogo por encher.
  const vazio = !carregandoCorredores && corredores.length > 0 && corredores.every((c) => !c.total);

  const nomeDoMercado = (chave: string) => markets.find((m) => m.key === chave)?.label ?? chave;
  const legendaDoTopo =
    destino === 'carrinho'
      ? 'adicionando no carrinho em andamento'
      : mercados.length === 1
        ? `só ${nomeDoMercado(mercados[0])}`
        : mercados.length > 1
          ? mercados.map(nomeDoMercado).join(' e ')
          : undefined;

  const grade = 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
  const corredorAberto = corredores.find((c) => c.key === aberto);

  return (
    <>
      {/* O subtitulo dizia "preço nos quatro mercados" com a faixa logo abaixo
          dizendo a mesma coisa em letra maior -- duas vezes o mesmo recado, e
          um cabecalho que parecia vazio. Agora ele so fala quando tem algo
          proprio a dizer: o carrinho aberto, ou em que mercado se esta. */}
      <Topbar title="Mercado" subtitle={legendaDoTopo}>
        {naLista > 0 && destino === 'lista' && (
          <Button variant="outline" size="sm" onClick={() => navigate('/lista')}>
            <ClipboardList />
            {naLista}
          </Button>
        )}
      </Topbar>

      <Page>
        {/* A faixa de abertura aparece so na tela cheia do mercado: com busca
            aberta ou corredor escolhido, o espaco e do resultado. */}
        {!buscando && !aberto && <Hero escolhidos={mercados} onAlternar={alternarMercado} />}

        <div className="relative">
          <Search className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <Input
            className="h-12 pl-10.5 text-base"
            placeholder="Buscar produto: arroz, detergente, café…"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setAberto(null);
            }}
            enterKeyHint="search"
            autoComplete="off"
          />
          {carregando && (
            <div className="border-muted border-t-primary absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin rounded-full border-2" />
          )}
        </div>

        {!buscando && corredores.length > 0 && (
          <>
            <SectionTitle>Corredores</SectionTitle>
            <div className="grid snap-x auto-cols-max grid-flow-col gap-3 overflow-x-auto pb-2 [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden">
              {corredores.map((c) => (
                <CorredorTile
                  key={c.key}
                  c={c}
                  ativo={aberto === c.key}
                  onClick={() => (aberto === c.key ? fecharCorredor() : void abrirCorredor(c.key))}
                />
              ))}
            </div>
          </>
        )}

        {(vazio || aquecendo?.rodando) && !buscando && (
          <div className="bg-card mt-1 flex items-center gap-3 rounded-xl border p-3.5">
            <PackageOpen className="text-muted-foreground size-8 shrink-0" />
            <div className="min-w-0 flex-1">
              {aquecendo?.rodando ? (
                <>
                  <p className="text-sm font-bold">Enchendo as prateleiras…</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {aquecendo.corredor ? `${aquecendo.corredor} · ` : ''}
                    {aquecendo.feitos} de {aquecendo.total} buscas · {aquecendo.produtos} produtos
                  </p>
                  <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${aquecendo.total ? Math.round((aquecendo.feitos / aquecendo.total) * 100) : 0}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold">As prateleiras estão vazias</p>
                  <p className="text-muted-foreground text-xs">
                    O catálogo vem dos quatro mercados. Dá para buscar um produto direto, ou encher os corredores
                    agora.
                  </p>
                </>
              )}
            </div>
            {!aquecendo?.rodando && (
              <Button size="sm" onClick={() => void encherPrateleiras()}>
                Encher
              </Button>
            )}
          </div>
        )}

        {erro && (
          <div className="bg-destructive/10 text-destructive mt-3 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium">
            <TriangleAlert className="size-4 shrink-0" />
            {erro}
          </div>
        )}

        {falhas.length > 0 && (
          <div className="bg-accent/20 text-accent-foreground mt-3 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium">
            <TriangleAlert className="size-4 shrink-0" />
            Não deu para consultar {falhas.map((f) => f.market).join(', ')} agora. Os outros estão aí.
          </div>
        )}

        {buscando && (
          <>
            <SectionTitle action={<span className="text-muted-foreground text-sm">{resultados.length}</span>}>
              Resultados
            </SectionTitle>
            <BarraDeFiltros
              facetas={facetasBusca}
              filtros={filtrosDaBusca}
              total={totalBusca}
              dimensoes={['category', 'brand', 'size', 'market']}
              ordem={ordemBusca}
              onChange={(f) => escolherFiltros(f, 'busca')}
              onOrdem={setOrdemBusca}
            />
            {!resultados.length && !carregando ? (
              <EmptyState icon={<Search />} title="Nada encontrado">
                {temFiltro(filtrosDaBusca)
                  ? 'Nada com esses filtros. Solte um deles, ou toque em Limpar.'
                  : 'Tente escrever de outro jeito, ou anote à mão na lista.'}
              </EmptyState>
            ) : (
              <div className={grade}>
                {resultados.map((p) => (
                  <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(q, u) => void add(p, q, u)} onOpen={() => setAberto2(p)} />
                ))}
              </div>
            )}
          </>
        )}

        {!buscando && aberto && (
          <>
            <SectionTitle
              action={
                <span className="text-muted-foreground text-sm">
                  {temFiltro(filtrosCorredor)
                    ? `${totalCorredor} de ${corredorAberto?.total ?? totalCorredor}`
                    : totalCorredor || doCorredor.length}
                </span>
              }
            >
              {corredorAberto?.label}
            </SectionTitle>
            <BarraDeFiltros
              facetas={facetas}
              filtros={filtrosCorredor}
              total={totalCorredor}
              dimensoes={['sub', 'brand', 'size', 'market']}
              ordem={ordem}
              onChange={(f) => escolherFiltros(f, 'corredor')}
              onOrdem={escolherOrdem}
            />
            {carregando && !doCorredor.length ? (
              <>
                <p className="text-muted-foreground mb-4 text-sm">
                  Enchendo a prateleira: buscando este corredor nos quatro mercados.
                </p>
                <div className={grade}>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              </>
            ) : !doCorredor.length ? (
              <EmptyState icon={<Search />} title="Nada com esses filtros">
                Solte um dos filtros para ver mais — ou toque em Limpar.
              </EmptyState>
            ) : (
              <>
                <div className={grade}>
                  {doCorredor.map((p) => (
                    <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(q, u) => void add(p, q, u)} onOpen={() => setAberto2(p)} />
                  ))}
                </div>

                <div className="mt-4 flex flex-col items-center gap-2">
                  {doCorredor.length < totalCorredor && (
                    <Button variant="outline" disabled={carregando} onClick={() => void verMais()}>
                      <ChevronDown />
                      Ver mais {Math.min(60, totalCorredor - doCorredor.length)} de {totalCorredor}
                    </Button>
                  )}
                  {/* O catalogo vem dos mercados aos poucos; quando o corredor
                      esta magro, vale ir buscar mais termos la. */}
                  <Button variant="ghost" size="sm" disabled={buscandoMais} onClick={() => void buscarMaisNoCorredor()}>
                    <RefreshCw className={buscandoMais ? 'animate-spin' : undefined} />
                    {buscandoMais ? 'Buscando nos mercados…' : 'Buscar mais produtos deste corredor'}
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {/* Favoritos primeiro: o que a casa compra sempre e o que se procura
            mais, e ninguem quer caçar isso corredor a corredor. */}
        {!buscando && !aberto && favoritados.filter((p) => favoritos.includes(p.id)).length > 0 && (
          <div>
            <SectionTitle action={<span className="text-muted-foreground text-sm">{favoritos.length}</span>}>
              <Heart className="fill-sale text-sale mr-1 inline size-5 align-[-3px]" />
              Favoritos
            </SectionTitle>
            <Shelf>
              {favoritados
                .filter((p) => favoritos.includes(p.id))
                .map((p) => (
                  <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(q, u) => void add(p, q, u)} onOpen={() => setAberto2(p)} />
                ))}
            </Shelf>
          </div>
        )}

        {!buscando &&
          !aberto &&
          (carregandoCorredores && !corredores.length ? (
            ['a', 'b'].map((k) => (
              <div key={k}>
                <SectionTitle>
                  <Skeleton className="h-5 w-36" />
                </SectionTitle>
                <div className="grid auto-cols-[9.5rem] grid-flow-col gap-2.5 overflow-hidden md:auto-cols-[12rem] md:gap-4">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              </div>
            ))
          ) : !corredores.length ? (
            <EmptyState icon={<Store />} title="Catálogo vazio">
              Busque um produto acima para o app trazer dos mercados — ou rode <code>npm run seed</code> no servidor para
              já começar com as prateleiras cheias.
            </EmptyState>
          ) : (
            corredores
              .filter((c) => c.products.length)
              .map((c) => (
                <div key={c.key}>
                  <SectionTitle
                    action={
                      <Button variant="ghost" size="sm" onClick={() => void abrirCorredor(c.key)}>
                        ver {c.total} →
                      </Button>
                    }
                  >
                    {c.label}
                  </SectionTitle>
                  <Shelf>
                    {c.products.map((p) => (
                      <ProductCard key={p.id} product={p} added={added[p.id]} onAdd={(q, u) => void add(p, q, u)} onOpen={() => setAberto2(p)} />
                    ))}
                  </Shelf>
                </div>
              ))
          ))}
      </Page>

      <ProductDialog
        product={aberto2}
        open={!!aberto2}
        onOpenChange={(v) => !v && setAberto2(null)}
        onAdd={(prod, q, u, m) => void add(prod, q, u, m)}
        onCoverChange={() => void recarregarCorredores()}
      />
    </>
  );
}
