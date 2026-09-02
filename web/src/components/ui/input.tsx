import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground/80 selection:bg-primary selection:text-primary-foreground',
        'bg-muted/60 border-input flex h-10 w-full min-w-0 rounded-lg border px-3.5 py-2 text-[15px] shadow-xs transition-[color,box-shadow]',
        'focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] focus-visible:bg-card outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
