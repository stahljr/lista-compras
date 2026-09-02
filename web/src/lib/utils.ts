import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes resolvendo conflito do Tailwind: `cn('p-2', 'p-4')` vira `p-4`.
 * E o utilitario que todo componente do shadcn/ui importa de "@/lib/utils".
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
