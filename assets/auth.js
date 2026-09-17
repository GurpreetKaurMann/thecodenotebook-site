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

  return {
    mode: "firebase",
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
    logout: () => A.signOut(auth),
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
