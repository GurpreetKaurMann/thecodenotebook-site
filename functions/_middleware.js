// Members-only pages for The Code Notebook (Cloudflare Pages Function).
// Runs on Cloudflare's servers before a page is sent. If the visitor is not logged in,
// they get the login page instead, so the notes, PDF and field guide can't be opened by URL.
//
// How it works: after login, the website stores the user's Firebase ID token in a cookie
// ("tcn_session"). Here we check that token's signature with Google's public keys and make
// sure it belongs to our Firebase project and hasn't expired. No secret keys are needed.
//
// v5: this file can no longer put the browser in a redirect loop.
//   * after 2 failed attempts it shows a page that says what went wrong, instead of bouncing again
//   * /__gate-check tells you in one click whether the cookie arrived and, if not, why
//   * set the environment variable GATE=off in Cloudflare to switch the gate off entirely

export const PROJECT_ID = "thecodenotebook";          // Firebase project ID
const COOKIE = "tcn_session";
const TRY_COOKIE = "tcn_gate";                        // counts failed attempts, expires in 60s
const MAX_TRIES = 2;
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

// Same check as verifyFirebaseToken, but it also says WHY a token was rejected.
// That reason is what /__gate-check shows you, so a broken login is a 5-second diagnosis.
export async function verifyWithReason(token, { fetchFn = fetch, nowSec = Math.floor(Date.now() / 1000), projectId = PROJECT_ID } = {}) {
  const fail = (reason) => ({ ok: false, reason, claims: null });
  try {
    if (!token) return fail("no-cookie");
    const parts = String(token).split(".");
    if (parts.length !== 3) return fail("not-a-jwt");
    const [h, p, s] = parts;
    const header = b64urlJson(h);
    const claims = b64urlJson(p);
    if (header.alg !== "RS256" || !header.kid) return fail("bad-header");
    if (claims.aud !== projectId) return fail(`wrong-project (token is for "${claims.aud}", this site expects "${projectId}")`);
    if (claims.iss !== `https://securetoken.google.com/${projectId}`) return fail("wrong-issuer");
    if (typeof claims.sub !== "string" || !claims.sub) return fail("no-user-id");
    if (!(claims.exp > nowSec)) return fail(`expired (${nowSec - claims.exp}s ago)`);
    if (claims.iat > nowSec + 300) return fail("issued-in-the-future (clock skew)");
    if (claims.auth_time > nowSec + 300) return fail("auth-time-in-the-future (clock skew)");

    let keys;
    try { keys = await getKeys(fetchFn); }
    catch { return fail("could-not-reach-google-keys"); }
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return fail("unknown-signing-key");
    const key = await crypto.subtle.importKey(
      "jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? { ok: true, reason: "ok", claims } : fail("bad-signature");
  } catch (e) {
    return fail("error: " + (e && e.message ? e.message : String(e)));
  }
}

// Returns the token's claims if it is a valid, unexpired Firebase ID token for our project; otherwise null.
export async function verifyFirebaseToken(token, opts = {}) {
  const r = await verifyWithReason(token, opts);
  return r.ok ? r.claims : null;
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

// The cookie is written by the browser for ".yourdomain.com", so it works on both
// thecodenotebook.com and www.thecodenotebook.com. We clear it the same way.
function cookieDomain(hostname) {
  if (/^(localhost|127\.0\.0\.1|\[|.*\.pages\.dev)$/i.test(hostname) || !hostname.includes(".")) return "";
  const parts = hostname.replace(/^www\./i, "").split(".");
  return parts.length >= 2 ? "; Domain=." + parts.slice(-2).join(".") : "";
}

const ESC = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function troubleshootPage(reason, url) {
  const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>We couldn't keep you signed in</title>
<style>
 :root{color-scheme:light}
 body{margin:0;background:#fdfbf3;color:#23263a;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
   display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
 .box{max-width:640px;background:#fff;border:3px solid #23263a;border-radius:18px 6px 20px 8px;padding:28px 32px;
   box-shadow:8px 10px 0 rgba(0,0,0,.08)}
 h1{margin:0 0 6px;font-size:1.6rem;color:#1f3f9a}
 code{background:#f1f2f6;padding:2px 7px;border-radius:5px;font-size:.92em}
 .why{background:#fff3a8;border-radius:10px;padding:12px 16px;margin:18px 0}
 ul{padding-left:20px} li{margin:8px 0}
 a.btn{display:inline-block;margin-top:14px;background:#1f3f9a;color:#fff;text-decoration:none;
   padding:11px 20px;border-radius:10px;font-weight:700}
 a.btn.plain{background:#fff;color:#1f3f9a;border:2px solid #1f3f9a;margin-left:8px}
 .muted{color:#6b6f7e;font-size:.9rem}
</style></head><body><div class="box">
<h1>We couldn't keep you signed in</h1>
<p>Your login worked, but this page couldn't confirm it — so we stopped instead of reloading over and over.</p>
<div class="why"><b>Reason:</b> <code>${ESC(reason)}</code></div>
<p>Two things usually fix it:</p>
<ul>
  <li><b>Allow cookies for this site.</b> In private mode, or with strict tracking protection on, the login cookie gets dropped.</li>
  <li><b>Use one address.</b> Open <code>${ESC(url.origin)}</code> directly rather than switching between the <code>www.</code> and non-<code>www.</code> versions.</li>
</ul>
<p class="muted">Still stuck? Open <a href="/__gate-check">/__gate-check</a> — it shows exactly what the server received.</p>
<a class="btn" href="/login">Try signing in again</a><a class="btn plain" href="/">Go to the home page</a>
</div></body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // reset the counter so the next genuine attempt gets a clean run
      "Set-Cookie": `${TRY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${url.protocol === "https:" ? "; Secure" : ""}`,
    },
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const secure = url.protocol === "https:" ? "; Secure" : "";

  // A one-click diagnosis. Public, but it never reveals the token itself.
  if (url.pathname === "/__gate-check") {
    const raw = readCookie(context.request, COOKIE);
    const r = await verifyWithReason(raw);
    return new Response(JSON.stringify({
      signedIn: r.ok,
      reason: r.reason,
      cookieReceived: Boolean(raw),
      cookieLength: raw.length,
      host: url.hostname,
      expectedProject: PROJECT_ID,
      gate: (context.env && context.env.GATE) === "off" ? "off" : "on",
      serverTime: new Date().toISOString(),
      user: r.ok ? { uid: r.claims.sub, email: r.claims.email || null } : null,
    }, null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  // Kill switch: add an environment variable GATE with the value "off" in Cloudflare
  // (Settings -> Environment variables) to serve every page without the gate.
  if (context.env && context.env.GATE === "off") return context.next();

  if (!isProtected(url.pathname)) return context.next();

  const claims = await verifyFirebaseToken(readCookie(context.request, COOKIE));
  if (claims) {
    const res = await context.next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "private, no-store");
    // signed in: clear the attempt counter
    out.headers.append("Set-Cookie", `${TRY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}${cookieDomain(url.hostname)}`);
    return out;
  }

  // Not signed in. Count the attempts so we can never bounce forever.
  const tries = Number(readCookie(context.request, TRY_COOKIE) || 0) + 1;
  if (tries > MAX_TRIES) {
    const r = await verifyWithReason(readCookie(context.request, COOKIE));
    return troubleshootPage(r.reason, url);
  }

  const login = new URL("/login", url.origin);   // Cloudflare Pages serves login.html at /login
  login.searchParams.set("next", nextParam(url.pathname));
  return new Response(null, {
    status: 302,
    headers: {
      Location: login.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": `${TRY_COOKIE}=${tries}; Path=/; Max-Age=60; SameSite=Lax${secure}${cookieDomain(url.hostname)}`,
    },
  });
}
