import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Prateleira que rola na horizontal, com setas. Sem elas nao fica claro que ha
 * mais produto do lado -- a faixa parece terminar onde a tela termina. No
 * toque as setas somem, porque ali se rola com o dedo.
 */
export function Shelf({ children }: { children: ReactNode }) {
  const trilha = useRef<HTMLDivElement>(null);
  const [antes, setAntes] = useState(false);
  const [depois, setDepois] = useState(false);

  const medir = useCallback(() => {
    const el = trilha.current;
    if (!el) return;
    setAntes(el.scrollLeft > 8);
    setDepois(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
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
    trilha.current?.scrollBy({ left: direcao * (trilha.current.clientWidth * 0.85), behavior: 'smooth' });
  }

  const seta = 'absolute top-[36%] z-10 hidden size-9 rounded-full shadow-lg [@media(hover:hover)]:flex';

  return (
    <div className="relative">
      {antes && (
        <Button variant="outline" size="icon" className={`${seta} -left-2`} onClick={() => rolar(-1)} aria-label="Voltar">
          <ChevronLeft />
        </Button>
      )}
      <div
        ref={trilha}
        className="grid snap-x snap-proximity auto-cols-[9.5rem] grid-flow-col gap-2.5 overflow-x-auto pb-1.5 [scrollbar-width:none] md:auto-cols-[12rem] md:gap-4 [&::-webkit-scrollbar]:hidden [&>*]:snap-start"
      >
        {children}
      </div>
      {depois && (
        <Button variant="outline" size="icon" className={`${seta} -right-2`} onClick={() => rolar(1)} aria-label="Avançar">
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}
