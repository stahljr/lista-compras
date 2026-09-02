import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useStore } from '@/lib/store';

/** Aviso curto no rodape, com um atalho para onde o item foi. */
export function Toast() {
  const { toast, dismissToast } = useStore();
  const navigate = useNavigate();
  if (!toast) return null;
  return (
    <div
      role="status"
      key={toast.id}
      className="bg-foreground text-background fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[min(28rem,calc(100vw-1.75rem))] -translate-x-1/2 animate-[sobe_0.22s_ease-out] items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold shadow-2xl md:bottom-6 md:left-[calc(50%+7rem)]"
    >
      <Check className="text-success size-4 shrink-0" />
      <span className="truncate">{toast.msg}</span>
      {toast.acao && (
        <button
          className="text-primary shrink-0 px-1 font-bold"
          onClick={() => {
            dismissToast();
            navigate(toast.acao!.href);
          }}
        >
          {toast.acao.texto}
        </button>
      )}
    </div>
  );
}
