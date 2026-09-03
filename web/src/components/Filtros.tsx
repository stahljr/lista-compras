import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Check, ChevronDown, ListFilter, Search, SlidersHorizontal, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row, RowBody, RowName } from '@/components/Layout';

export type Faceta = { key: string; label: string; count: number };
export type Dimensao = 'sub' | 'category' | 'brand' | 'size' | 'market';
export type Facetas = Partial<Record<Dimensao, Faceta[]>>;
export type Filtros = Partial<Record<Dimensao, string | null>>;

/** As ordens que o servidor conhece. `null` e a ordem natural de cada tela. */
export type Ordem = 'barato' | 'caro' | 'nome' | 'mercados' | null;

export const SEM_FILTRO: Filtros = {};
export const temFiltro = (f: Filtros) => Object.values(f).some(Boolean);

/**
 * Dimensoes que aceitam mais de uma escolha ao mesmo tempo. Sao guardadas
 * como uma lista separada por virgula ("angeloni,festval") -- o servidor le
 * assim, e isso mantem o filtro sendo um valor de texto so, que cabe na URL
 * e no estado sem virar um caso especial em cada tela.
 */
const MULTIPLAS: Dimensao[] = ['market'];
export const valores = (v: string | null | undefined) => (v ? String(v).split(',').filter(Boolean) : []);
/** Liga ou desliga um valor numa dimensao multipla, preservando os outros. */
export const alternar = (atual: string | null | undefined, chave: string) => {
  const lista = valores(atual);
  const proxima = lista.includes(chave) ? lista.filter((v) => v !== chave) : [...lista, chave];
  return proxima.length ? proxima.join(',') : null;
};

