import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Download, Lock, Receipt, Smartphone, TriangleAlert, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Banner, Field, Page, Row, RowBody, RowMeta, RowName, SectionTitle, Topbar } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { Familias } from '@/components/Familias';

export default function Profile() {
  const { user, members, household, markets, logout, refreshLists } = useStore();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'password' | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const arquivo = useRef<HTMLInputElement>(null);

  const installed = window.matchMedia('(display-mode: standalone)').matches;

  function avisar(texto: string) {
    setMessage(texto);
    window.setTimeout(() => setMessage(''), 4000);
  }

  /**
   * O backup e um arquivo de texto no celular de quem usa. Serve para trocar de
   * hospedagem e, em plano sem disco, para nao perder a lista no proximo deploy.
   */
  async function baixarBackup() {
    setError('');
    try {
      const dump = await api.get<unknown>('/backup');
      const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `lista-compras-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      avisar('Backup baixado. Guarde o arquivo fora do servidor.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'não deu para baixar o backup');
    }
  }

  async function restaurarBackup(file: File) {
    setError('');
    try {
      const dump = JSON.parse(await file.text());
      const r = await api.post<{ listas: number; itens: number; precos: number }>('/backup/restore', dump);
      await refreshLists();
      const partes = [`${r.itens} ${r.itens === 1 ? 'item' : 'itens'}`];
      if (r.listas) partes.push(`${r.listas} ${r.listas === 1 ? 'lista nova' : 'listas novas'}`);
      if (r.precos) partes.push(`${r.precos} preços do histórico`);
      avisar(`Restaurado: ${partes.join(', ')}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'arquivo de backup inválido');
    }
  }

  const opcoes = [
    { icone: <Receipt />, nome: 'Compras anteriores', apoio: 'o que já foi gasto em cada ida', ação: () => navigate('/historico') },
    { icone: <Lock />, nome: 'Trocar senha', apoio: null, ação: () => setSheet('password') },
    { icone: <Download />, nome: 'Baixar backup', apoio: 'as listas e o histórico num arquivo', ação: () => void baixarBackup() },
    {
      icone: <Upload />,
      nome: 'Restaurar backup',
      apoio: 'acrescenta o que falta, não substitui',
      ação: () => arquivo.current?.click(),
    },
  ];

  return (
    <>
      <Topbar title="Perfil" subtitle={household ? `${household.name} · ${user?.email}` : user?.email} />

      <Page className="max-w-3xl">
        {message && (
          <Banner tom="ok" icon={<Check />} className="mb-3">
            {message}
          </Banner>
        )}
        {error && !sheet && (
          <Banner tom="danger" icon={<TriangleAlert />} className="mb-3">
            {error}
          </Banner>
        )}

        <SectionTitle>{household ? household.name : 'Quem usa esta lista'}</SectionTitle>
        <Card className="overflow-hidden py-0">
          {members.map((m) => (
            <Row key={m.id}>
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl text-base font-bold text-white"
                style={{ background: m.color }}
              >
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <RowBody>
                <RowName>{m.name}</RowName>
                <RowMeta>{m.id === user?.id ? 'você' : 'compartilha o carrinho com você'}</RowMeta>
              </RowBody>
            </Row>
          ))}
        </Card>
        <p className="text-muted-foreground mt-2 px-1 text-xs">
          {user?.isAdmin
            ? 'Para outra pessoa entrar nesta casa, passe o convite dela — está logo abaixo, em Famílias.'
            : 'Para outra pessoa entrar nesta casa, peça o convite a quem administra o app.'}
        </p>

        <Familias />

        <SectionTitle>Mercados consultados</SectionTitle>
        <Card className="overflow-hidden py-0">
          {markets.map((m) => (
            <Row key={m.key}>
              <span className="h-7 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
              <RowBody>
                <RowName>{m.label}</RowName>
                <RowMeta>
                  <a href={m.site} target="_blank" rel="noreferrer" className="hover:underline">
                    {m.site.replace('https://', '')}
                  </a>
                </RowMeta>
              </RowBody>
            </Row>
          ))}
        </Card>

        <SectionTitle>Este app</SectionTitle>
        <Card className="overflow-hidden py-0">
          {opcoes.map((o) => (
            <Row key={o.nome} onClick={o.ação}>
              <span className="text-muted-foreground grid size-11 shrink-0 place-items-center rounded-xl border bg-neutral-50 [&>svg]:size-5">
                {o.icone}
              </span>
              <RowBody>
                <RowName>{o.nome}</RowName>
                {o.apoio && <RowMeta>{o.apoio}</RowMeta>}
              </RowBody>
              <ChevronRight className="text-muted-foreground/60 size-4 shrink-0" />
            </Row>
          ))}
        </Card>
        <input
          ref={arquivo}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void restaurarBackup(file);
          }}
        />

        {!installed && (
          <Banner icon={<Smartphone />} className="mt-4">
            Dá para instalar no celular: no menu do navegador, escolha <strong>Adicionar à tela de início</strong>.
          </Banner>
        )}

        <Button variant="outline" className="text-destructive hover:bg-destructive/10 mt-5 w-full" onClick={() => void logout()}>
          Sair da conta
        </Button>
      </Page>

      {sheet === 'password' && (
        <Sheet title="Trocar senha" onClose={() => setSheet(null)}>
          <Field label="Senha atual">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Nova senha" hint="Ao menos 8 caracteres.">
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={8}
            />
          </Field>
          {error && (
            <Banner tom="danger" icon={<TriangleAlert />} className="mb-3">
              {error}
            </Banner>
          )}
          <Button
            size="lg"
            className="w-full"
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
          </Button>
        </Sheet>
      )}
    </>
  );
}
