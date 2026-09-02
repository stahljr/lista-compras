import type { Product } from '@/lib/types';

/** Corredores onde a balanca e rotina: carne, hortifruti, frios, padaria. */
const PESAVEIS = new Set(['acougue', 'hortifruti', 'frios', 'padaria']);

/** Unidades de medida (o mercado cobra por elas), em oposicao a "un". */
const MEDIDAS = new Set(['kg', 'g', 'l', 'ml']);

export const isMeasured = (unit: string) => MEDIDAS.has(unit);

/** Passo do contador: meio quilo/litro por toque, 100 no grama, 1 no resto. */
export function stepOf(unit: string) {
  if (unit === 'kg' || unit === 'l') return 0.5;
  if (unit === 'g' || unit === 'ml') return 100;
  return 1;
}

/**
 * Onde faz sentido perguntar "bandeja ou peso?": carne moida ou vem em bandeja
 * ou vem em 1,5 kg pedido no balcao, e quem decide e quem vai comprar.
 */
export function weighable(product: Pick<Product, 'unit' | 'category'>) {
  return product.unit === 'kg' || PESAVEIS.has(product.category);
}

/** As duas escolhas possiveis de um produto pesavel, na ordem. */
export const unitChoices = (product: Pick<Product, 'unit' | 'category'>): string[] =>
  weighable(product) ? (product.unit === 'kg' ? ['kg', 'un'] : ['un', 'kg']) : [product.unit];

export const unitLabel = (unit: string) => (unit === 'un' ? 'unidade' : unit);

/** Arredonda o que o passo produz: 0.30000000000000004 nao vai pro servidor. */
export const roundQty = (value: number) => Math.round(value * 1000) / 1000;
