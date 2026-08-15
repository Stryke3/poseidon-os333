let clients: { id: string; controller: ReadableStreamController<Uint8Array> }[] = [];

export function broadcastDashboardUpdate(data: object) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  clients.forEach((client) => {
    try {
      client.controller.enqueue(encoder.encode(payload));
    } catch {
      // client disconnected
    }
  });
}

export function addClient(id: string, controller: ReadableStreamController<Uint8Array>) {
  clients.push({ id, controller });
}

export function removeClient(id: string) {
  clients = clients.filter((client) => client.id !== id);
}
