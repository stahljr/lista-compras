import type { Trip, TripItem } from './types';

const arredonda = (n: number) => Math.round(n * 100) / 100;

/**
 * Recalcula os totais da compra no proprio aparelho. Serve so para a tela
 * responder na hora quando a escrita ficou na fila offline -- quando a rede
 * volta, o servidor devolve os numeros de verdade e sobrescreve estes.
 */
export function recalcular(trip: Trip): Trip {
  const pegos = trip.items.filter((i) => i.picked);
  const faltando = trip.items.filter((i) => !i.picked);
  const gasto = arredonda(pegos.reduce((acc, i) => acc + (i.subtotal || 0), 0));
  const estimativa = arredonda(faltando.reduce((acc, i) => acc + (i.expected || 0) * i.qty, 0));

  const porCategoria = new Map<string, { key: string; label: string; items: TripItem[] }>();
  for (const item of faltando) {
    if (!porCategoria.has(item.category)) {
      porCategoria.set(item.category, { key: item.category, label: item.categoryLabel, items: [] });
    }
    porCategoria.get(item.category)!.items.push(item);
  }

  return {
    ...trip,
    items: [...trip.items].sort(
      (a, b) => Number(a.picked) - Number(b.picked) || a.name.localeCompare(b.name, 'pt-BR'),
    ),
    progress: {
      total: trip.items.length,
      picked: pegos.length,
      missing: faltando.length,
      complete: trip.items.length > 0 && faltando.length === 0,
      percent: trip.items.length ? Math.round((pegos.length / trip.items.length) * 100) : 0,
      withoutPrice: trip.items.filter((i) => i.price == null).length,
      notHere: faltando.filter((i) => i.availableHere === false).length,
    },
    missingByCategory: [...porCategoria.values()],
    spent: gasto,
    remainingEstimate: estimativa,
    estimatedTotal: arredonda(gasto + estimativa),
  };
}

/** Aplica localmente o mesmo efeito que o servidor teria aplicado. */
export function aplicarPatch(trip: Trip, itemId: number, patch: { picked?: boolean; unitPrice?: number | null }, quem: Trip['items'][number]['pickedBy']): Trip {
  const items = trip.items.map((item) => {
    if (item.id !== itemId) return item;
    const picked = patch.picked !== undefined ? patch.picked : item.picked;
    const unitPrice = patch.unitPrice !== undefined ? patch.unitPrice : item.unitPrice;
    // Mesma regra do servidor: vale o preco corrigido; sem correcao, o da lista.
    const price = unitPrice ?? item.expected;
    return {
      ...item,
      picked,
      unitPrice,
      price,
      corrected: unitPrice != null,
      pickedBy: picked ? quem : null,
      pickedAt: picked ? new Date().toISOString() : null,
      subtotal: price != null ? arredonda(price * (item.pickedQty ?? item.qty)) : null,
    };
  });
  return recalcular({ ...trip, items });
}
