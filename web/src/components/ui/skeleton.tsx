import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

/**
 * Placeholder com brilho passando. Em vez do "pulse" do shadcn, o brilho
 * varrendo -- e o que se ve nas galerias e cai melhor em foto de produto, que
 * e o que mais demora a chegar aqui.
 */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'bg-muted relative overflow-hidden rounded-md',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[brilho_1.4s_infinite]',
        'after:bg-gradient-to-r after:from-transparent after:via-foreground/8 after:to-transparent',
        'motion-reduce:after:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
