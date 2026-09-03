import { useStore } from '@/lib/store';

/**
 * A faixa de abertura do Mercado.
 *
 * O topo da tela era so titulo e subtitulo, e sobrava um vazio esquisito antes
 * da busca. Aqui entra a marca, o que o app faz numa linha e os quatro
 * mercados na cor de cada um -- que e a informacao que justifica o app existir.
 *
 * A ilustracao e um SVG desenhado aqui, e nao uma foto: carrega junto do
 * bundle, nao depende de rede (a mesma tela abre no mercado com sinal ruim) e
 * acompanha a paleta sem precisar de retoque quando a cor muda.
 */
export function Hero() {
  const { markets } = useStore();

  return (
    <div className="from-primary relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br to-blue-800 px-4 py-4 text-white shadow-sm md:px-6 md:py-5">
      <div className="relative z-10 max-w-[62%] md:max-w-[70%]">
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase opacity-70">NaCesta</p>
        <h2 className="mt-0.5 text-[19px] leading-tight font-extrabold tracking-tight md:text-2xl">
          Quatro mercados, uma lista
        </h2>
        <p className="mt-1 text-[12.5px] leading-snug opacity-85 md:text-sm">
          O preço de cada rede, lado a lado — e a conta de onde vale a pena fazer a compra.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {markets.map((m) => (
            <span
              key={m.key}
              className="flex items-center gap-1.5 rounded-full bg-white/15 py-0.5 pr-2 pl-1.5 text-[11px] font-semibold backdrop-blur-sm"
            >
              <span className="size-2 rounded-full" style={{ background: m.color }} />
              {m.label}
            </span>
          ))}
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
