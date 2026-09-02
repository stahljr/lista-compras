import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';

/** Aviso curto no rodape, com um atalho para onde o item foi. */
export function Toast() {
  const { toast, dismissToast } = useStore();
  const navigate = useNavigate();
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span className="msg">{toast.msg}</span>
      {toast.acao && (
        <button
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
