import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Cabecalho fixo da tela: titulo, uma linha de apoio e acoes a direita. */
export function Topbar({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="bg-card/95 sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-[92rem] items-center gap-3 px-4 py-3.5 md:px-7">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl leading-tight font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-0.5 truncate text-[13px]">{subtitle}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

/** Corpo da tela, com folga embaixo para a barra de abas do celular. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('mx-auto w-full max-w-[92rem] px-4 pt-3.5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:px-7 md:pt-5 md:pb-12', className)}>
      {children}
    </main>
  );
}

/** Titulo de secao, com uma acao opcional na ponta. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-3 flex items-baseline gap-3 first:mt-1">
      <h2 className="text-lg font-bold tracking-tight">{children}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

/** Estado vazio: icone, o que aconteceu e o que fazer a respeito. */
export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="py-14 text-center">
      <div className="text-muted-foreground/50 mb-3 flex justify-center [&>svg]:size-10">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <div className="text-muted-foreground mx-auto mt-1.5 max-w-md text-sm">{children}</div>}
    </div>
  );
}
