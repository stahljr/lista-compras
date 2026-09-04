import { Minus, Plus, Trash2 } from 'lucide-react';
import { quantity } from '@/lib/format';
import { roundQty, stepOf } from '@/lib/unit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Row, RowBody, RowMeta, RowName } from '@/components/Layout';
import { SeletorDeMercado } from '@/components/SeletorDeMercado';
import { Thumb } from '@/components/Thumb';
import type { ListItem } from '@/lib/types';

/** Uma linha da lista: foto, nome, quem colocou, o mercado e o +/- da quantidade. */
export function ListItemRow({
  item,
  onQty,
  onRemove,
  onMarket,
  onProcurar,
  showWho = true,
}: {
  item: ListItem;
  onQty: (qty: number) => void;
  onRemove: () => void;
  /** Fixa (ou solta) o mercado onde este item deve ser comprado. */
  onMarket?: (market: string | null) => void;
  /** Manda o servidor consultar os mercados que ainda nao deram preco deste item. */
  onProcurar?: () => Promise<void>;
  showWho?: boolean;
}) {
  // Item vendido a peso anda de meio em meio quilo; o resto, de um em um.
  const passo = stepOf(item.unit);

  return (
    <Row>
      <Thumb src={item.imageUrl} category={item.category} alt={item.name} />
      <RowBody>
        <RowName>{item.name}</RowName>
        <RowMeta>
          {onMarket && (
            <SeletorDeMercado
              valor={item.market}
              precos={item.priceSnapshot}
              titulo={item.name}
              onChange={onMarket}
              onProcurar={onProcurar}
            />
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
