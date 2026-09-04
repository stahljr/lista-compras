import { useState } from 'react';
import { Check, RefreshCw, Search, Store, Tag } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { money } from '@/lib/format';
import { Row, RowBody, RowName, RowMeta } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';

/**
 * Onde comprar este item.
 *
 * Era um <select> do sistema: cinza, com a setinha, e do tamanho errado em cada
 * aparelho. Virou uma etiqueta que mostra a escolha na cor do mercado e abre
 * uma folha com os quatro -- e com o preco de cada um, quando se sabe, porque
 * a escolha quase sempre e feita olhando o preco.
 *
 * "Onde for mais barato" continua sendo o padrao: fixar um mercado e uma
 * decisao ("este eu quero no Muffato"), nao a regra geral.
 */
export function SeletorDeMercado({
  valor,
  precos,
  titulo,
  onChange,
  onProcurar,
  className,
}: {
  valor: string | null;
  /** Preco por mercado, quando conhecido: { muffato: 8.5, ... } */
  precos?: Record<string, number> | null;
  titulo?: string;
  onChange: (market: string | null) => void;
  /** Manda o servidor consultar os mercados que ainda nao responderam. */
  onProcurar?: () => Promise<void>;
  className?: string;
}) {
  const { markets } = useStore();
  const [aberto, setAberto] = useState(false);
  const [procurando, setProcurando] = useState(false);
  const escolhido = markets.find((m) => m.key === valor);
  const disponiveis = precos ? Object.entries(precos).filter(([, v]) => typeof v === 'number' && v > 0) : [];
  const barato = disponiveis.length ? Math.min(...disponiveis.map(([, v]) => v)) : null;
  const faltando = markets.filter((m) => !precos?.[m.key]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={titulo ? `Mercado de ${titulo}` : 'Escolher mercado'}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
          escolhido ? 'border-transparent text-white' : 'text-muted-foreground hover:bg-muted',
          className,
        )}
        style={escolhido ? { background: escolhido.color } : undefined}
      >
        {escolhido ? <Store className="size-3" /> : <Tag className="size-3" />}
        {escolhido ? escolhido.label : 'mais barato'}
      </button>

      {aberto && (
        <Sheet
          title="Onde comprar este item"
          subtitle={titulo}
          onClose={() => setAberto(false)}
        >
          <div className="-mx-1">
            <Row
              onClick={() => {
                onChange(null);
                setAberto(false);
              }}
              className="rounded-lg px-2"
            >
              <Tag className="text-muted-foreground size-4 shrink-0" />
              <RowBody>
                <RowName>Onde for mais barato</RowName>
                <RowMeta>o app decide na hora de comparar</RowMeta>
              </RowBody>
              {!valor && <Check className="text-primary size-4 shrink-0" />}
            </Row>

            {markets.map((m) => {
              const preco = precos?.[m.key];
              return (
                <Row
                  key={m.key}
                  onClick={() => {
                    onChange(m.key);
                    setAberto(false);
                  }}
                  className="rounded-lg px-2"
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                  <RowBody>
                    <RowName>{m.label}</RowName>
                    {precos && (
                      <RowMeta>
                        {preco ? (
                          <span className={cn('tabular-nums', preco === barato && 'text-success font-bold')}>
                            {money(preco)}
                            {preco === barato && disponiveis.length > 1 ? ' · mais barato' : ''}
                          </span>
                        ) : (
                          /* Antes dizia "não tem este item", e isso afirmava
                             uma coisa que o app nao sabe: mercado sem preco
                             aqui pode ser mercado que nunca foi consultado --
                             era o caso de todo produto sem codigo de barras.
                             "Sem preco daqui" e o que se sabe de verdade. */
                          'sem preço daqui'
                        )}
                      </RowMeta>
                    )}
                  </RowBody>
                  {valor === m.key && <Check className="text-primary size-4 shrink-0" />}
                </Row>
              );
            })}
          </div>

          {/* Mercado sem preco pode ser mercado que nunca foi consultado. Este
              botao manda o servidor ir perguntar -- por codigo de barras e,
              quando nao ha um, pelo nome. E o que fecha o buraco em que caia
              tudo o que se vende a peso. */}
          {onProcurar && faltando.length > 0 && (
            <button
              type="button"
              disabled={procurando}
              onClick={async () => {
                setProcurando(true);
                try {
                  await onProcurar();
                } finally {
                  setProcurando(false);
                }
              }}
              className="hover:bg-muted mt-3 flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-[13px] font-semibold disabled:opacity-60"
            >
              {procurando ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}
              {procurando
                ? 'Perguntando aos mercados…'
                : `Procurar em ${faltando.length === 1 ? faltando[0].label : `${faltando.length} mercados`}`}
            </button>
          )}
        </Sheet>
      )}
    </>
  );
}
