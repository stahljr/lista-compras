import { Check } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/**
 * A faixa de abertura do Mercado.
 *
 * O topo da tela era so titulo e subtitulo, e sobrava um vazio esquisito antes
 * da busca. Aqui entra o que o app faz numa linha e os quatro mercados na cor
 * de cada um -- que e a informacao que justifica o app existir.
 *
 * Os mercados nao sao enfeite: tocar num deles recorta a tela inteira para
 * aquela rede, e da para marcar dois ("hoje eu vou no Angeloni e no Festval").
 * Ficar aqui, escrito e colorido, e o que impede o filtro de ser um estado
 * escondido -- da uma olhada e ve onde esta comprando.
 *
 * A ilustracao e um SVG desenhado aqui, e nao uma foto: carrega junto do
 * bundle, nao depende de rede (a mesma tela abre no mercado com sinal ruim) e
 * acompanha a paleta sem precisar de retoque quando a cor muda.
 */
export function Hero({
  escolhidos,
  onAlternar,
}: {
  escolhidos: string[];
  onAlternar: (chave: string) => void;
}) {
  const { markets } = useStore();
  const filtrando = escolhidos.length > 0;

  return (
    <div className="from-primary relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br to-blue-800 px-4 py-4 text-white shadow-sm md:px-6 md:py-5">
      <div className="relative z-10 max-w-[62%] md:max-w-[70%]">
        <h2 className="text-[19px] leading-tight font-extrabold tracking-tight md:text-2xl">
          Quatro mercados, uma lista
        </h2>
        <p className="mt-1 text-[12.5px] leading-snug opacity-85 md:text-sm">
          {filtrando
            ? 'Mostrando só o que essas redes têm. Toque para soltar.'
            : 'O preço de cada rede, lado a lado — toque num mercado para ver só o dele.'}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {markets.map((m) => {
            const ligado = escolhidos.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={ligado}
                aria-label={`${ligado ? 'Tirar' : 'Ver só'} ${m.label}`}
                onClick={() => onAlternar(m.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-[11px] font-semibold backdrop-blur-sm transition-colors active:scale-[0.97]',
                  ligado
                    ? 'bg-white text-blue-900 shadow-sm'
                    : 'bg-white/15 hover:bg-white/25',
                  // Com um mercado ligado, os outros recuam: o que esta valendo
                  // tem de ser obvio de longe.
                  filtrando && !ligado && 'opacity-60',
                )}
              >
                {ligado ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : (
                  <span className="size-2 rounded-full" style={{ background: m.color }} />
                )}
                {m.label}
                {/* O atacado nao e um mercado a mais, e outro tipo de compra:
                    fardo em vez de unidade. Dizer isso na propria etiqueta
                    evita a comparacao errada antes de ela acontecer. */}
                {m.wholesale && (
                  <span className={cn('text-[9px] font-bold tracking-wide uppercase', ligado ? 'text-blue-900/60' : 'opacity-70')}>
                    atacado
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Uma gondola: duas prateleiras com produtos, do jeito que o app olha o
          mercado -- por corredor. */}
      <svg
        viewBox="0 0 140 120"
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 bottom-0 h-full w-[9.5rem] opacity-90 md:w-48"
      >
        <g fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round">
          <path d="M14 46h112M14 86h112" />
          <path d="M20 30v76M120 30v76" />
        </g>
        <g fill="white" fillOpacity="0.9">
          <rect x="28" y="22" width="16" height="24" rx="3" />
          <path d="M56 46V32c0-2 1-3 3-4l1-4h6l1 4c2 1 3 2 3 4v14z" />
          <rect x="80" y="26" width="20" height="20" rx="4" />
          <rect x="106" y="30" width="10" height="16" rx="2" fillOpacity="0.6" />
          <rect x="30" y="66" width="22" height="20" rx="4" fillOpacity="0.75" />
          <path d="M64 86V72c0-2 1-3 3-4l1-4h6l1 4c2 1 3 2 3 4v14z" fillOpacity="0.85" />
          <circle cx="98" cy="76" r="10" fillOpacity="0.8" />
        </g>
      </svg>
    </div>
  );
}
