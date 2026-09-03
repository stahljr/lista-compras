import { useMemo, useState } from 'react';
import { Check, ChevronDown, ListFilter, Search, SlidersHorizontal, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row, RowBody, RowName } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';

export type Faceta = { key: string; label: string; count: number };
export type Dimensao = 'sub' | 'category' | 'brand' | 'size' | 'market';
export type Facetas = Partial<Record<Dimensao, Faceta[]>>;
export type Filtros = Partial<Record<Dimensao, string | null>>;

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
export const paraBusca = (f: Filtros) =>
  Object.entries(f)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

const NOME: Record<Dimensao, string> = {
  sub: 'Tipo',
  category: 'Corredor',
  brand: 'Marca',
  size: 'Tamanho',
  market: 'Mercado',
};

/**
 * Os filtros de uma prateleira.
 *
 * Eram tres fileiras de etiquetas empilhadas: ocupavam meia tela, cortavam as
 * opcoes na borda e nao cabia mais nenhuma dimensao. Agora e uma linha de
 * botoes -- um por dimensao -- e a escolha acontece numa folha, onde cabe a
 * lista inteira com a contagem de cada opcao (e uma busca, quando sao dezenas
 * de marcas). O que esta filtrando fica escrito no proprio botao.
 */
export function Filtros({
  facetas,
  filtros,
  total,
  dimensoes,
  onChange,
}: {
  facetas: Facetas;
  filtros: Filtros;
  total: number;
  dimensoes: Dimensao[];
  onChange: (f: Filtros) => void;
}) {
  const { markets } = useStore();
  const [aberta, setAberta] = useState<Dimensao | null>(null);
  const [procura, setProcura] = useState('');

  // Todos os hooks antes de qualquer saida: um useMemo depois de um return
  // condicional muda a ordem dos hooks entre renders, e o React derruba a tela.
  const opcoes = useMemo(() => {
    if (!aberta) return [];
    const lista = facetas[aberta] || [];
    const alvo = procura.trim().toLowerCase();
    return alvo ? lista.filter((o) => o.label.toLowerCase().includes(alvo)) : lista;
  }, [aberta, facetas, procura]);

  // Dimensao com uma opcao so nao e filtro: escolher nao muda nada na tela.
  const uteis = dimensoes.filter((d) => (facetas[d]?.length ?? 0) > 1 || filtros[d]);
  if (!uteis.length) return null;

  const rotuloDe = (dim: Dimensao, chave: string) =>
    facetas[dim]?.find((f) => f.key === chave)?.label ?? chave;

  const escolher = (dim: Dimensao, chave: string | null) => {
    // Dimensao multipla soma em vez de trocar, e a folha fica aberta: quem
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
    setAberta(null);
    setProcura('');
  };

  /** O que escrever no botao da dimensao: "Angeloni" ou "2 mercados". */
  const resumo = (dim: Dimensao, escolhido: string) => {
    const lista = valores(escolhido);
    if (lista.length <= 1) return rotuloDe(dim, escolhido);
    return `${lista.length} ${NOME[dim].toLowerCase()}s`;
  };

  const corDoMercado = (chave: string) => markets.find((m) => m.key === chave)?.color;

  return (
    <>
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SlidersHorizontal className="text-muted-foreground size-4 shrink-0" />
        {uteis.map((dim) => {
          const escolhido = filtros[dim];
          return (
            <button
              key={dim}
              type="button"
              onClick={() => setAberta(dim)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pr-2 pl-3 text-[13px] font-semibold whitespace-nowrap transition-colors active:scale-[0.98]',
                escolhido ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
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
                <ChevronDown className="size-3.5 opacity-60" />
              )}
            </button>
          );
        })}
        {temFiltro(filtros) && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onChange(SEM_FILTRO)}>
            Limpar
          </Button>
        )}
      </div>

      {temFiltro(filtros) && (
        <p className="text-muted-foreground mb-3 px-1 text-xs">
          {total} {total === 1 ? 'produto' : 'produtos'} com esses filtros
        </p>
      )}

      {aberta && (
        <Sheet
          title={NOME[aberta]}
          subtitle={
            MULTIPLAS.includes(aberta)
              ? 'Marque quantos quiser — vale qualquer um deles'
              : `${facetas[aberta]?.length ?? 0} opções nesta prateleira`
          }
          onClose={() => {
            setAberta(null);
            setProcura('');
          }}
        >
          {(facetas[aberta]?.length ?? 0) > 12 && (
            <div className="relative mb-3">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder={`Procurar ${NOME[aberta].toLowerCase()}…`}
                className="pl-9"
                autoFocus
              />
            </div>
          )}

          <div className="-mx-1 max-h-[55dvh] overflow-y-auto">
            <Row onClick={() => escolher(aberta, null)} className="rounded-lg px-2">
              <ListFilter className="text-muted-foreground size-4 shrink-0" />
              <RowBody>
                <RowName>Todos</RowName>
              </RowBody>
              {!filtros[aberta] && <Check className="text-primary size-4 shrink-0" />}
            </Row>
            {opcoes.map((o) => (
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
            ))}
            {!opcoes.length && <p className="text-muted-foreground px-2 py-4 text-sm">Nada com esse nome.</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}
