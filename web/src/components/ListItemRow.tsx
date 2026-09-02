import { quantity } from '../lib/format';
import { useStore } from '../lib/store';
import { Thumb } from './Thumb';
import type { ListItem } from '../lib/types';

/** Uma linha do carrinho/lista: foto, nome, quem colocou e o +/- da quantidade. */
export function ListItemRow({
  item,
  onQty,
  onRemove,
  onMarket,
  showWho = true,
}: {
  item: ListItem;
  onQty: (qty: number) => void;
  onRemove: () => void;
  /** Fixa (ou solta) o mercado onde este item deve ser comprado. */
  onMarket?: (market: string | null) => void;
  showWho?: boolean;
}) {
  const { markets } = useStore();
  const escolhido = markets.find((m) => m.key === item.market);
  return (
    <div className="item">
      <Thumb src={item.imageUrl} category={item.category} alt={item.name} />
      <div className="body">
        <div className="name">{item.name}</div>
        <div className="meta">
          {item.unit !== 'un' && <span>{item.unit}</span>}
          {onMarket && (
            <select
              className="badge"
              aria-label={`Mercado de ${item.name}`}
              value={item.market ?? ''}
              onChange={(e) => onMarket(e.target.value || null)}
              style={
                escolhido
                  ? { background: escolhido.color, color: '#fff', borderColor: 'transparent' }
                  : { background: 'transparent' }
              }
            >
              <option value="">onde for mais barato</option>
              {markets.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          {showWho && item.addedBy && (
            <span className="badge" style={{ borderColor: item.addedBy.color, color: item.addedBy.color }}>
              {item.addedBy.name}
            </span>
          )}
          {item.note && <span>“{item.note}”</span>}
        </div>
      </div>
      <div className="stepper">
        <button
          aria-label={`Diminuir ${item.name}`}
          onClick={() => (item.qty <= 1 ? onRemove() : onQty(item.qty - 1))}
        >
          {item.qty <= 1 ? '🗑' : '−'}
        </button>
        <span className="qty">{quantity(item.qty)}</span>
        <button aria-label={`Aumentar ${item.name}`} onClick={() => onQty(item.qty + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
