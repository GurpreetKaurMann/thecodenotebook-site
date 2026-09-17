// ============================================================
//  STEP 1 OF GOING LIVE: paste your Firebase web app config here
//  (Firebase console → Project settings → Your apps → Web app → SDK setup → "Config")
//  While apiKey still says PASTE_..., the site runs in PREVIEW MODE:
//  accounts are stored only in this browser and are NOT secure.
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyA-Fue5BTqulNtMQfPiRjJ9egcUUBM65fw",
  authDomain: "thecodenotebook.firebaseapp.com",
  projectId: "thecodenotebook",
  storageBucket: "thecodenotebook.firebasestorage.app",
  messagingSenderId: "548372798927",
  appId: "1:548372798927:web:e54d6509eaa1824280c6ba",
  measurementId: "G-0NER17W7F8",
};

// Firebase JavaScript SDK version loaded from Google's CDN.
export const FIREBASE_VERSION = "12.19.0";

// ============================================================
//  YouTube video IDs — paste the part after "watch?v=" for each lesson.
//  Example: https://www.youtube.com/watch?v=abc123XYZ  →  "abc123XYZ"
// ============================================================
export const VIDEOS = {
  "big-o": "",
  "java-toolkit": "",
  "recursion": "",
  "math": "",
  "bits": "",
  "arrays": "",
  "strings": "",
  "hashing": "",
};

export const CHANNEL_URL = "https://www.youtube.com/@TheCodeNotebook"; // change if your handle is different
export const CONTACT_EMAIL = ""; // e.g. "hello@thecodenotebook.com" — shown on the Contact page once filled in
