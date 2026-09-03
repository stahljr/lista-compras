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

/**
 * Uma linha dentro de um Card: foto ou icone, corpo de texto e acao na ponta.
 * As seis telas que listam coisas (listas, carrinho, historico, perfil...)
 * usavam a mesma regra de CSS antiga; virou este punhado de componentes para
 * nao repetir uma dezena de utilitarios em cada arquivo.
 */
export function Row({
  children,
  className,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const base = 'flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0';
  if (!onClick) return <div className={cn(base, className)}>{children}</div>;
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={cn(base, 'hover:bg-muted/50 transition-colors', className)}>
      {children}
    </button>
  );
}

/** O meio da linha: o que pode encolher e truncar. */
export function RowBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0 flex-1', className)}>{children}</div>;
}

export function RowName({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('truncate text-sm leading-snug font-semibold', className)}>{children}</div>;
}

/** A linha de apoio: quantidade, quem colocou, etiquetas. */
export function RowMeta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', className)}>
      {children}
    </div>
  );
}

const TOM = {
  ok: 'bg-success/10 text-success',
  warn: 'bg-accent/20 text-accent-foreground',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
};

/** Aviso dentro da tela: o que aconteceu, em uma frase. */
export function Banner({
  tom = 'info',
  icon,
  children,
  className,
}: {
  tom?: keyof typeof TOM;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium', TOM[tom], className)}>
      {icon && <span className="mt-px shrink-0 [&>svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Campo de formulario: rotulo em cima, controle embaixo. */
export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground mt-1 block text-xs">{hint}</span>}
    </label>
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
