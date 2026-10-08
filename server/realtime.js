/**
 * Minimal Server-Sent Events hub. Every logged-in client keeps one stream open
 * and receives small notifications ({ type, ... }); clients refetch what they need.
 */
export function createHub() {
  const clients = new Set();

  function subscribe(req, res) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const client = { res, userId: req.user.id };
    clients.add(client);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(client);
    });
  }

  function broadcast(payload) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) client.res.write(data);
  }

  function closeAll() {
    for (const client of clients) client.res.end();
    clients.clear();
  }

  return { subscribe, broadcast, closeAll };
}
