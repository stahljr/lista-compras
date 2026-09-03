import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ClipboardList, ListChecks, ShoppingCart, Store, User, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { Toast } from '@/components/Toast';
import Login from '@/pages/Login';
import Market from '@/pages/Market';
import List from '@/pages/List';
import Lists from '@/pages/Lists';
import ListDetail from '@/pages/ListDetail';
import Cart from '@/pages/Cart';
import Compare from '@/pages/Compare';
import History from '@/pages/History';
import Profile from '@/pages/Profile';

type Aba = { to: string; label: string; icon: LucideIcon; badge?: number; end?: boolean };

export default function App() {
  const { user, loading, trip, general, online } = useStore();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="border-muted border-t-primary size-6 animate-spin rounded-full border-[2.5px]" />
      </div>
    );
  }

  if (!user) return <Login />;

  const abas: Aba[] = [
    { to: '/', label: 'Mercado', icon: Store, end: true },
    { to: '/lista', label: 'Lista', icon: ClipboardList, badge: general?.items.length || undefined },
    { to: '/listas', label: 'Listas', icon: ListChecks },
    { to: '/carrinho', label: 'Carrinho', icon: ShoppingCart, badge: trip ? trip.progress.missing : undefined },
    { to: '/perfil', label: 'Perfil', icon: User },
  ];

  return (
    <div className="min-h-dvh md:pl-56">
      <Routes>
        <Route path="/" element={<Market />} />
        <Route path="/lista" element={<List />} />
        <Route path="/listas" element={<Lists />} />
        <Route path="/listas/:id" element={<ListDetail />} />
        <Route path="/comparar" element={<Compare />} />
        <Route path="/comparar/:listId" element={<Compare />} />
        <Route path="/carrinho" element={<Cart />} />
        <Route path="/historico" element={<History />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toast />

      {!online && (
        <div className="bg-accent text-accent-foreground fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-lg md:bottom-5 md:left-[calc(50%+7rem)]">
          <WifiOff className="size-3.5" />
          Sem conexão — mostrando o que já tinha
        </div>
      )}

      {/* Embaixo no celular, ao lado no desktop: a mesma navegacao, porque o
          polegar alcanca a base da tela e o mouse nao tem esse limite. */}
      <nav className="bg-card/95 fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:inset-y-0 md:right-auto md:w-56 md:flex-col md:justify-start md:gap-0.5 md:border-t-0 md:border-r md:p-2.5 md:pt-4.5 md:pb-2.5">
        <div className="hidden items-center gap-2.5 px-3 pb-4 md:flex">
          <img src="/icone-192.png" alt="" width={26} height={26} className="rounded-md" />
          <span className="text-sm font-bold tracking-tight">NaCesta</span>
        </div>

        {abas.map(({ to, label, icon: Icon, badge, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors',
                'md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:py-2.5 md:text-sm',
                isActive ? 'text-primary md:bg-secondary' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            <Icon className="size-5 md:size-[18px]" />
            {label}
            {badge ? (
              <span className="bg-primary text-primary-foreground absolute top-1 right-[calc(50%-1.15rem)] grid size-[17px] place-items-center rounded-full text-[10px] font-bold md:static md:ml-auto">
                {badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
