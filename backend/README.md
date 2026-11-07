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
