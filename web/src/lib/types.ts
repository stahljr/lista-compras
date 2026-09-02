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
  imageUrl: string | null;
  unit: string;
  offers: Offer[];
  cheapest: Offer | null;
  marketsCount: number;
};

export type Person = { id: number; name: string; color: string };

export type ListItem = {
  id: number;
  productId: number | null;
  name: string;
  qty: number;
  unit: string;
  category: string;
  imageUrl: string | null;
  note: string | null;
  position: number;
  addedBy: Person | null;
  createdAt: string;
};

export type ShoppingList = {
  id: number;
  name: string;
  kind: 'cart' | 'template';
  emoji: string;
  archived: boolean;
  items: ListItem[];
};

export type ListSummary = {
  id: number;
  name: string;
  emoji: string;
  kind: string;
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
  imageUrl: string | null;
  note: string | null;
  picked: boolean;
  unitPrice: number | null;
  pickedQty: number | null;
  expected: number | null;
  subtotal: number | null;
  pickedBy: Person | null;
  pickedAt: string | null;
};

export type Trip = {
  id: number;
  listId: number | null;
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
    pickedWithoutPrice: number;
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
