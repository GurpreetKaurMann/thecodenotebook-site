// Shared page behaviour: header auth state, page guards, forms, dashboard, lessons.
import { accounts, PREVIEW, friendlyError } from "./auth.js";
import { VIDEOS, CHANNEL_URL, CONTACT_EMAIL } from "./firebase-config.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const page = document.body.dataset.page;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LESSONS = [
  { id: "big-o", no: 1, title: "Time & Space Complexity (Big-O)", href: "lessons/big-o.html" },
  { id: "java-toolkit", no: 2, title: "Java Toolkit for DSA", href: "lessons/java-toolkit.html" },
  { id: "recursion", no: 3, title: "Recursion", href: "lessons/recursion.html" },
  { id: "math", no: 4, title: "Math for Coding Interviews", href: "lessons/math.html" },
  { id: "bits", no: 5, title: "Bit Manipulation", href: "lessons/bits.html" },
  { id: "arrays", no: 6, title: "Arrays", href: "lessons/arrays.html" },
  { id: "strings", no: 7, title: "Strings", href: "lessons/strings.html" },
  { id: "hashing", no: 8, title: "Hashing (HashMap & HashSet)", href: "lessons/hashing.html" },
  { id: "linked-list", no: 9, title: "Linked List", href: "lessons/linked-list.html" },
  { id: "stacks", no: 10, title: "Stacks", href: "lessons/stacks.html" },
  { id: "queues", no: 11, title: "Queues & Deques", href: "lessons/queues.html" },
  { id: "binary-search", no: 12, title: "Binary Search", href: "lessons/binary-search.html" },
  { id: "trees", no: 13, title: "Trees & Binary Search Trees", href: "lessons/trees.html" },
];
const root = document.body.dataset.root || "";

