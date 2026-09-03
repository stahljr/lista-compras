import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Painel que sobe de baixo no celular e vira caixa central no desktop. */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="bg-card animate-[sobe_0.22s_ease-out] max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-3.5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg leading-tight font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="text-muted-foreground mt-0.5 text-[13px]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-foreground hover:bg-muted -mt-1 -mr-1 rounded-lg p-1.5"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
