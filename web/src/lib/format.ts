const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const money = (value: number | null | undefined) => (value == null ? '—' : brl.format(value));

/** Quantidade sem decimal inutil: 2 em vez de 2,00; 0,5 quando e meio quilo. */
export function quantity(value: number, unit?: string) {
  const n = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '').replace('.', ',');
  return unit && unit !== 'un' ? `${n} ${unit}` : n;
}

export function relativeDate(iso: string) {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function dateTime(iso: string) {
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Depois de quantos dias um preco deixa de ser "o preco" e passa a ser "o
 * preco daquele dia".
 *
 * Tres dias porque o refresher reconsulta bem mais rapido que isso: se uma
 * etiqueta chegou a essa idade, aquele mercado parou de responder -- e
 * comparar contra ela sem aviso e o comeco de um erro de conta.
 */
export const DIAS_ATE_ENVELHECER = 3;

/** Data do banco ("2026-08-20 10:00:00", UTC) ou ISO, como numero. */
const instante = (iso: string) => Date.parse(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);

/** O preco ja tem idade de merecer aviso? */
export function precoVelho(iso: string | null | undefined) {
  if (!iso) return false;
  const quando = instante(iso);
  return Number.isNaN(quando) ? false : (Date.now() - quando) / 86400000 > DIAS_ATE_ENVELHECER;
}

/** "20/8" -- curto, porque cabe numa etiqueta. */
export function diaEMes(iso: string) {
  const quando = instante(iso);
  return Number.isNaN(quando) ? '' : new Date(quando).toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' });
}
