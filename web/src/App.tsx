import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import Login from './pages/Login';
import Cart from './pages/Cart';
import Search from './pages/Search';
import Lists from './pages/Lists';
import ListDetail from './pages/ListDetail';
import Trip from './pages/Trip';
import Compare from './pages/Compare';
import History from './pages/History';
import Profile from './pages/Profile';

export default function App() {
  const { user, loading, trip, cart, online } = useStore();

  if (loading) {
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return <Login />;

  const cartCount = cart?.items.length ?? 0;
  const tripPending = trip ? trip.progress.missing : 0;

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Cart />} />
        <Route path="/buscar" element={<Search />} />
        <Route path="/listas" element={<Lists />} />
        <Route path="/listas/:id" element={<ListDetail />} />
        <Route path="/comparar" element={<Compare />} />
        <Route path="/comparar/:listId" element={<Compare />} />
        <Route path="/compra" element={<Trip />} />
        <Route path="/historico" element={<History />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!online && <div className="offline-pill">Sem conexão — mostrando o que já tinha</div>}

      <nav className="tabbar">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">🛒</span>
          Carrinho
          {cartCount > 0 && <span className="dot">{cartCount}</span>}
        </NavLink>
        <NavLink to="/buscar" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">🔍</span>
          Buscar
        </NavLink>
        <NavLink to="/listas" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">📋</span>
          Listas
        </NavLink>
        <NavLink to="/compra" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">✅</span>
          Compra
          {trip && <span className="dot">{tripPending}</span>}
        </NavLink>
        <NavLink to="/perfil" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">👤</span>
          Perfil
        </NavLink>
      </nav>
    </div>
  );
}
