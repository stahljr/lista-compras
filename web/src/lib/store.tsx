import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import { escoar, guardar, limparCache, pendentes, recuperar } from './offline';
import type { Category, ListSummary, Market, Person, ShoppingList, Trip } from './types';

type User = {
  id: number;
  name: string;
  email: string;
  color: string;
  householdId: number;
  /** O primeiro cadastro: e quem cria as familias e passa os convites. */
  isAdmin?: boolean;
};

/** A casa (familia) a que esta sessao pertence. */
export type Household = { id: number; name: string };

type Store = {
  user: User | null;
  members: Person[];
  household: Household | null;
  loading: boolean;
  needsSetup: boolean;
  general: ShoppingList | null;
  lists: ListSummary[];
  trip: Trip | null;
  markets: Market[];
  categories: Category[];
  online: boolean;
  pendingWrites: number;
  notePendingWrite: () => void;
  toast: { id: number; msg: string; acao?: { texto: string; href: string } } | null;
  notify: (msg: string, acao?: { texto: string; href: string }) => void;
  dismissToast: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; invite?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshGeneral: () => Promise<void>;
  refreshLists: () => Promise<void>;
  refreshTrip: () => Promise<void>;
  setGeneral: (list: ShoppingList) => void;
  setTrip: (trip: Trip | null) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  // Abre com o ultimo estado conhecido: offline, isso e a diferenca entre ver
  // a lista e ver a tela de login.
  const [user, setUser] = useState<User | null>(() => recuperar<User>('user'));
  const [members, setMembers] = useState<Person[]>(() => recuperar<Person[]>('members') || []);
  const [household, setHousehold] = useState<Household | null>(() => recuperar<Household>('household'));
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [general, setGeneralState] = useState<ShoppingList | null>(() => recuperar<ShoppingList>('general'));
  const [lists, setLists] = useState<ListSummary[]>(() => recuperar<ListSummary[]>('lists') || []);
  const [trip, setTripState] = useState<Trip | null>(() => recuperar<Trip>('trip'));
  const [markets, setMarkets] = useState<Market[]>(() => recuperar<Market[]>('markets') || []);
  const [categories, setCategories] = useState<Category[]>(() => recuperar<Category[]>('categories') || []);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingWrites, setPendingWrites] = useState(() => pendentes());
  const streamRef = useRef<EventSource | null>(null);

  // Tudo que entra no estado tambem e guardado, para o proximo boot offline.
  const setGeneral = useCallback((list: ShoppingList) => {
    setGeneralState(list);
    guardar('general', list);
  }, []);
  const setTrip = useCallback((value: Trip | null) => {
    setTripState(value);
    guardar('trip', value);
  }, []);
  const notePendingWrite = useCallback(() => setPendingWrites(pendentes()), []);

  // Aviso curto de que algo entrou na lista. O botao mudando de texto no
  // cartao se perde de vista quando a pessoa ja rolou a prateleira.
  const [toast, setToast] = useState<Store['toast']>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const notify = useCallback((msg: string, acao?: { texto: string; href: string }) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg, acao });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const refreshGeneral = useCallback(async () => {
    const { list } = await api.get<{ list: ShoppingList }>('/lists/geral');
    setGeneral(list);
  }, [setGeneral]);

  const refreshLists = useCallback(async () => {
    const data = await api.get<{ general: ShoppingList; lists: ListSummary[] }>('/lists');
    setGeneral(data.general);
    setLists(data.lists);
    guardar('lists', data.lists);
  }, [setGeneral]);

  const refreshTrip = useCallback(async () => {
    const { trip: active } = await api.get<{ trip: Trip | null }>('/trips/active');
    setTrip(active);
  }, [setTrip]);

  const loadEverything = useCallback(async () => {
    await Promise.allSettled([
      refreshLists(),
      refreshTrip(),
      api.get<{ markets: Market[] }>('/catalog/markets').then((d) => {
        setMarkets(d.markets);
        guardar('markets', d.markets);
      }),
      api.get<{ categories: Category[] }>('/catalog/categories').then((d) => {
        setCategories(d.categories);
        guardar('categories', d.categories);
      }),
    ]);
  }, [refreshLists, refreshTrip]);

  useEffect(() => {
    let alive = true;
    api
      .get<{ user: User | null; members?: Person[]; household?: Household; needsSetup?: boolean }>('/auth/me')
      .then(async (data) => {
        if (!alive) return;
        setUser(data.user);
        guardar('user', data.user);
        setMembers(data.members || []);
        guardar('members', data.members || []);
        setHousehold(data.household || null);
        guardar('household', data.household || null);
        setNeedsSetup(!!data.needsSetup);
        if (data.user) {
          await escoar();
          setPendingWrites(pendentes());
          await loadEverything();
        }
      })
      // Sem rede a sessao nao pode ser confirmada; segue com o estado guardado
      // em vez de jogar quem esta no mercado de volta para o login.
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [loadEverything]);

  // Sync entre os dois celulares: o servidor avisa e a tela se atualiza sozinha.
  useEffect(() => {
    if (!user) {
      streamRef.current?.close();
      streamRef.current = null;
      return;
    }
    const source = new EventSource('/api/events');
    streamRef.current = source;
    const onGeneral = () => {
      void refreshGeneral();
    };
    const onLists = () => {
      void refreshLists();
    };
    const onTrip = () => {
      void refreshTrip();
    };
    source.addEventListener('general', onGeneral);
    source.addEventListener('lists', onLists);
    source.addEventListener('trip', onTrip);
    return () => source.close();
  }, [user, refreshGeneral, refreshLists, refreshTrip]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      if (!user) return;
      void escoar()
        .then(() => setPendingWrites(pendentes()))
        .then(() => loadEverything());
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [user, loadEverything]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { user: logged } = await api.post<{ user: User }>('/auth/login', { email, password });
      setUser(logged);
      guardar('user', logged);
      const me = await api.get<{ members?: Person[]; household?: Household }>('/auth/me');
      setMembers(me.members || []);
      guardar('members', me.members || []);
      setHousehold(me.household || null);
      guardar('household', me.household || null);
      await loadEverything();
    },
    [loadEverything],
  );

  const register = useCallback(
    async (data: { name: string; email: string; password: string; invite?: string }) => {
      const { user: created } = await api.post<{ user: User }>('/auth/register', data);
      setUser(created);
      guardar('user', created);
      setNeedsSetup(false);
      await loadEverything();
    },
    [loadEverything],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
    setGeneralState(null);
    setLists([]);
    setTripState(null);
    limparCache();
    setPendingWrites(0);
  }, []);

  const value = useMemo<Store>(
    () => ({
      user,
      members,
      household,
      loading,
      needsSetup,
      general,
      lists,
      trip,
      markets,
      categories,
      online,
      pendingWrites,
      notePendingWrite,
      toast,
      notify,
      dismissToast,
      login,
      register,
      logout,
      refreshGeneral,
      refreshLists,
      refreshTrip,
      setGeneral,
      setTrip,
    }),
    [user, members, household, loading, needsSetup, general, lists, trip, markets, categories, online, pendingWrites, notePendingWrite, toast, notify, dismissToast, login, register, logout, refreshGeneral, refreshLists, refreshTrip, setGeneral, setTrip],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore precisa estar dentro de StoreProvider');
  return store;
}
