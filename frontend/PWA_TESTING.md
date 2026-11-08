# Culinary PWA and Offline Cooking — testing guide

The PWA is designed to be tested **after a production frontend build**, not from Vite's `npm run dev` page. It does not require any additional npm package.

## Run locally

1. Start the existing Express backend and MongoDB as usual (port 5001).
2. In `frontend/`, run `npm ci`, `npm run build`, then `npm run preview -- --host 0.0.0.0`.
3. Open the preview URL on your Mac. This tests the built frontend and its API proxy.

Service workers require HTTPS (except local `localhost`/`127.0.0.1`). Ordinary `http://192.168.x.x` on an iPhone is useful for mobile layout testing but **not** the complete offline PWA test.

## Install on iPhone before deploying

1. While backend and preview are running, serve preview through a temporary **HTTPS** tunnel, e.g. `cloudflared tunnel --url http://localhost:4173` (using the port shown by Vite).
2. Open the temporary HTTPS URL in iPhone Safari. Use Share → **Add to Home Screen** → **Open as Web App** → Add.
3. **Launch Culinary from the Home Screen icon**, log in, and open a published recipe with cooking steps.
4. Tap **Save for offline cooking**. Verify it appears in **Offline Recipes**. Installations may use storage separate from Safari tabs, so downloading inside the installed app matters.
5. Enable Airplane Mode and launch the Home Screen app. The downloaded recipe, instructions, checklist, servings, and timers should still work. Changes should say “saved on this device.”
6. Reconnect with the backend running; launch Culinary while online. Saved cooking progress should sync to MongoDB. Verify by opening the same recipe in a new session while online.

Avoid exposing production credentials or a sensitive development backend through a temporary public tunnel; the URL is accessible to others who receive it. Keep the Mac and tunnel running while testing online features.

## Limitations and privacy

- Only **explicitly downloaded published recipes** are available offline. Other site content, comments, saved-recipes API, the AI chatbot, uploads, and live nutrition requests remain online-only.
- The service worker caches the application shell and static assets, **never authenticated `/api/` responses**. Recipes and their cooking progress are saved to browser IndexedDB, scoped by user ID; photos are cached separately on a best-effort basis.
- Offline access on a previously signed-in device uses a remembered local account identity, **not offline identity verification**. Anyone with access to an unlocked device/browser profile may be able to view offline downloads. Successful online logout clears local downloads; Offline Mode also offers **Remove offline data**.
- If a recipe was changed or another device updated cooking progress while offline, a sync may report a conflict (`409`). Local pending progress is retained rather than silently overwriting the server. To reset, review the online recipe and re-download it; doing so may discard the old offline session.
- Countdown timers use stored deadlines and remain accurate after a pause/reopen. **Sound/background notifications are not guaranteed** when iOS suspends or closes the app.
- iOS and other browsers may evict site storage if space is low. Offline downloads are not a permanent backup.
- Update deployments must run `npm run build` (not `vite build` alone), since the script generates a versioned `/sw.js` with the production asset precache list.
