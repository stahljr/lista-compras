import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import Login from './pages/Login';
import List from './pages/List';
import Market from './pages/Market';
import Lists from './pages/Lists';
import ListDetail from './pages/ListDetail';
import Cart from './pages/Cart';
import Compare from './pages/Compare';
import History from './pages/History';
import Profile from './pages/Profile';

export default function App() {
  const { user, loading, trip, general, online } = useStore();

  if (loading) {
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return <Login />;

  const listCount = general?.items.length ?? 0;
  const tripPending = trip ? trip.progress.missing : 0;

  return (
    <div className="app">
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

      {!online && <div className="offline-pill">Sem conexão — mostrando o que já tinha</div>}

      <nav className="tabbar">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">🏪</span>
          Mercado
        </NavLink>
        <NavLink to="/lista" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">📝</span>
          Lista
          {listCount > 0 && <span className="dot">{listCount}</span>}
        </NavLink>
        <NavLink to="/listas" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">📋</span>
          Listas
        </NavLink>
        <NavLink to="/carrinho" className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ico">🛒</span>
          Carrinho
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
