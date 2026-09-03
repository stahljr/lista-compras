import { MARKETS } from './markets/index.js';
import { fillMissingOffers, hydrate, searchLocal, priceStats, matchKey } from './catalog.js';

const round = (n) => Math.round(n * 100) / 100;

/**
 * Resolve cada item da lista num produto com precos. Itens digitados a mao
 * ("papel toalha") nao tem produto vinculado; tenta-se achar o mais provavel
 * no catalogo ja conhecido, senao o item fica sem preco e e apenas listado.
 */
async function priceItems(items, { refresh = true, householdId = null } = {}) {
  const priced = [];
  const unpriced = [];

  for (const item of items) {
    let product = null;
    if (item.product_id) {
      product = refresh ? await fillMissingOffers(item.product_id) : await hydrate(item.product_id);
    } else {
      product = (await searchLocal(item.name, { limit: 1 }))[0] || null;
    }

    const offers = (product?.offers || []).filter((o) => o.available && o.price > 0);
    if (!offers.length) {
      const stats = householdId ? await priceStats(householdId, matchKey({ name: item.name })) : null;
      unpriced.push({
        id: item.id,
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        category: item.category,
        lastPaid: stats?.last ?? null,
      });
      continue;
    }

    const prices = {};
    for (const o of offers) if (prices[o.market] == null || o.price < prices[o.market]) prices[o.market] = o.price;
    const cheapest = offers.reduce((a, b) => (b.price < a.price ? b : a));
    priced.push({
      id: item.id,
      name: product.name || item.name,
      qty: item.qty || 1,
      unit: item.unit,
      category: item.category,
      // O mercado escolhido para o item viaja junto: quem compara precisa ver
      // que aquela linha ja tem destino.
      market: item.market || null,
      productId: product.id,
      imageUrl: product.imageUrl || item.image_url,
      prices,
      cheapestMarket: cheapest.market,
      cheapestPrice: cheapest.price,
    });
  }
  return { priced, unpriced };
}

function marketTotals(priced) {
  return MARKETS.map((market) => {
    let total = 0;
    const missing = [];
    for (const item of priced) {
      const price = item.prices[market.key];
      if (price == null) missing.push(item.name);
      else total += price * item.qty;
    }
    return {
      key: market.key,
      label: market.label,
      color: market.color,
      total: round(total),
      covered: priced.length - missing.length,
      missingCount: missing.length,
      missing,
      complete: missing.length === 0,
    };
  }).sort((a, b) => b.covered - a.covered || a.total - b.total);
}

/**
 * Para cada par de mercados, manda cada item para o mais barato dos dois.
 * Sao so 6 pares, entao da para calcular o otimo exato sem heuristica.
 * Escolhe o par que pega mais itens e, entre os empatados, o mais barato.
 */
function bestSplit(priced) {
  let best = null;
  for (let i = 0; i < MARKETS.length; i++) {
    for (let j = i + 1; j < MARKETS.length; j++) {
      const a = MARKETS[i];
      const b = MARKETS[j];
      const assignment = { [a.key]: [], [b.key]: [] };
      let total = 0;
      const missing = [];
      for (const item of priced) {
        const pa = item.prices[a.key];
        const pb = item.prices[b.key];
        if (pa == null && pb == null) {
          missing.push(item.name);
          continue;
        }
        const target = pb == null || (pa != null && pa <= pb) ? a : b;
        const price = target === a ? pa : pb;
        assignment[target.key].push({ ...item, price, subtotal: round(price * item.qty) });
        total += price * item.qty;
      }
      // Um par em que um dos lados nao leva nada e so um mercado unico disfarcado.
      if (!assignment[a.key].length || !assignment[b.key].length) continue;
      const candidate = {
        markets: [
          { key: a.key, label: a.label, color: a.color, items: assignment[a.key], total: round(sum(assignment[a.key])) },
          { key: b.key, label: b.label, color: b.color, items: assignment[b.key], total: round(sum(assignment[b.key])) },
        ],
        total: round(total),
        covered: priced.length - missing.length,
        missing,
      };
      if (!best || candidate.covered > best.covered || (candidate.covered === best.covered && candidate.total < best.total)) {
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * Compara a divisao com o melhor mercado unico sobre a MESMA cesta: sem isso a
 * conta engana, porque o par costuma cobrir itens que o mercado unico nao tem
 * e o total maior parece desvantagem quando e so cesta maior.
 * Devolve a economia real nos itens em comum e, separado, o que custa a mais
 * para levar os itens que so existem no segundo mercado.
 */
function describeSplit(split, single, priced) {
  if (!split || !single) return split;
  const coveredBySingle = new Set(priced.filter((i) => i.prices[single.key] != null).map((i) => i.id));
  let comparable = 0;
  const extra = [];
  for (const market of split.markets) {
    for (const item of market.items) {
      if (coveredBySingle.has(item.id)) comparable += item.subtotal;
      else extra.push({ name: item.name, subtotal: item.subtotal, market: market.label });
    }
  }
  split.comparableTotal = round(comparable);
  split.savings = round(single.total - comparable);
  split.savingsPct = single.total > 0 ? Math.round((split.savings / single.total) * 1000) / 10 : 0;
  split.extraItems = extra;
  split.extraCost = round(extra.reduce((acc, e) => acc + e.subtotal, 0));
  split.comparedTo = { key: single.key, label: single.label, total: single.total };
  return split;
}

const sum = (items) => items.reduce((acc, i) => acc + i.subtotal, 0);

/**
 * Onde vale mais a pena fazer esta compra? Devolve o custo em cada mercado,
 * o melhor mercado unico e a melhor divisao em dois -- com a economia que a
 * divisao traz, para dar para decidir se vale a segunda parada.
 */
export async function compareBasket(items, { refresh = true, minSplitSavings = 3, householdId = null } = {}) {
  const { priced, unpriced } = await priceItems(items, { refresh, householdId });
  if (!priced.length) {
    return { itemCount: items.length, priced: [], unpriced, markets: [], best: null, split: null, worthSplitting: false };
  }

  const markets = marketTotals(priced);
  const complete = markets.filter((m) => m.complete);
  // Melhor mercado unico: o mais barato entre os que tem tudo; se nenhum tem
  // tudo, o que cobre mais itens (empate resolvido pelo preco).
  const single = complete.length ? complete.reduce((a, b) => (b.total < a.total ? b : a)) : markets[0] || null;

  const split = describeSplit(bestSplit(priced), single, priced);
  // So vale sugerir a segunda parada quando ela economiza de fato na mesma
  // cesta. Cobrir item que falta e outra conversa, e a tela diz isso separado.
  const worthSplitting = !!split && split.savings >= minSplitSavings;

  return {
    itemCount: items.length,
    priced,
    unpriced,
    markets,
    best: single,
    split,
    worthSplitting,
    cheapestPossible: round(priced.reduce((acc, i) => acc + i.cheapestPrice * i.qty, 0)),
  };
}
