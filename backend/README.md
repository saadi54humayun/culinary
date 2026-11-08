# Culinary backend

## Gemini cooking assistant

Copy `.env.example` to `.env`, then set `GEMINI_API_KEY` to a Gemini API key.
`GEMINI_MODEL` is optional and defaults to `gemini-3.1-flash-lite`, a
free-tier-friendly option for this chat and recipe-tool workload. Free-tier
quotas still apply, so the app asks users to wait when Gemini returns a 429.
`GEMINI_TIMEOUT_MS` is optional and defaults to 45,000 milliseconds (45 seconds).

The browser calls the authenticated `POST /api/ai-chat` endpoint. The server
keeps the API key private, limits each signed-in user to ten requests per
minute, and lets Gemini look up only published Culinary recipes through
validated, bounded tools. If the key is missing, the endpoint returns a clear
configuration error without revealing configuration values.

For local development, start the backend as usual and use the Ask Culinary
panel on Discover or Following. Do not put the key in the frontend or commit
your `.env` file.

## Email OTP verification and password recovery

New accounts are created pending verification and must enter the six-digit
email code before logging in. Accounts that existed before this rollout retain
access: `verificationRequired` is set only for new signups, so no bulk user
migration is needed. Existing sessions without a `sessionVersion` are
intentionally invalidated once so password resets can invalidate every active
session reliably.

Set `OTP_SECRET` to a separate random value (32+ characters), then configure
the `SMTP_*` values and `MAIL_FROM` shown in `.env.example`. `SMTP_SECURE=true`
is normally for port 465; use `false` for STARTTLS on port 587. For isolated
tests or UI work, `MAIL_MODE=preview` suppresses SMTP delivery. It does not
print codes and therefore cannot complete a real email verification flow.

Codes are HMAC-protected, expire in ten minutes, allow five attempts, and are
invalidated by resend. Password-reset grants are stored only as hashes and are
sent in a short-lived HttpOnly cookie, never in browser storage or a URL.

## USDA recipe nutrition and weekly meal planner

Set `USDA_API` in `backend/.env` to a FoodData Central API key. It is read by
Express only and must never be prefixed `VITE_` or committed to Git.

- `POST /api/recipes/:id/nutrition/analyze` estimates a published recipe's
  per-recipe and per-serving calories, protein, carbs, fat and fiber (drafts
  may be analyzed only by their author). The recipe details screen calculates
  missing estimates automatically on first view.
- `GET /api/meal-plans/:weekStart/nutrition` returns cached daily/weekly
  planned totals, a seven-day average, per-meal values and coverage status.
- `POST /api/meal-plans/:weekStart/nutrition/analyze` analyzes up to eight
  distinct, not-yet-analyzed recipes per call; the planner starts this
  automatically and offers a button if more remain. Auth is required.

Nutrient estimates are saved to the Recipe document and invalidated when
ingredients or serving yields change. An in-memory USDA search cache reduces
duplicate external requests during the same server process. No DB migration
is required: existing recipes are analyzed lazily. Food names are matched by
text, so the UI shows each USDA match and warns when it cannot calculate an
ingredient. Weight conversions for cups and individual items are approximate.
Unknown ingredients are **not** treated as zero; incomplete totals are marked
as partial. Numbers are *planned* nutrition, not consumption tracking or
clinical dietary advice. USDA may rate-limit requests; see
https://fdc.nal.usda.gov/api-guide/.

Run `npm test` inside `backend` to test the nutrition calculations with
mocked USDA responses; a live USDA key/database is needed for an end-to-end
integration test.

## AI weekly meal planner and searchable recipe picker

The weekly planner now uses `GET /api/meal-plans/recipes?scope=saved|mine|discover&search=&page=0`.
It searches **published** recipes only, with server-side search and pagination,
instead of loading an entire user's saved and authored collections into dropdowns.

AI planning uses the same server-only `GEMINI_API_KEY` and optional `GEMINI_MODEL`
as the cooking assistant. No new dependency or frontend API key is needed.

- `POST /api/meal-plans/:weekStart/suggestions` accepts `{ goal, diet,
  maxMinutes, notes, overwriteExisting }`. It returns an **unsaved preview**.
  By default only empty meal slots are suggested; choosing overwrite generates
  a replacement for all 21 slots. The API limits each signed-in user to three
  generation calls every ten minutes.
- `POST /api/meal-plans/:weekStart/apply-suggestions` accepts
  `{ meals: [{ day, mealType, recipeId }], overwriteExisting }` after the user
  reviews the preview. The backend revalidates every recipe and slot; it rejects
  conflicts if the user did not opt in to replacement. Bulk writes on a
  standalone local MongoDB are not a transaction. If saving reports an error,
  reload the planner to confirm which slots were updated.

Gemini only receives candidate published recipe titles, categories, ingredient
names, cooking times and optional cached protein estimates; suggested IDs are
validated against that candidate set before display. Catalog fallbacks are
marked when Gemini omits a slot. Vegetarian/vegan filtering is conservative
text matching and **is not allergy-safe or medically certified**. Users must
review recipe ingredients before cooking. The planner displays estimated
nutrition and grocery lists using the existing meal-plan and USDA logic.