export const paraBusca = (f: Filtros, ordem?: Ordem) =>
  [
    ...Object.entries(f)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`),
    ...(ordem ? [`sort=${ordem}`] : []),
  ].join('&');

const NOME: Record<Dimensao, string> = {
  sub: 'Tipo',
  category: 'Corredor',
  brand: 'Marca',
  size: 'Tamanho',
  market: 'Mercado',
};

const ORDENS: { chave: Ordem; label: string; nota: string }[] = [
  { chave: null, label: 'Recomendado', nota: 'a ordem natural desta prateleira' },
  { chave: 'barato', label: 'Menor preço', nota: 'do mais barato que se acha' },
  { chave: 'caro', label: 'Maior preço', nota: 'do mais caro para o mais barato' },
  { chave: 'mercados', label: 'Em mais mercados', nota: 'primeiro o que dá para comparar' },
  { chave: 'nome', label: 'Nome (A–Z)', nota: 'alfabético' },
];

/** Uma das dimensoes, ou a coluna de ordem: e o que pode estar aberto na barra. */
type Painel = Dimensao | 'ordem';

/**
 * Os filtros de uma prateleira.
 *
 * Eram tres fileiras de etiquetas empilhadas: ocupavam meia tela, cortavam as
 * opcoes na borda e nao cabia mais nenhuma dimensao. Agora e uma linha de
 * botoes -- um por dimensao, mais a ordem -- e a escolha acontece numa janela
 * que abre logo abaixo da barra.
 *
 * Abrir para baixo, e nao numa folha modal, e o que mantem a prateleira a
 * vista: escolher "Ypê" e ver o resultado atras da janela e uma informacao a
 * mais por toque. A folha cobria tudo e obrigava a fechar para conferir.
 */
export function Filtros({
  facetas,
  filtros,
  total,
  dimensoes,
  ordem = null,
  onChange,
  onOrdem,
}: {
  facetas: Facetas;
  filtros: Filtros;
  total: number;
  dimensoes: Dimensao[];
  ordem?: Ordem;
  onChange: (f: Filtros) => void;
  onOrdem?: (o: Ordem) => void;
}) {
  const { markets } = useStore();
  const [aberta, setAberta] = useState<Painel | null>(null);
  const [procura, setProcura] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

  const fechar = () => {
    setAberta(null);
    setProcura('');
  };

  // Todos os hooks antes de qualquer saida: um useMemo depois de um return
  // condicional muda a ordem dos hooks entre renders, e o React derruba a tela.
  const opcoes = useMemo(() => {
    if (!aberta || aberta === 'ordem') return [];
    const lista = facetas[aberta] || [];
    const alvo = procura.trim().toLowerCase();
    return alvo ? lista.filter((o) => o.label.toLowerCase().includes(alvo)) : lista;
  }, [aberta, facetas, procura]);

  // Janela aberta fecha ao clicar fora ou no Esc. Sem isso ela ficaria de pe
  // sobre a prateleira e nao daria para tocar num produto.
  useEffect(() => {
    if (!aberta) return;
    const foraDaCaixa = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) fechar();
    };
    const noEsc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', noEsc);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', noEsc);
    };
  }, [aberta]);

  // Dimensao com uma opcao so nao e filtro: escolher nao muda nada na tela.
  const uteis = dimensoes.filter((d) => (facetas[d]?.length ?? 0) > 1 || filtros[d]);
  if (!uteis.length && !onOrdem) return null;

  const rotuloDe = (dim: Dimensao, chave: string) => facetas[dim]?.find((f) => f.key === chave)?.label ?? chave;

  const escolher = (dim: Dimensao, chave: string | null) => {
    // Dimensao multipla soma em vez de trocar, e a janela fica aberta: quem
    // quer dois mercados escolhe os dois sem reabrir nada.
    if (MULTIPLAS.includes(dim) && chave) {
      onChange({ ...filtros, [dim]: alternar(filtros[dim], chave) });
      return;
    }
    // Trocar o tipo (ou o corredor) solta marca e tamanho: eram do anterior.
    if ((dim === 'sub' || dim === 'category') && chave !== filtros[dim]) {
      onChange({ ...filtros, [dim]: chave, brand: null, size: null });
    } else {
      onChange({ ...filtros, [dim]: chave });
    }
    fechar();
  };

  /** O que escrever no botao da dimensao: "Angeloni" ou "2 mercados". */
  const resumo = (dim: Dimensao, escolhido: string) => {
    const lista = valores(escolhido);
    return lista.length <= 1 ? rotuloDe(dim, escolhido) : `${lista.length} ${NOME[dim].toLowerCase()}s`;
  };

  const corDoMercado = (chave: string) => markets.find((m) => m.key === chave)?.color;
  const ordemAtual = ORDENS.find((o) => o.chave === ordem) ?? ORDENS[0];

  const botao = (ligado: boolean) =>
    cn(
      'flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-2 pl-3 text-[13px] font-semibold whitespace-nowrap transition-colors active:scale-[0.98]',
      ligado ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
    );

  return (
    // A ancora da janela e este bloco, e nao a fileira de botoes: a fileira
    // rola de lado (`overflow-x-auto`) e recortaria a janela na borda.
    <div ref={caixa} className="relative mb-3">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SlidersHorizontal className="text-muted-foreground size-4 shrink-0" />

        {uteis.map((dim) => {
          const escolhido = filtros[dim];
          return (
            <button
              key={dim}
              type="button"
              aria-expanded={aberta === dim}
              onClick={() => (aberta === dim ? fechar() : setAberta(dim))}
              className={botao(!!escolhido)}
            >
              {dim === 'market' && escolhido && valores(escolhido).length === 1 && (
                <span className="size-2 rounded-full" style={{ background: corDoMercado(escolhido) }} />
              )}
              {escolhido ? resumo(dim, escolhido) : NOME[dim]}
              {escolhido ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Tirar filtro de ${NOME[dim].toLowerCase()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    escolher(dim, null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && escolher(dim, null)}
                  className="hover:bg-primary-foreground/20 rounded-full p-0.5"
                >
                  <X className="size-3.5" />
                </span>
              ) : (
                <ChevronDown className={cn('size-3.5 opacity-60 transition-transform', aberta === dim && 'rotate-180')} />
              )}
            </button>
          );
        })}

        {onOrdem && (
          <button
            type="button"
            aria-expanded={aberta === 'ordem'}
            onClick={() => (aberta === 'ordem' ? fechar() : setAberta('ordem'))}
            className={botao(!!ordem)}
          >
            <ArrowDownUp className="size-3.5" />
            {ordem ? ordemAtual.label : 'Ordenar'}
            <ChevronDown className={cn('size-3.5 opacity-60 transition-transform', aberta === 'ordem' && 'rotate-180')} />
          </button>
        )}

        {temFiltro(filtros) && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange(SEM_FILTRO)}>
            Limpar
          </Button>
        )}
      </div>

      {temFiltro(filtros) && (
        <p className="text-muted-foreground mt-0.5 mb-1 px-1 text-xs">
          {total} {total === 1 ? 'produto' : 'produtos'} com esses filtros
        </p>
      )}

      {aberta && (
        <div
          role="dialog"
          aria-label={aberta === 'ordem' ? 'Ordenar' : NOME[aberta]}
          className="bg-card animate-[abre_0.14s_ease-out] absolute inset-x-0 top-full z-40 mt-1 origin-top overflow-hidden rounded-xl border shadow-xl sm:max-w-sm"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight">
              {aberta === 'ordem'
                ? 'Ordenar'
                : MULTIPLAS.includes(aberta)
                  ? `${NOME[aberta]} — marque quantos quiser`
                  : NOME[aberta]}
            </p>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="text-muted-foreground hover:bg-muted -mr-1 rounded-md p-1"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {aberta !== 'ordem' && (facetas[aberta]?.length ?? 0) > 12 && (
            <div className="relative border-b p-2">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2" />
              <Input
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder={`Procurar ${NOME[aberta].toLowerCase()}…`}
                className="h-9 pl-9"
                autoFocus
              />
            </div>
          )}

          <div className="max-h-[19rem] overflow-y-auto p-1">
            {aberta === 'ordem'
              ? ORDENS.map((o) => (
                  <Row
                    key={o.label}
                    onClick={() => {
                      onOrdem?.(o.chave);
                      fechar();
                    }}
                    className="rounded-lg px-2"
                  >
                    <RowBody>
                      <RowName>{o.label}</RowName>
                      <p className="text-muted-foreground text-xs">{o.nota}</p>
                    </RowBody>
                    {ordem === o.chave && <Check className="text-primary size-4 shrink-0" />}
                  </Row>
                ))
              : [
                  <Row key="__todos" onClick={() => escolher(aberta, null)} className="rounded-lg px-2">
                    <ListFilter className="text-muted-foreground size-4 shrink-0" />
                    <RowBody>
                      <RowName>Todos</RowName>
                    </RowBody>
                    {!filtros[aberta] && <Check className="text-primary size-4 shrink-0" />}
                  </Row>,
                  ...opcoes.map((o) => (
                    <Row key={o.key} onClick={() => escolher(aberta, o.key)} className="rounded-lg px-2">
                      {aberta === 'market' && (
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: corDoMercado(o.key) }} />
                      )}
                      <RowBody>
                        <RowName>{o.label}</RowName>
                      </RowBody>
                      <Badge variant="secondary" className="shrink-0">
                        {o.count}
                      </Badge>
                      {valores(filtros[aberta]).includes(o.key) && <Check className="text-primary size-4 shrink-0" />}
                    </Row>
                  )),
                  !opcoes.length ? (
                    <p key="__vazio" className="text-muted-foreground px-2 py-4 text-sm">
                      Nada com esse nome.
                    </p>
                  ) : null,
                ]}
          </div>
        </div>
      )}
    </div>
  );
}
