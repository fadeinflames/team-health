import { isIP } from "node:net";

// За доверенными прокси клиентский адрес берётся из X-Forwarded-For СПРАВА:
// каждый прокси дописывает в конец адрес того, кто к нему подключился, а
// левые элементы клиент может подделать сам. trustedProxyHops — число
// доверенных прокси перед приложением (1 — один балансировщик).
// Если записей меньше, чем прокси, или значение не IP, заголовок не
// заслуживает доверия, и берётся адрес сокета.
export function clientAddress(request, { trustProxy, trustedProxyHops = 1 } = {}) {
  const socketAddress = request.socket?.remoteAddress || "unknown";
  if (!trustProxy) return socketAddress;

  const hops = Number.isInteger(trustedProxyHops) && trustedProxyHops >= 1 ? trustedProxyHops : 1;
  const header = request.headers?.["x-forwarded-for"];
  const entries = String(Array.isArray(header) ? header.join(",") : header || "")
    .split(",")
    .map((part) => part.trim());
  if (entries.length < hops) return socketAddress;

  const candidate = entries[entries.length - hops];
  return isIP(candidate) ? candidate : socketAddress;
}
