import { useState } from 'react';
import { useStore } from '../lib/store';

export default function Login() {
  const { login, register, needsSetup } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>(needsSetup ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ name, email, password, invite: invite || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não foi possível entrar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 420, paddingTop: 40 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img src="/icone-192.png" alt="" width={64} height={64} style={{ borderRadius: 16 }} />
        <h1 style={{ margin: '14px 0 4px', fontSize: 22 }}>Nossa lista de compras</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Angeloni, Festval, Muffato e Condor num só lugar
        </p>
      </div>

      <div className="card card-pad">
        {needsSetup && mode === 'register' && (
          <div className="banner info">
            <span>👋</span>
            <span>Primeira vez aqui: esta conta vira a dona da casa. Depois é só passar o código de convite para a Camila.</span>
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span>Seu nome</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label className="field">
            <span>E-mail</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </label>
          {mode === 'register' && !needsSetup && (
            <label className="field">
              <span>Código de convite</span>
              <input className="input" value={invite} onChange={(e) => setInvite(e.target.value)} required />
            </label>
          )}

          {error && (
            <div className="banner danger">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        {!needsSetup && (
          <button
            className="btn btn-ghost btn-block"
            style={{ marginTop: 8 }}
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'Tenho um convite, quero criar conta' : 'Já tenho conta'}
          </button>
        )}
      </div>
    </div>
  );
}
