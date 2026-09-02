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
