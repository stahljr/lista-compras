/**
 * Sync entre os dois celulares. Cada aba abre um SSE e recebe um aviso curto
 * ("cart mudou") sempre que o outro mexe em algo; quem recebe recarrega o que
 * estiver vendo. Simples o suficiente para nao precisar de websocket.
 */
const clients = new Map(); // householdId -> Set<res>

export function subscribe(req, res, householdId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  if (!clients.has(householdId)) clients.set(householdId, new Set());
  clients.get(householdId).add(res);

  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  const close = () => {
    clearInterval(ping);
    clients.get(householdId)?.delete(res);
  };
  req.on('close', close);
  req.on('error', close);
}

export function publish(householdId, event, payload = {}) {
  const set = clients.get(householdId);
  if (!set?.size) return;
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(data);
    } catch {
      set.delete(res);
    }
  }
}
