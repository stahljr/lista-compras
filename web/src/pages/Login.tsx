import { useState } from 'react';
import { Hand, TriangleAlert } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Banner, Field } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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
    <div className="mx-auto w-full max-w-[26rem] px-4 pt-10 pb-16">
      <div className="mb-6 text-center">
        <img src="/icone-192.png" alt="" width={64} height={64} className="mx-auto rounded-2xl shadow-sm" />
        <h1 className="mt-3.5 text-[22px] leading-tight font-bold tracking-tight">Nossa lista de compras</h1>
        <p className="text-muted-foreground mt-1 text-sm">Angeloni, Festval, Muffato e Condor num só lugar</p>
      </div>

      <Card className="gap-0 p-5">
        {needsSetup && mode === 'register' && (
          <Banner icon={<Hand />} className="mb-4">
            Primeira vez aqui: esta conta vira a dona da casa. Depois é só passar o código de convite para a outra
            pessoa.
          </Banner>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <Field label="Seu nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
          )}
          <Field label="E-mail">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </Field>
          <Field label="Senha" hint={mode === 'register' ? 'Ao menos 8 caracteres.' : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </Field>
          {mode === 'register' && !needsSetup && (
            <Field label="Código de convite" hint="Quem já usa o app passa esse código para você.">
              <Input value={invite} onChange={(e) => setInvite(e.target.value)} required />
            </Field>
          )}

          {error && (
            <Banner tom="danger" icon={<TriangleAlert />} className="mb-3">
              {error}
            </Banner>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>

        {!needsSetup && (
          <Button
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'Tenho um convite, quero criar conta' : 'Já tenho conta'}
          </Button>
        )}
      </Card>
    </div>
  );
}
