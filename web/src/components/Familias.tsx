import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Home, KeyRound, Plus, RefreshCw, Trash2, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Banner, Field, Row, RowBody, RowMeta, RowName, SectionTitle } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';

type Membro = { id: number; name: string; email: string; color: string; admin: boolean };
type Familia = { id: number; name: string; inviteCode: string | null; listCount: number; members: Membro[] };

/**
 * As familias, para quem administra.
 *
 * Cada familia e uma fronteira de dados: a lista de uma nao aparece na tela da
 * outra, e isso vale para quem administra tambem -- ele distribui convites, nao
 * enxerga compras. O convite e o que decide onde a pessoa cai ao se cadastrar.
 */
export function Familias() {
  const { user, notify } = useStore();
  const [familias, setFamilias] = useState<Familia[] | null>(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [copiado, setCopiado] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const d = await api.get<{ households: Familia[] }>('/households');
      setFamilias(d.households);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para carregar as famílias');
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) void carregar();
  }, [user?.isAdmin, carregar]);

  if (!user?.isAdmin) return null;

  async function criar() {
    setErro('');
    try {
      await api.post('/households', { name: nome.trim() });
      setNome('');
      setCriando(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para criar');
    }
  }

  async function novoCodigo(id: number) {
    try {
      await api.post(`/households/${id}/invite`);
      await carregar();
      notify('Convite novo gerado — o anterior deixou de valer');
    } catch {
      setErro('não deu para gerar o convite');
    }
  }

  async function fechar(id: number) {
    try {
      await api.del(`/households/${id}/invite`);
      await carregar();
      notify('Família fechada para novos cadastros');
    } catch {
      setErro('não deu para fechar');
    }
  }

  async function apagar(id: number) {
    setErro('');
    try {
      await api.del(`/households/${id}`);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não deu para apagar');
    }
  }

  async function copiar(familia: Familia) {
    if (!familia.inviteCode) return;
    try {
      await navigator.clipboard.writeText(familia.inviteCode);
      setCopiado(familia.id);
      window.setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sem permissao de area de transferencia: o codigo esta na tela mesmo.
      notify(`Convite: ${familia.inviteCode}`);
    }
  }

  return (
    <>
      <SectionTitle
        action={
          <Button size="sm" variant="outline" onClick={() => setCriando(true)}>
            <Plus />
            Nova
          </Button>
        }
      >
        Famílias
      </SectionTitle>

      <p className="text-muted-foreground mb-2 px-1 text-xs">
        Cada família tem a lista, o carrinho e o histórico dela — nada atravessa de uma para a outra, nem para você.
        Quem se cadastra com o convite de uma família entra nela.
      </p>

      {erro && (
        <Banner tom="danger" icon={<X />} className="mb-3">
          {erro}
        </Banner>
      )}

      <div className="flex flex-col gap-3">
        {(familias || []).map((familia) => (
          <Card key={familia.id} className="gap-0 p-3.5">
            <div className="flex items-center gap-2">
              <Home className="text-muted-foreground size-4 shrink-0" />
              <strong className="min-w-0 flex-1 truncate text-[15px]">{familia.name}</strong>
              {familia.members.some((m) => m.id === user.id) && <Badge variant="secondary">a sua</Badge>}
            </div>

            <div className="mt-2.5 overflow-hidden rounded-xl border">
              {familia.members.length ? (
                familia.members.map((m) => (
                  <Row key={m.id} className="px-2.5 py-2">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                      style={{ background: m.color }}
                    >
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                    <RowBody>
                      <RowName className="text-[13.5px]">{m.name}</RowName>
                      <RowMeta>{m.email}</RowMeta>
                    </RowBody>
                    {m.admin && <Badge variant="secondary">admin</Badge>}
                  </Row>
                ))
              ) : (
                <p className="text-muted-foreground px-2.5 py-2.5 text-xs">
                  Ninguém ainda. Passe o convite abaixo para quem vai usar.
                </p>
              )}
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <KeyRound className="text-muted-foreground size-4 shrink-0" />
              {familia.inviteCode ? (
                <button
                  type="button"
                  onClick={() => void copiar(familia)}
                  className="bg-muted hover:bg-secondary flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-[13px] font-bold tracking-wider"
                  aria-label="Copiar convite"
                >
                  {familia.inviteCode}
                  {copiado === familia.id ? (
                    <Check className="text-success size-3.5" />
                  ) : (
                    <Copy className="size-3.5 opacity-60" />
                  )}
                </button>
              ) : (
                <span className="text-muted-foreground text-xs">fechada para novos cadastros</span>
              )}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Gerar convite novo" onClick={() => void novoCodigo(familia.id)}>
                  <RefreshCw />
                </Button>
                {familia.inviteCode && (
                  <Button variant="ghost" size="icon" aria-label="Fechar para cadastros" onClick={() => void fechar(familia.id)}>
                    <X />
                  </Button>
                )}
                {!familia.members.length && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label="Apagar família"
                    onClick={() => void apagar(familia.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {familias && !familias.length && (
          <p className="text-muted-foreground px-1 text-sm">
            <UserRound className="mr-1 inline size-4 align-[-3px]" />
            Nenhuma família ainda.
          </p>
        )}
      </div>

      {criando && (
        <Sheet
          title="Nova família"
          subtitle="Ela nasce com um convite. Quem usar esse convite entra nela — e não vê as outras."
          onClose={() => setCriando(false)}
        >
          <Field label="Nome" hint="Como você identifica essa casa: “Casa da mãe”, “Apê”…">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Casa da mãe" autoFocus />
          </Field>
          <Button size="lg" className="w-full" disabled={nome.trim().length < 2} onClick={() => void criar()}>
            Criar família
          </Button>
        </Sheet>
      )}
    </>
  );
}
