import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Prateleira que rola na horizontal, com setas. Sem elas nao fica claro que ha
 * mais produto do lado -- num toque a faixa parece terminar onde a tela
 * termina.
 */
export function Shelf({ children }: { children: ReactNode }) {
  const trilha = useRef<HTMLDivElement>(null);
  const [temAntes, setTemAntes] = useState(false);
  const [temDepois, setTemDepois] = useState(false);

  const medir = useCallback(() => {
    const el = trilha.current;
    if (!el) return;
    setTemAntes(el.scrollLeft > 8);
    setTemDepois(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    medir();
    const el = trilha.current;
    if (!el) return;
    el.addEventListener('scroll', medir, { passive: true });
    window.addEventListener('resize', medir);
    return () => {
      el.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
    };
  }, [medir]);

  function rolar(direcao: -1 | 1) {
    const el = trilha.current;
    if (!el) return;
    // Rola quase uma tela cheia, deixando um cartao a vista como referencia.
    el.scrollBy({ left: direcao * (el.clientWidth * 0.85), behavior: 'smooth' });
  }

  return (
    <div className="prateleira-wrap">
      {temAntes && (
        <button className="prateleira-seta esquerda" onClick={() => rolar(-1)} aria-label="Voltar">
          ‹
        </button>
      )}
      <div className="prateleira" ref={trilha}>
        {children}
      </div>
      {temDepois && (
        <button className="prateleira-seta direita" onClick={() => rolar(1)} aria-label="Avançar">
          ›
        </button>
      )}
    </div>
  );
}
