import assert from "node:assert/strict";
import { test } from "node:test";
import { clientAddress } from "../../lib/client-address.js";

function req(remoteAddress, forwardedFor) {
  const headers = {};
  if (forwardedFor !== undefined) headers["x-forwarded-for"] = forwardedFor;
  return { socket: { remoteAddress }, headers };
}

const SOCKET = "10.0.0.5";

test("без trustProxy заголовок игнорируется", () => {
  assert.equal(clientAddress(req(SOCKET, "203.0.113.9")), SOCKET);
  assert.equal(clientAddress(req(SOCKET, "203.0.113.9"), { trustProxy: false }), SOCKET);
});

test("trustProxy с одним прокси берёт самый правый элемент", () => {
  const request = req(SOCKET, "198.51.100.1, 198.51.100.2, 203.0.113.9");
  assert.equal(clientAddress(request, { trustProxy: true, trustedProxyHops: 1 }), "203.0.113.9");
  // hops по умолчанию равен 1.
  assert.equal(clientAddress(request, { trustProxy: true }), "203.0.113.9");
});

test("подставленный клиентом левый элемент не влияет на результат", () => {
  const options = { trustProxy: true, trustedProxyHops: 1 };
  const honest = clientAddress(req(SOCKET, "203.0.113.9"), options);
  for (const spoof of ["6.6.6.6", "7.7.7.7, 8.8.8.8", "1.2.3.4, 5.6.7.8, 9.9.9.9", "not-an-ip"]) {
    assert.equal(clientAddress(req(SOCKET, `${spoof}, 203.0.113.9`), options), honest, spoof);
  }
});

test("два доверенных прокси: берётся предпоследний элемент", () => {
  const request = req(SOCKET, "6.6.6.6, 198.51.100.7, 203.0.113.9");
  assert.equal(clientAddress(request, { trustProxy: true, trustedProxyHops: 2 }), "198.51.100.7");
});

test("записей меньше, чем доверенных прокси: адрес сокета", () => {
  assert.equal(clientAddress(req(SOCKET, "203.0.113.9"), { trustProxy: true, trustedProxyHops: 2 }), SOCKET);
  assert.equal(clientAddress(req(SOCKET), { trustProxy: true, trustedProxyHops: 1 }), SOCKET);
  assert.equal(clientAddress(req(SOCKET, ""), { trustProxy: true, trustedProxyHops: 1 }), SOCKET);
});

test("значение, не являющееся IP, заменяется адресом сокета", () => {
  const options = { trustProxy: true, trustedProxyHops: 1 };
  for (const junk of ["unknown", "evil<script>", "1.2.3.4:5678", "999.1.1.1", "'; drop table users;--"]) {
    assert.equal(clientAddress(req(SOCKET, `203.0.113.9, ${junk}`), options), SOCKET, junk);
  }
});

test("IPv6 принимается как есть", () => {
  const options = { trustProxy: true, trustedProxyHops: 1 };
  assert.equal(clientAddress(req(SOCKET, "6.6.6.6, 2001:db8::1"), options), "2001:db8::1");
  assert.equal(clientAddress(req(SOCKET, "2001:db8::2,  2001:db8::1 "), options), "2001:db8::1");
  assert.equal(clientAddress(req("::1", undefined), options), "::1");
  assert.equal(clientAddress(req("::ffff:10.0.0.5", "garbage"), options), "::ffff:10.0.0.5");
});

test("некорректное число прокси заменяется единицей", () => {
  const request = req(SOCKET, "6.6.6.6, 198.51.100.7, 203.0.113.9");
  for (const hops of [0, -1, 1.5, NaN, "2", null]) {
    assert.equal(clientAddress(request, { trustProxy: true, trustedProxyHops: hops }), "203.0.113.9", String(hops));
  }
});

test("повторяющиеся заголовки (массив) склеиваются и читаются справа", () => {
  const request = { socket: { remoteAddress: SOCKET }, headers: { "x-forwarded-for": ["6.6.6.6", "203.0.113.9"] } };
  assert.equal(clientAddress(request, { trustProxy: true, trustedProxyHops: 1 }), "203.0.113.9");
});

test("без адреса сокета возвращается unknown", () => {
  assert.equal(clientAddress({ socket: {}, headers: {} }, { trustProxy: false }), "unknown");
});
