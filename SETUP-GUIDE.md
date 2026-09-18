# The Code Notebook website: setup guide from zero

This folder is your complete website. It already works in **preview mode**: open it, register, log in, tick lessons. In preview mode, accounts are stored only in your own browser. Follow the steps below to make accounts real and secure, and to put the site online for free.

Total time: about 1–2 hours. Cost: ₹0, plus about $10–11 a year if you buy a domain.

---

## What's inside

| File / folder | What it is |
|---|---|
| `index.html` | Home page |
| `lessons.html`, `lessons/*.html` | Lesson list and 4 lesson pages (video, notes, Java code, practice) |
| `courses.html` | Course cards with "Join early access" (saved to the user's account) |
| `register.html`, `login.html`, `forgot.html` | Sign up, log in, reset password (email + password, or Google) |
| `dashboard.html` | Logged-in area: profile, progress tracker, my courses, change password, log out |
| `resources.html`, `resources/` | Free DSA Field Guide + handwritten notes PDF |
| `about.html`, `contact.html` | About you, contact form |
| `privacy.html`, `terms.html`, `refund.html` | Policy pages (starter templates: review before taking payments) |
| `assets/firebase-config.js` | **The only file you must edit**: Firebase keys, YouTube video IDs, channel link, email |
| `assets/auth.js` | Account logic (Firebase Authentication + Firestore) |
| `assets/site.js` | Page behaviour (header, forms, dashboard, progress) |
| `firestore.rules` | Database security rules: paste into Firebase |
| `sitemap.xml`, `robots.txt`, `_headers` | Google indexing and security headers |

---

## Step 1: Try it on your computer (5 min)

The pages use JavaScript modules, so open them through a small local server, not by double-clicking.

1. Install Python if you don't have it, or use VS Code's "Live Server" extension.
2. In a terminal, go to this folder and run:
   ```
   python -m http.server 8000
   ```
3. Open http://localhost:8000. You'll see a red "Preview mode" bar at the top.
4. Register, log in, tick a lesson, join early access, log out. Everything should work.

## Step 2: Create a Firebase project (10 min, free)

1. Go to https://console.firebase.google.com, sign in with your Google account, and click **Create a project**. Name it `thecodenotebook`. You can turn Google Analytics off.
2. In the project, click the **Web** icon `</>`, name the app `website`, and click **Register app**. Don't tick Firebase Hosting.
3. Firebase shows a `firebaseConfig = { ... }` block. Copy these values into `assets/firebase-config.js`, replacing every `PASTE_...`.
   - These web keys are safe to be public; your data is protected by the rules in Step 4.

## Step 3: Turn on login methods (5 min)

1. Firebase console → **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Email/Password** → Enable → Save.
3. Optional: **Google** → Enable → choose a support email → Save.
4. **Templates** tab: edit the email verification and password reset emails. Set the sender name to "The Code Notebook".
5. **Settings → Password policy** (optional): require a minimum length of 8.

## Step 4: Create the database and lock it down (5 min)

1. Firebase console → **Build → Firestore Database → Create database**. Choose a location near India (for example `asia-south1`, Mumbai) and **production mode**.
2. Open the **Rules** tab, delete everything, paste the whole content of `firestore.rules`, and click **Publish**.
   - Each user can read and edit only their own profile.
   - Nobody can give themselves a paid course from the browser; `purchases` can only be written by your server later.

## Step 5: Test real accounts locally (5 min)

1. Run the local server again (Step 1) and refresh. The red preview bar should be gone.
2. Register with your own email. You should receive a verification email.
3. Check Firebase console → Authentication → **Users** (you'll see yourself) and Firestore → `users` (your profile).
4. Test "Forgot password" and "Continue with Google".

## Step 6: Add your YouTube details

In `assets/firebase-config.js`:
- `VIDEOS`: paste each video ID (the part after `watch?v=`). Lesson pages then show the embedded video.
- `CHANNEL_URL`: your real channel link.
- `CONTACT_EMAIL`: the email you want on the contact page, for example a new Gmail for the channel.

## Step 7: Put the code on GitHub (10 min)

1. Create a free account at https://github.com.
2. Click **New repository**, name it `thecodenotebook-site`, choose Private or Public, and click **Create**.
3. Upload all files in this folder: **Add file → Upload files**, drag the folder contents in, then **Commit**.
   - If you use Git: `git init`, `git add .`, `git commit -m "first version"`, `git remote add origin <url>`, `git push -u origin main`.

## Step 8: Host it free on Cloudflare Pages (10 min)

1. Create a free account at https://dash.cloudflare.com.
2. Go to **Workers & Pages → Create → Pages → Connect to Git**, and select `thecodenotebook-site`.
3. Build settings: **Framework preset: None**, **Build command: (leave empty)**, **Build output directory: `/`**. Click **Save and Deploy**.
4. Your site is live at `https://<project-name>.pages.dev`. Every time you push to GitHub, it updates automatically.
5. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain**, and add your `*.pages.dev` address. Login won't work on that domain until you do this.

## Step 9: Connect your own domain (15 min, about $10–11 a year)

1. Buy `thecodenotebook.com` (or `.in` or `.dev`). Cloudflare Registrar sells domains at cost: Cloudflare dashboard → **Domain Registration → Register domains**.
2. In your Pages project → **Custom domains → Set up a custom domain** → enter `thecodenotebook.com`, and also add `www.thecodenotebook.com`. HTTPS is automatic.
3. Firebase → **Authentication → Settings → Authorized domains** → add `thecodenotebook.com` and `www.thecodenotebook.com`.
4. If you use a different domain, change `SITE_URL` in `sitemap.xml`, `robots.txt` and each page's `<link rel="canonical">`, or ask me to regenerate the site with your domain.

## Step 10: Get found on Google (15 min)

1. Go to https://search.google.com/search-console → **Add property → Domain**, and verify with the TXT record in Cloudflare DNS.
2. **Sitemaps** → submit `sitemap.xml`.
3. Optional analytics: Cloudflare dashboard → **Web Analytics** → add the site. It's free and cookie-free.
4. Link the site from YouTube: Studio → Customization → Profile → Links, plus every video description.

## Step 11: Before you sell courses (later)

- **Payments:** the "Join early access" buttons are ready now. For real payments, use Razorpay (or a course platform such as Exly or TagMango). Payment confirmation must be checked on a **server**, never in the browser: use a small **Cloudflare Pages Function** plus the **Firebase Admin SDK** to write `purchases` into the user's profile after Razorpay's webhook confirms payment. Ask me when you're ready and I'll build it.
- **Policies:** review `privacy.html`, `terms.html` and `refund.html`, and make sure the numbers match what you actually offer. These are templates, not legal advice.
- **Tax:** online courses carry 18% GST, and registration is required above ₹20 lakh turnover (₹10 lakh in special-category states). Confirm with a CA.
- **Employer:** check your employment contract or HR policy on side income.

## Security checklist

- [ ] `firestore.rules` published (Step 4)
- [ ] Only your real domains in **Authorized domains**
- [ ] Email verification templates customised
- [ ] Firebase console → **App Check** (optional, recommended later) to block abuse
- [ ] Never put secret keys (Razorpay key secret, Firebase Admin key) in any file in this folder; they belong only on the server

## Updating the site

- **Edit text:** open the `.html` file, change it, and push to GitHub. The site updates in about a minute.
- **New lesson:** copy `lessons/recursion.html`, rename it, edit it, add it to `lessons.html`, `sitemap.xml` and the `LESSONS` list in `assets/site.js`, and add the video ID to `VIDEOS`. Or ask me to generate it.

© 2026 The Code Notebook

## Members-only pages (added in v3)

Lessons, the free resources (field guide and PDF) and the dashboard now need a free account.
Home, About, Courses, Contact, the policy pages, Login and Register stay public so people can find you and sign up.

How it works:
- After login, the website saves the user's Firebase login token in a cookie called `tcn_session` (valid for about 1 hour and refreshed automatically).
- `functions/_middleware.js` runs on Cloudflare before those pages are sent. It checks the token with Google's public keys. No token, or a wrong or expired one, means the visitor is sent to the login page and brought back after logging in.
- `_routes.json` makes this check run only on the members-only pages, so it stays within Cloudflare's free limits.
- Nothing secret is stored in these files.

After uploading to GitHub, open Cloudflare → Workers & Pages → thecodenotebook → Deployments → the newest deployment. You should see a **Functions** section listing `_middleware`.

To make another page members-only, add its path to `PROTECTED` in `functions/_middleware.js` and to `_routes.json`.
Search engines can't read members-only pages, so only the public pages are in `sitemap.xml`.

---

## What changed in v4 (Lessons 9-13)

Five new lesson pages are live: **Linked List, Stacks, Queues & Deques, Binary Search,
Trees & BST**. The Lessons page, the "Latest lessons" block on the home page and the
sitemap all update themselves, so there is nothing to edit for those.

### The one thing you still need to do: paste your YouTube IDs

Open `assets/firebase-config.js` and fill in the `VIDEOS` map. Take the part of the URL
after `watch?v=`:

    https://www.youtube.com/watch?v=abc123XYZ   ->   "abc123XYZ"

```js
export const VIDEOS = {
  "big-o": "abc123XYZ",
  "java-toolkit": "",
  "recursion": "",
  "math": "",
  "bits": "",
  "arrays": "",
  "strings": "",
  "hashing": "",
  "linked-list": "",
  "stacks": "",
  "queues": "",
  "binary-search": "",
  "trees": "",
};
```

A lesson with an empty string shows the "Watch on YouTube" button instead of an embedded
player, so you can fill them in a few at a time and nothing breaks.

### Uploading this version

1. On GitHub, delete the old files in the repo (or the extracted folder, if one is there).
2. Unzip this file and drag **the contents** of the `thecodenotebook` folder into the repo
   — `index.html` must sit at the top level, not inside a folder.
3. Commit. Cloudflare Pages redeploys on its own in a minute or two.
4. In the Cloudflare deployment log, check that the **Functions** section still appears.
   That is the members-only gate; if it is missing, the `functions/` folder did not upload.

---

## v5: the login redirect loop is fixed

**What was wrong.** The members-only gate runs on Cloudflare's servers and looks for a
cookie called `tcn_session`. If it didn't find one it sent you to `/login`. The login page
saw you were already signed in and sent you straight back — and round it went. Nothing
stopped that cycle, so the page just refreshed forever.

The usual reason the cookie went missing: the site answers on **two addresses**
(`thecodenotebook.com` and `www.thecodenotebook.com`). A cookie written on one of them is
not sent to the other, so signing in on one address and landing on the other looked exactly
like "not signed in".

**What changed:**

1. The cookie is now written for `.thecodenotebook.com`, so it works on **both** addresses.
2. The gate now gives up after **two** attempts and shows a page that says what went wrong,
   instead of redirecting again. A loop is no longer possible.
3. The login page checks whether the browser actually kept the cookie. If cookies are
   blocked you get a plain message instead of a bounce.
4. New page: **`/__gate-check`** — open it any time to see what the server received.

### If it ever misbehaves again: open /__gate-check

Visit `https://thecodenotebook.com/__gate-check` while signed in. You'll get something like:

```json
{ "signedIn": true, "reason": "ok", "cookieReceived": true, "host": "thecodenotebook.com" }
```

What the answers mean:

| What you see | What it means | Fix |
|---|---|---|
| `"reason": "no-cookie"` | The browser never sent the cookie | Allow cookies for the site; check you're on the same address you signed in on |
| `"reason": "wrong-project ..."` | The site and Firebase disagree | Make `PROJECT_ID` in `functions/_middleware.js` match `projectId` in `assets/firebase-config.js` |
| `"reason": "expired ..."` | The token timed out | Sign out and back in; this refreshes itself normally |
| `"reason": "could-not-reach-google-keys"` | Cloudflare couldn't reach Google | Temporary — try again in a minute |
| A 404 page | The Function isn't deployed | The `functions/` folder didn't upload, or `/__gate-check` is missing from `_routes.json` |

### Emergency switch: turn the gate off

If members pages are ever blocked and you need the site working *right now*:

Cloudflare dashboard → your Pages project → **Settings → Variables and Secrets** →
add a variable named `GATE` with the value `off` → redeploy.

Every page is then served without the server-side check (the pages still ask for login in the
browser). Delete the variable to switch the gate back on.
