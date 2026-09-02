export type Market = { key: string; label: string; color: string; site: string };

export type Offer = {
  market: string;
  marketLabel: string;
  price: number;
  listPrice: number | null;
  available: boolean;
  url: string | null;
  name: string;
  updatedAt: string;
};

export type Product = {
  id: number;
  ean: string | null;
  matchKey: string;
  name: string;
  brand: string | null;
  category: string;
  /** Subdivisão do corredor tirada do nome: água, refrigerante, cerveja... */
  subcategory: string | null;
  /** Tamanho lido do nome, já escrito para ler: "2 L", "500 g", "12x350 ml". */
  sizeLabel: string | null;
  imageUrl: string | null;
  unit: string;
  offers: Offer[];
  cheapest: Offer | null;
  marketsCount: number;
  /** Categoria escolhida à mão: a reclassificação automática não mexe. */
  categoryLocked?: boolean;
};

export type Person = { id: number; name: string; color: string };

export type ListItem = {
  id: number;
  productId: number | null;
  name: string;
  qty: number;
  unit: string;
  category: string;
  /** Mercado escolhido para este item; vazio = onde estiver mais barato. */
  market: string | null;
  imageUrl: string | null;
  note: string | null;
  position: number;
  addedBy: Person | null;
  createdAt: string;
  /** Preço de cada mercado, congelado quando o item entrou na lista. */
  priceSnapshot: Record<string, number> | null;
  snapshotAt: string | null;
};

export type ShoppingList = {
  id: number;
  name: string;
  kind: 'general' | 'quick';
  emoji: string;
  /** Lista rápida cadastrada sobrevive ao carrinho; a geral e as de sobra não. */
  reusable: boolean;
  archived: boolean;
  items: ListItem[];
};

export type ListSummary = {
  id: number;
  name: string;
  emoji: string;
  kind: string;
  reusable: boolean;
  itemCount: number;
  updatedAt: string;
};

export type TripItem = {
  id: number;
  productId: number | null;
  name: string;
  qty: number;
  unit: string;
  category: string;
  categoryLabel: string;
  /** Mercado escolhido para o item quando a lista foi montada. */
  market: string | null;
  /** Preço deste item no mercado da compra, pelo retrato da lista. */
  priceHere: number | null;
  /** Se o mercado da compra tem o item. null = não há retrato para consultar. */
  availableHere: boolean | null;
  /** Quando o item foi trocado por um parecido, o que se queria antes. */
  swappedFrom: string | null;
  imageUrl: string | null;
  note: string | null;
  picked: boolean;
  /** Preço corrigido à mão no mercado, quando houver. */
  unitPrice: number | null;
  pickedQty: number | null;
  /** Preço gravado quando a lista foi montada. */
  expected: number | null;
  /** O que vale: o corrigido, senão o da lista. */
  price: number | null;
  corrected: boolean;
  subtotal: number | null;
  pickedBy: Person | null;
  pickedAt: string | null;
};

export type Trip = {
  id: number;
  /** As listas de onde este carrinho foi montado. */
  lists: { id: number | null; name: string; kind: string; reusable: boolean }[];
  listName: string;
  market: string | null;
  marketLabel: string | null;
  status: 'active' | 'done' | 'canceled';
  startedAt: string;
  finishedAt: string | null;
  items: TripItem[];
  progress: {
    total: number;
    picked: number;
    missing: number;
    complete: boolean;
    percent: number;
    withoutPrice: number;
    /** Quantos itens que faltam este mercado não tem. */
    notHere: number;
  };
  missingByCategory: { key: string; label: string; items: TripItem[] }[];
  spent: number;
  remainingEstimate: number;
  estimatedTotal: number;
};

export type TripSummary = {
  id: number;
  listName: string;
  market: string | null;
  marketLabel: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalItems: number;
  pickedItems: number;
  spent: number;
};

export type PricedItem = {
  id: number;
  name: string;
  qty: number;
  unit: string;
  category: string;
  productId: number;
  imageUrl: string | null;
  prices: Record<string, number>;
  cheapestMarket: string;
  cheapestPrice: number;
  price?: number;
  subtotal?: number;
};

export type MarketTotal = {
  key: string;
  label: string;
  color: string;
  total: number;
  covered: number;
  missingCount: number;
  missing: string[];
  complete: boolean;
};

export type Comparison = {
  listId: number;
  listName: string;
  itemCount: number;
  priced: PricedItem[];
  unpriced: { id: number; name: string; qty: number; unit: string; category: string; lastPaid: number | null }[];
  markets: MarketTotal[];
  best: MarketTotal | null;
  split: {
    markets: { key: string; label: string; color: string; total: number; items: PricedItem[] }[];
    total: number;
    covered: number;
    missing: string[];
    /** Custo da divisao restrito aos itens que o melhor mercado unico tambem tem. */
    comparableTotal: number;
    /** Economia real, na mesma cesta, contra ir a um mercado so. */
    savings: number;
    savingsPct: number;
    /** Itens que so existem no segundo mercado, e quanto custam. */
    extraItems: { name: string; subtotal: number; market: string }[];
    extraCost: number;
    comparedTo: { key: string; label: string; total: number } | null;
  } | null;
  worthSplitting: boolean;
  cheapestPossible: number;
};

export type Category = { key: string; label: string; emoji: string; order: number; total: number };

/** Resposta do fecho do carrinho: pegamos tudo, e o que sobrou virou lista. */
export type FinishResult = {
  trip: Trip;
  complete: boolean;
  leftover: { id: number; name: string; itemCount: number } | null;
};