// ---------- small UI helpers
function show(el, text, kind = "error") {
  if (!el) return;
  el.textContent = text; el.className = `msg ${kind}`; el.hidden = false;
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Please wait…"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
function nextUrl() {
  const n = new URLSearchParams(location.search).get("next");
  return n && /^[a-z0-9\-/]+\.(html|pdf)(#[\w-]+)?$/i.test(n) ? root + n : root + "dashboard.html";
}
function herePath() {
  let p = location.pathname.replace(/^\/+/, "");
  if (!p) return "index.html";
  if (!/\.[a-z0-9]+$/i.test(p)) p += ".html";
  return p;
}

// ---------- mobile menu, channel links, preview banner
$(".menu-btn")?.addEventListener("click", (e) => {
  const nav = $(".nav"); const open = nav.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", open);
});
$$("[data-channel]").forEach((a) => (a.href = CHANNEL_URL));
if (PREVIEW) {
  const bar = $(".demo-bar");
  if (bar) bar.hidden = false;
}
if (CONTACT_EMAIL) $$("[data-email]").forEach((el) => { el.textContent = CONTACT_EMAIL; el.href = `mailto:${CONTACT_EMAIL}`; el.hidden = false; });

// ---------- password eye + strength meter
$$(".pw-row button").forEach((b) => b.addEventListener("click", () => {
  const input = b.previousElementSibling; const vis = input.type === "password";
  input.type = vis ? "text" : "password"; b.textContent = vis ? "Hide" : "Show";
}));
const pw = $("#password"); const meter = $(".strength i");
if (pw && meter) pw.addEventListener("input", () => {
  const v = pw.value; let s = 0;
  if (v.length >= 8) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
  meter.style.width = `${(s / 4) * 100}%`;
  meter.style.background = ["#c2372b", "#c2372b", "#f2a93b", "#9ac43b", "#2f7a45"][s];
});

// ---------- main
const api = await accounts.catch((e) => {
  const m = $(".msg"); show(m, "Could not connect to the login service. Please refresh the page.");
  throw e;
});

const COOKIE_HELP = "You're signed in, but your browser is blocking the login cookie, so the members pages can't open. " +
  "Please allow cookies for this site (turn off private mode or strict tracking protection) and try again.";
// Go to the next page only once the session cookie is really stored, so a browser that
// drops cookies gets a clear message instead of an endless redirect.
async function goAfterAuth(msg) {
  const kept = await api.syncSession(true).catch(() => false);
  if (kept === false) { show(msg, COOKIE_HELP); return false; }
  location.replace(nextUrl());
  return true;
}

let firstUserEvent = true;
api.onUser(async (user) => {
  renderHeader(user);
  const guard = document.body.dataset.guard;
  if (guard === "auth" && !user) {
    location.replace(`${root}login.html?next=${encodeURIComponent(herePath())}`);
    return;
  }
  if (guard === "guest" && user && firstUserEvent) {
    // Already logged in. Refresh the session cookie, then go where they were headed.
    // Two separate brakes so this can never turn into an endless refresh:
    //   1. syncSession tells us whether the browser actually kept the cookie
    //   2. a short-lived counter cookie, which (unlike sessionStorage) survives www <-> apex
    const kept = await api.syncSession(true).catch(() => false);
    const hops = Number((document.cookie.match(/(?:^|;\s*)tcn_hop=(\d+)/) || [])[1] || 0);
    if (!kept) {
      show($(".msg"), "You're signed in, but your browser is blocking the login cookie, so the members pages can't open. " +
                      "Please allow cookies for this site (turn off private mode or strict tracking protection) and try again.");
    } else if (hops >= 2) {
      show($(".msg"), "You're signed in, but the members pages keep sending you back here. " +
                      "Open the site at one address only — either with www. or without, not both. " +
                      "If it still happens, visit /__gate-check and send me what it says.");
      document.cookie = "tcn_hop=; Path=/; Max-Age=0; SameSite=Lax";
    } else {
      document.cookie = `tcn_hop=${hops + 1}; Path=/; Max-Age=30; SameSite=Lax`;
      location.replace(nextUrl());
      return;
    }
  }
  if (guard !== "guest") {
    // reached a real page: the round trip worked, so forget the counter
    document.cookie = "tcn_hop=; Path=/; Max-Age=0; SameSite=Lax";
  }
  firstUserEvent = false;
  if (page === "dashboard" && user) renderDashboard(user);
  if (page === "lesson") setupLessonProgress(user);
  if (page === "courses") setupCourses(user);
  document.body.classList.add("auth-ready");
});

function renderHeader(user) {
  const slot = $(".auth-slot"); if (!slot) return;
  slot.innerHTML = user
    ? `<a class="btn small" href="${root}dashboard.html">Hi, ${esc((user.name || user.email).split(" ")[0])}</a>
       <button class="btn small" type="button" data-logout>Log out</button>`
    : `<a class="btn small" href="${root}login.html">Log in</a>
       <a class="btn small primary" href="${root}register.html">Sign up free</a>`;
  $("[data-logout]", slot)?.addEventListener("click", async () => { await api.logout(); location.href = `${root}index.html`; });
}

// ---------- register
$("#register-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget, msg = $(".msg", f), btn = $("button[type=submit]", f);
  const name = f.name.value.trim(), email = f.email.value.trim(), password = f.password.value, confirm = f.confirm.value;
  if (name.length < 2) return show(msg, "Please enter your name.");
  if (password.length < 8) return show(msg, "Password must be at least 8 characters.");
  if (password !== confirm) return show(msg, "The two passwords don't match.");
  if (!f.terms.checked) return show(msg, "Please accept the Terms and Privacy Policy.");
  busy(btn, true, "Creating account…");
  try {
    await api.register({ name, email, password, remember: true });
    const kept = await api.syncSession(true).catch(() => false);
    if (kept === false) { show(msg, "Account created, but " + COOKIE_HELP.charAt(0).toLowerCase() + COOKIE_HELP.slice(1)); busy(btn, false); return; }
    show(msg, api.mode === "firebase" ? "Account created! We've sent a verification email." : "Account created (preview mode).", "ok");
    setTimeout(() => location.replace(nextUrl()), 900);
  } catch (err) { show(msg, friendlyError(err)); busy(btn, false); }
});

// ---------- login
$("#login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget, msg = $(".msg", f), btn = $("button[type=submit]", f);
  busy(btn, true, "Logging in…");
  try {
    await api.login({ email: f.email.value.trim(), password: f.password.value, remember: f.remember.checked });
    if (!await goAfterAuth(msg)) busy(btn, false);
  } catch (err) { show(msg, friendlyError(err)); busy(btn, false); }
});

$$("[data-google]").forEach((b) => b.addEventListener("click", async () => {
  const msg = $(".msg", b.closest(".form-card"));
  try { await api.loginGoogle(); await goAfterAuth(msg); }
  catch (err) { show(msg, friendlyError(err)); }
}));

// ---------- forgot password
$("#forgot-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget, msg = $(".msg", f), btn = $("button[type=submit]", f);
  busy(btn, true, "Sending…");
  try {
    await api.resetPassword(f.email.value.trim());
    // Same message whether or not the account exists (don't reveal registered emails).
    show(msg, "If an account exists for this email, a reset link is on its way. Check your inbox and spam folder.", "ok");
  } catch (err) { show(msg, friendlyError(err)); }
  busy(btn, false);
});

