import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { Sheet } from '../components/Sheet';

export default function Profile() {
  const { user, members, markets, logout } = useStore();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'password' | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const installed = window.matchMedia('(display-mode: standalone)').matches;

  return (
    <>
      <header className="topbar">
        <div className="grow">
          <h1>Perfil</h1>
          <p className="sub">{user?.email}</p>
        </div>
      </header>

      <main className="page">
        {message && (
          <div className="banner ok">
            <span>✅</span>
            <span>{message}</span>
          </div>
        )}

        <div className="section-title">Quem usa esta lista</div>
        <div className="card">
          {members.map((m) => (
            <div className="item" key={m.id}>
              <div className="thumb thumb-fallback" style={{ background: m.color, color: '#fff', fontSize: 16, fontWeight: 700 }}>
                {m.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="body">
                <div className="name">{m.name}</div>
                <div className="meta">{m.id === user?.id ? 'você' : 'compartilha o carrinho com você'}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="small faint" style={{ margin: '8px 4px 0' }}>
          Para outra pessoa entrar, passe o código de convite definido em <code>INVITE_CODE</code> no servidor.
        </p>

        <div className="section-title">Mercados consultados</div>
        <div className="card">
          {markets.map((m) => (
            <div className="item" key={m.key}>
              <span style={{ width: 8, height: 30, borderRadius: 4, background: m.color, flex: 'none' }} />
              <div className="body">
                <div className="name">{m.label}</div>
                <div className="meta">
                  <a href={m.site} target="_blank" rel="noreferrer">
                    {m.site.replace('https://', '')}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="section-title">Este app</div>
        <div className="card">
          <button className="item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }} onClick={() => navigate('/historico')}>
            <div className="thumb thumb-fallback">🧾</div>
            <div className="body">
              <div className="name">Compras anteriores</div>
              <div className="meta">o que já foi gasto em cada ida</div>
            </div>
            <span className="faint">→</span>
          </button>
          <button className="item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left' }} onClick={() => setSheet('password')}>
            <div className="thumb thumb-fallback">🔒</div>
            <div className="body">
              <div className="name">Trocar senha</div>
            </div>
            <span className="faint">→</span>
          </button>
        </div>

        {!installed && (
          <div className="banner info" style={{ marginTop: 14 }}>
            <span>📲</span>
            <span>
              Dá para instalar no celular: no menu do navegador, escolha <strong>Adicionar à tela de início</strong>.
            </span>
          </div>
        )}

        <button className="btn btn-danger btn-block" style={{ marginTop: 18 }} onClick={() => void logout()}>
          Sair da conta
        </button>
      </main>

      {sheet === 'password' && (
        <Sheet title="Trocar senha" onClose={() => setSheet(null)}>
          <label className="field">
            <span>Senha atual</span>
            <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>Nova senha</span>
            <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} />
          </label>
          {error && (
            <div className="banner danger">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
          <button
            className="btn btn-primary btn-block btn-lg"
            disabled={next.length < 8 || !current}
            onClick={async () => {
              setError('');
              try {
                await api.post('/auth/password', { current, next });
                setCurrent('');
                setNext('');
                setSheet(null);
                setMessage('Senha trocada.');
                window.setTimeout(() => setMessage(''), 2600);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'não deu para trocar');
              }
            }}
          >
            Salvar nova senha
          </button>
        </Sheet>
      )}
    </>
  );
}
