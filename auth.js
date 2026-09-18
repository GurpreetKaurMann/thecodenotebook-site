// Account layer. Uses Firebase Authentication + Cloud Firestore when configured,
// otherwise a clearly-labelled browser-only PREVIEW mode (for design testing only).
import { firebaseConfig, FIREBASE_VERSION } from "./firebase-config.js";

export const PREVIEW = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE");

const FRIENDLY = {
  "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/weak-password": "Please choose a stronger password (at least 8 characters).",
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/user-not-found": "Email or password is incorrect.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "Network problem. Check your internet connection and try again.",
  "auth/popup-closed-by-user": "The Google sign-in window was closed before finishing.",
  "auth/missing-email": "Please enter your email address.",
};
export function friendlyError(e) {
  return FRIENDLY[e?.code] || e?.message || "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------- Firebase
async function firebaseApi() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const userRef = (uid) => F.doc(db, "users", uid);

  async function ensureProfile(user, name) {
    const snap = await F.getDoc(userRef(user.uid));
    if (!snap.exists()) {
      await F.setDoc(userRef(user.uid), {
        name: name || user.displayName || "",
        email: user.email,
        createdAt: F.serverTimestamp(),
        progress: {},
        waitlist: [],
      });
    }
  }

  // Session cookie for the members-only pages (checked on the server by functions/_middleware.js).
  const COOKIE = "tcn_session";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  // Scope the cookie to ".yourdomain.com" so it is sent on BOTH thecodenotebook.com and
  // www.thecodenotebook.com. Without this, signing in on one of them and landing on the
  // other means the server never sees the cookie — which used to cause a redirect loop.
  const host = location.hostname;
  const domain = (/^(localhost|127\.0\.0\.1|\[)/i.test(host) || host.endsWith(".pages.dev") || !host.includes("."))
    ? ""
    : "; Domain=." + host.replace(/^www\./i, "").split(".").slice(-2).join(".");
  const writeCookie = (token) => {
    // clear on both scopes, so an older host-only cookie can never shadow the new one
    document.cookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    if (domain) document.cookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}${domain}`;
    if (token) document.cookie = `${COOKIE}=${token}; Path=/; Max-Age=3300; SameSite=Lax${secure}${domain}`;
  };
  async function syncSession(forceRefresh = false) {
    const u = auth.currentUser;
    writeCookie(u ? await u.getIdToken(forceRefresh) : "");
    // Tell the caller whether the browser actually kept it. If this is false the browser
    // is blocking cookies, and we must not bounce the user into the gate again.
    return document.cookie.includes(COOKIE + "=");
  }
  A.onIdTokenChanged(auth, () => { syncSession().catch(() => {}); });

  return {
    mode: "firebase",
    syncSession,
    onUser(cb) {
      return A.onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, name: u.displayName || "", email: u.email, verified: u.emailVerified } : null));
    },
    async register({ name, email, password, remember }) {
      await A.setPersistence(auth, remember ? A.browserLocalPersistence : A.browserSessionPersistence);
      const cred = await A.createUserWithEmailAndPassword(auth, email, password);
      await A.updateProfile(cred.user, { displayName: name });
      await ensureProfile(cred.user, name);
      await A.sendEmailVerification(cred.user);
      return cred.user;
    },
    async login({ email, password, remember }) {
      await A.setPersistence(auth, remember ? A.browserLocalPersistence : A.browserSessionPersistence);
      const cred = await A.signInWithEmailAndPassword(auth, email, password);
      await ensureProfile(cred.user);
      return cred.user;
    },
    async loginGoogle() {
      const cred = await A.signInWithPopup(auth, new A.GoogleAuthProvider());
      await ensureProfile(cred.user);
      return cred.user;
    },
    async logout() { writeCookie(""); await A.signOut(auth); },
    resetPassword: (email) => A.sendPasswordResetEmail(auth, email),
    resendVerification: () => A.sendEmailVerification(auth.currentUser),
    async getProfile(uid) {
      const snap = await F.getDoc(userRef(uid));
      return snap.exists() ? snap.data() : null;
    },
    async setProgress(uid, lessonId, done) {
      await F.updateDoc(userRef(uid), { [`progress.${lessonId}`]: done, updatedAt: F.serverTimestamp() });
    },
    async joinWaitlist(uid, courseId) {
      await F.updateDoc(userRef(uid), { waitlist: F.arrayUnion(courseId), updatedAt: F.serverTimestamp() });
    },

    // --- site owner only -------------------------------------------------
    // You are an admin if a document with your user ID exists in the "admins"
    // collection. The Firestore rules enforce this; the page below just asks.
    async isAdmin(uid) {
      try { return (await F.getDoc(F.doc(db, "admins", uid))).exists(); }
      catch { return false; }
    },
    // Reads every member profile. The rules allow this only for an admin, so a
    // normal visitor calling it gets a permission error, not the data.
    async listMembers(max = 1000) {
      const q = F.query(F.collection(db, "users"), F.limit(max));
      const snap = await F.getDocs(q);
      return snap.docs.map((d) => {
        const v = d.data() || {};
        const c = v.createdAt;
        return {
          uid: d.id,
          name: v.name || "",
          email: v.email || "",
          createdAt: c && c.toDate ? c.toDate() : (c ? new Date(c) : null),
          progress: v.progress || {},
          waitlist: Array.isArray(v.waitlist) ? v.waitlist : [],
        };
      });
    },
  };
}

// ---------------------------------------------------------------- Preview (browser only, NOT secure)
function previewApi() {
  const KEY_USERS = "tcn-preview-users", KEY_SESSION = "tcn-preview-session";
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const listeners = new Set();
  const current = () => {
    const email = store.get(KEY_SESSION, null);
    const u = email && store.get(KEY_USERS, {})[email];
    return u ? { uid: email, name: u.name, email, verified: true } : null;
  };
  const emit = () => listeners.forEach((cb) => cb(current()));
  const err = (code) => Object.assign(new Error(code), { code });
  async function hash(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  return {
    mode: "preview",
    syncSession: async () => true,   // preview mode has no server gate
    async isAdmin() { return true; },   // preview: always show the admin page
    async listMembers() {
      const users = store.get(KEY_USERS, {});
      return Object.entries(users).map(([email, u]) => ({
        uid: email, name: u.name || "", email,
        createdAt: u.createdAt ? new Date(u.createdAt) : null,
        progress: u.progress || {}, waitlist: u.waitlist || [],
      }));
    },
    onUser(cb) { listeners.add(cb); setTimeout(() => cb(current()), 0); return () => listeners.delete(cb); },
    async register({ name, email, password }) {
      email = email.trim().toLowerCase();
      if (!validEmail(email)) throw err("auth/invalid-email");
      if (password.length < 8) throw err("auth/weak-password");
      const users = store.get(KEY_USERS, {});
      if (users[email]) throw err("auth/email-already-in-use");
      users[email] = { name, pw: await hash(email + password), createdAt: Date.now(), progress: {}, waitlist: [] };
      store.set(KEY_USERS, users); store.set(KEY_SESSION, email); emit();
    },
    async login({ email, password }) {
      email = email.trim().toLowerCase();
      const u = store.get(KEY_USERS, {})[email];
      if (!u || u.pw !== await hash(email + password)) throw err("auth/invalid-credential");
      store.set(KEY_SESSION, email); emit();
    },
    async loginGoogle() { throw Object.assign(new Error("Google sign-in works after you connect Firebase."), { code: "preview" }); },
    async logout() { try { localStorage.removeItem(KEY_SESSION); } catch {} emit(); },
    async resetPassword(email) { if (!validEmail(email.trim())) throw err("auth/invalid-email"); },
    async resendVerification() {},
    async getProfile(uid) { return store.get(KEY_USERS, {})[uid] || null; },
    async setProgress(uid, lessonId, done) {
      const users = store.get(KEY_USERS, {}); if (!users[uid]) return;
      users[uid].progress = { ...users[uid].progress, [lessonId]: done }; store.set(KEY_USERS, users);
    },
    async joinWaitlist(uid, courseId) {
      const users = store.get(KEY_USERS, {}); if (!users[uid]) return;
      users[uid].waitlist = [...new Set([...(users[uid].waitlist || []), courseId])]; store.set(KEY_USERS, users);
    },
  };
}

export const accounts = (async () => {
  if (PREVIEW) return previewApi();
  try { return await firebaseApi(); }
  catch (e) { console.error("Firebase failed to load", e); throw e; }
})();
