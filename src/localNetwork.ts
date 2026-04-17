import { networkInterfaces } from 'node:os';

export function getPrimaryLocalIPv4Address(
  nets: ReturnType<typeof networkInterfaces> = networkInterfaces()
): string | null {
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return null;
}
