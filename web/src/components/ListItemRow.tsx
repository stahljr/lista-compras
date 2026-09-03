import { Minus, Plus, Trash2 } from 'lucide-react';
import { quantity } from '@/lib/format';
import { useStore } from '@/lib/store';
import { roundQty, stepOf } from '@/lib/unit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Row, RowBody, RowMeta, RowName } from '@/components/Layout';
import { Thumb } from '@/components/Thumb';
import type { ListItem } from '@/lib/types';

/** Uma linha da lista: foto, nome, quem colocou, o mercado e o +/- da quantidade. */
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
  // Item vendido a peso anda de meio em meio quilo; o resto, de um em um.
  const passo = stepOf(item.unit);

  return (
    <Row>
      <Thumb src={item.imageUrl} category={item.category} alt={item.name} />
      <RowBody>
        <RowName>{item.name}</RowName>
        <RowMeta>
          {onMarket && (
            <select
              aria-label={`Mercado de ${item.name}`}
              value={item.market ?? ''}
              onChange={(e) => onMarket(e.target.value || null)}
              className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
              style={escolhido ? { background: escolhido.color, color: '#fff', borderColor: 'transparent' } : undefined}
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
            <Badge variant="outline" style={{ borderColor: item.addedBy.color, color: item.addedBy.color }}>
              {item.addedBy.name}
            </Badge>
          )}
          {item.note && <span className="truncate">“{item.note}”</span>}
        </RowMeta>
      </RowBody>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={item.qty <= passo ? `Remover ${item.name}` : `Diminuir ${item.name}`}
          onClick={() => (item.qty <= passo ? onRemove() : onQty(roundQty(item.qty - passo)))}
        >
          {item.qty <= passo ? <Trash2 className="text-destructive" /> : <Minus />}
        </Button>
        <span className="min-w-12 text-center text-sm font-bold tabular-nums">{quantity(item.qty, item.unit)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Aumentar ${item.name}`}
          onClick={() => onQty(roundQty(item.qty + passo))}
        >
          <Plus />
        </Button>
      </div>
    </Row>
  );
}