// ---------- contact form (opens the visitor's email app)
$("#contact-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.currentTarget, msg = $(".msg", f);
  if (!CONTACT_EMAIL) return show(msg, "The contact email isn't set up yet. Please message us on YouTube for now.");
  const body = encodeURIComponent(`${f.message.value}\n\n— ${f.name.value}`);
  location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(f.subject.value || "Hello from the website")}&body=${body}`;
});

// ---------- dashboard
async function renderDashboard(user) {
  const profile = (await api.getProfile(user.uid).catch(() => null)) || {};
  const name = profile.name || user.name || user.email;
  $("#dash-name").textContent = name.split(" ")[0];
  $("#dash-full").textContent = name;
  $("#dash-email").textContent = user.email;
  $("#dash-avatar").textContent = (name[0] || "?").toUpperCase();
  const since = profile.createdAt?.toDate ? profile.createdAt.toDate() : profile.createdAt ? new Date(profile.createdAt) : null;
  $("#dash-since").textContent = since ? since.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "today";

  const verify = $("#verify-box");
  if (verify) {
    verify.hidden = user.verified;
    $("#resend")?.addEventListener("click", async (e) => {
      busy(e.currentTarget, true, "Sending…");
      try { await api.resendVerification(); show($("#verify-msg"), "Verification email sent. Check your inbox.", "ok"); }
      catch (err) { show($("#verify-msg"), friendlyError(err)); }
      busy(e.currentTarget, false);
    });
  }

  const progress = profile.progress || {};
  const list = $("#lesson-list");
  list.innerHTML = LESSONS.map((l) => `
    <div class="lesson-row">
      <input type="checkbox" id="p-${l.id}" data-lesson="${l.id}" ${progress[l.id] ? "checked" : ""}>
      <label for="p-${l.id}"><span class="lesson-no">L${l.no}</span> ${esc(l.title)}</label>
      <a class="btn small" href="${l.href}">Open</a>
    </div>`).join("");
  const update = () => {
    const done = $$("[data-lesson]", list).filter((c) => c.checked).length;
    $("#progress-bar").style.width = `${(done / LESSONS.length) * 100}%`;
    $("#progress-text").textContent = `${done} of ${LESSONS.length} lessons done`;
  };
  update();
  $$("[data-lesson]", list).forEach((c) => c.addEventListener("change", async () => {
    update();
    try { await api.setProgress(user.uid, c.dataset.lesson, c.checked); }
    catch (err) { c.checked = !c.checked; update(); alertBox(friendlyError(err)); }
  }));

  const wl = profile.waitlist || [];
  $("#my-courses").innerHTML = wl.length
    ? `<p>You're on the early-access list for: <b>${wl.map(esc).join(", ")}</b>. We'll email you when it opens.</p>`
    : `<p class="muted">No courses yet. <a href="courses.html">Browse courses</a></p>`;

  $("#reset-pw")?.addEventListener("click", async (e) => {
    busy(e.currentTarget, true, "Sending…");
    try { await api.resetPassword(user.email); show($("#acct-msg"), "Password reset link sent to your email.", "ok"); }
    catch (err) { show($("#acct-msg"), friendlyError(err)); }
    busy(e.currentTarget, false);
  });
  $("#logout-btn")?.addEventListener("click", async () => { await api.logout(); location.href = "index.html"; });
}
function alertBox(text) { const m = $("#acct-msg"); if (m) show(m, text); }

// ---------- lesson page: video + mark complete
function setupLessonProgress(user) {
  const id = document.body.dataset.lesson;
  const box = $("#lesson-progress"); if (!box) return;
  if (!user) {
    box.innerHTML = `<a class="btn small" href="${root}register.html?next=lessons/${id}.html">Sign up free to track progress</a>`;
    return;
  }
  api.getProfile(user.uid).then((p) => {
    const done = !!p?.progress?.[id];
    box.innerHTML = `<button class="btn small ${done ? "" : "yellow"}" type="button" id="mark">${done ? "✓ Completed" : "Mark as complete"}</button>`;
    $("#mark").addEventListener("click", async (e) => {
      const now = e.currentTarget.textContent !== "✓ Completed";
      try {
        await api.setProgress(user.uid, id, now);
        e.currentTarget.textContent = now ? "✓ Completed" : "Mark as complete";
        e.currentTarget.classList.toggle("yellow", !now);
      } catch (err) { e.currentTarget.textContent = friendlyError(err); }
    });
  });
}
$$(".video[data-video]").forEach((v) => {
  const vid = VIDEOS[v.dataset.video];
  if (vid) {
    v.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}" title="${esc(v.dataset.title)}"
      loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
});

// ---------- courses: early access list
function setupCourses(user) {
  $$("[data-course]").forEach((b) => {
    b.onclick = async () => {
      if (!user) { location.href = `register.html?next=courses.html`; return; }
      busy(b, true, "Saving…");
      try { await api.joinWaitlist(user.uid, b.dataset.course); b.textContent = "✓ You're on the list"; b.disabled = true; }
      catch (err) { busy(b, false); b.textContent = friendlyError(err); }
    };
  });
}
