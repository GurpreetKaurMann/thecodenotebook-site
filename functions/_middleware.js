// Members-only pages for The Code Notebook (Cloudflare Pages Function).
// Runs on Cloudflare's servers before a page is sent. If the visitor is not logged in,
// they get the login page instead, so the notes, PDF and field guide can't be opened by URL.
//
// How it works: after login, the website stores the user's Firebase ID token in a cookie
// ("tcn_session"). Here we check that token's signature with Google's public keys and make
// sure it belongs to our Firebase project and hasn't expired. No secret keys are needed.

export const PROJECT_ID = "thecodenotebook";          // Firebase project ID
const COOKIE = "tcn_session";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

// Pages that need a free account. Everything else (home, about, courses, login, register…) stays public.
const PROTECTED = [
  /^\/lessons(\.html)?$/,
  /^\/lessons\/.+/,
  /^\/resources(\.html)?$/,
  /^\/resources\/.+/,
  /^\/dashboard(\.html)?$/,
];

export const isProtected = (path) => PROTECTED.some((re) => re.test(path));

let keyCache = { keys: null, until: 0 };

async function getKeys(fetchFn = fetch, now = Date.now()) {
  if (keyCache.keys && now < keyCache.until) return keyCache.keys;
  const res = await fetchFn(JWKS_URL);
  if (!res.ok) throw new Error("could not load Google keys");
  const body = await res.json();
  const maxAge = Number((/max-age=(\d+)/.exec(res.headers.get("cache-control") || "") || [])[1] || 3600);
  keyCache = { keys: body.keys || [], until: now + maxAge * 1000 };
  return keyCache.keys;
}

export function _resetKeyCache() { keyCache = { keys: null, until: 0 }; }

function b64urlBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

// Returns the token's claims if it is a valid, unexpired Firebase ID token for our project; otherwise null.
export async function verifyFirebaseToken(token, { fetchFn = fetch, nowSec = Math.floor(Date.now() / 1000), projectId = PROJECT_ID } = {}) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const header = b64urlJson(h);
    const claims = b64urlJson(p);
    if (header.alg !== "RS256" || !header.kid) return null;
    if (claims.aud !== projectId) return null;
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    if (!(claims.exp > nowSec)) return null;
    if (claims.iat > nowSec + 300) return null;
    if (claims.auth_time > nowSec + 300) return null;

    const jwk = (await getKeys(fetchFn)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? claims : null;
  } catch {
    return null;
  }
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

// "/lessons/bits" -> "lessons/bits.html" (the login page sends the user back here afterwards)
export function nextParam(path) {
  let n = path.replace(/^\/+/, "");
  if (!n) return "dashboard.html";
  if (!/\.[a-z0-9]+$/i.test(n)) n += ".html";
  return n;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!isProtected(url.pathname)) return context.next();

  const claims = await verifyFirebaseToken(readCookie(context.request, COOKIE));
  if (claims) {
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "private, no-store");
    return out;
  }
  const login = new URL("/login", url.origin);   // Cloudflare Pages serves login.html at /login
  login.searchParams.set("next", nextParam(url.pathname));
  return new Response(null, { status: 302, headers: { Location: login.toString(), "Cache-Control": "no-store" } });
}
