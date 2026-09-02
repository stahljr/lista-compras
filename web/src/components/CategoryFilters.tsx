import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type Faceta = { key: string; label: string; count: number };
export type Facetas = { subs: Faceta[]; brands: Faceta[]; sizes: Faceta[] };
export type Filtros = { sub: string | null; brand: string | null; size: string | null };

export const SEM_FILTRO: Filtros = { sub: null, brand: null, size: null };
export const temFiltro = (f: Filtros) => !!(f.sub || f.brand || f.size);

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition-colors active:scale-[0.98]',
        ativo ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function Faixa({
  titulo,
  itens,
  escolhido,
  onEscolher,
}: {
  titulo: string;
  itens: Faceta[];
  escolhido: string | null;
  onEscolher: (key: string) => void;
}) {
  // Uma opcao sozinha nao e filtro: filtrar por ela nao muda nada na tela.
  if (itens.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-16 shrink-0 text-[10.5px] font-bold tracking-wider uppercase">
        {titulo}
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {itens.map((f) => (
          <Chip key={f.key} ativo={escolhido === f.key} onClick={() => onEscolher(f.key)}>
            {f.label}
            <span className={cn('ml-1.5 font-normal', escolhido === f.key ? 'opacity-70' : 'text-muted-foreground')}>
              {f.count}
            </span>
          </Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * O corredor por dentro. "Bebidas" nao se procura junto: ou se quer agua, ou
 * refrigerante, ou cerveja -- e depois a marca e o tamanho. A contagem de cada
 * faixa ja considera as outras escolhas, entao um filtro nunca leva a uma tela
 * vazia sem aviso.
 */
export function CategoryFilters({
  facetas,
  filtros,
  total,
  onChange,
}: {
  facetas: Facetas;
  filtros: Filtros;
  total: number;
  onChange: (f: Filtros) => void;
}) {
  const nada = !facetas.subs.length && !facetas.brands.length && !facetas.sizes.length;
  if (nada) return null;

  // Trocar o tipo solta marca e tamanho: eles eram do tipo anterior.
  const escolher = (dim: keyof Filtros, valor: string) => {
    const igual = filtros[dim] === valor;
    if (dim === 'sub') onChange({ sub: igual ? null : valor, brand: null, size: null });
    else onChange({ ...filtros, [dim]: igual ? null : valor });
  };

  return (
    <div className="bg-card mb-4 flex flex-col gap-2 rounded-xl border p-3">
      <Faixa titulo="Tipo" itens={facetas.subs} escolhido={filtros.sub} onEscolher={(k) => escolher('sub', k)} />
      <Faixa titulo="Marca" itens={facetas.brands} escolhido={filtros.brand} onEscolher={(k) => escolher('brand', k)} />
      <Faixa titulo="Tamanho" itens={facetas.sizes} escolhido={filtros.size} onEscolher={(k) => escolher('size', k)} />
      {temFiltro(filtros) && (
        <div className="flex items-center gap-2 border-t pt-2">
          <span className="text-muted-foreground text-xs">
            {total} {total === 1 ? 'produto' : 'produtos'} com esses filtros
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onChange(SEM_FILTRO)}>
            <X />
            Limpar
          </Button>
        </div>
      )}
    </div>
  );
}
