export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

const buildRelayUrl = (req) => {
  const pathStart = req.url.indexOf("/", 8);
  return pathStart === -1 ? TARGET_BASE + "/" : TARGET_BASE + req.url.slice(pathStart);
};

const prepareRelayHeaders = (headers) => {
  const relayHeaders = new Headers();
  let clientIp = null;

  for (const [key, value] of headers) {
    if (STRIP_HEADERS.has(key)) continue;
    if (key.startsWith("x-vercel-")) continue;

    if (key === "x-real-ip") {
      clientIp = value;
      continue;
    }

    if (key === "x-forwarded-for") {
      if (!clientIp) clientIp = value;
      continue;
    }

    relayHeaders.set(key, value);
  }

  if (clientIp) relayHeaders.set("x-forwarded-for", clientIp);
  return relayHeaders;
};

const hasRequestBody = (method) => method !== "GET" && method !== "HEAD";

export default async function relayRequest(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const method = req.method;

    return await fetch(buildRelayUrl(req), {
      method,
      headers: prepareRelayHeaders(req.headers),
      body: hasRequestBody(method) ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });
  } catch (err) {
    console.error("relay error:", err);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
