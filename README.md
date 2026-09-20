<img width="289" height="930" alt="Captura de pantalla 2026-09-19 a la(s) 11 51 02 p m" src="https://github.com/user-attachments/assets/236f1228-63ba-4233-b74c-ef23f30486f6" />
<img width="289" height="932" alt="Captura de pantalla 2026-09-19 a la(s) 11 56 01 p m" src="https://github.com/user-attachments/assets/77c38675-eacb-4452-968d-95cbc71443a6" />
<img width="290" height="1066" alt="Captura de pantalla 2026-09-19 a la(s) 11 55 04 p m" src="https://github.com/user-attachments/assets/ef0af0c2-b85d-416e-864d-ab71717a3716" /># Eos · Personalized Tracker
<img width="292" height="931" alt="Captura de pantalla 2026-09-19 a la(s) 11 52 42 p m" src="https://github.com/user-attachments/assets/7ca79ccd-dd54-40f2-b4d9-f6492cd73cb7" />
<img width="284" height="931" alt="Captura de pantalla 2026-09-19 a la(s) 11 51 44 p m" src="https://github.com/user-attachments/assets/8b481396-53d6-460e-a2db-278fbcdb88a3" />
<img width="289" height="929" alt="Captura de pantalla 2026-09-19 a la(s) 11 51 28 p m" src="https://github.com/user-attachments/assets/505f00e9-11f1-4550-afa0-6964e36c98a5" />

A single-user personal tracker for habits, daily tasks, weekly goals, personal
finances, ideas and a private journal — built by and for one person, not as a
multi-tenant product.

**Live demo:** https://productividad.osdaolfonabaco.workers.dev

Sign-up is locked to the owner's email address, so the demo is browsable as a
UI but not as an account you can create. The interface is in Spanish.

## The problem

Tracking habits, money and personal notes usually means three or four separate
apps that never see each other's data, so nothing can relate "I skipped this
habit all week" to "this was the week I overspent". Eos keeps those records in
one place, under one account, with a mentor layer that reads the real history
and writes a short analysis instead of showing charts. The journal is the
exception on purpose: it is end-to-end encrypted and never reaches the AI.

## Features

- **Today** — the day's habits in three states (done / not done / unanswered),
  today's and overdue tasks, a one-line note about the day, and an on-demand AI
  analysis of the last 14 days.
- **Life** — a 7-day plan, a week grid of habits × days with weekly goals and
  completion dashboard, habit CRUD, and the encrypted journal.
- **Money** — salary by fortnight with fixed expenses and a savings goal,
  income/expense movements with per-category breakdown, and debts with
  payments, balance and interest rate.
- **Ideas** — a capture list with states, and a per-idea AI reading that sees
  nothing but that one idea.
- **Mentor** — history of every analysis, a rewritten long-term summary, the
  user's stated purpose, and one concrete improvement proposal per week
  (or none, if the model has nothing worth proposing).
- **Settings** — tone of the AI, whether the mentor may see money at all, push
  reminders at up to two times a day, and full JSON backup export/import.

## Architecture

- **Client:** React 19 + TypeScript, Vite, Tailwind CSS 4. Mobile-first, no
  router — navigation is four tabs plus sub-sections in component state.
  Installable as a PWA (manifest, icons, service worker). Deployed as a static
  build on Cloudflare Workers.
- **Backend:** Supabase. Postgres with row-level security on every table
  (`user_id = auth.uid()`), magic-link auth, and Deno Edge Functions. The
  schema and each later migration live as plain `.sql` files in `supabase/`.
- **Data layer:** every read and write goes through `src/data/`. No component
  imports the Supabase client; views call functions like `listHabits()` or
  `getPeriodBreakdown()` and get domain types back.
- **AI:** one Edge Function (`analyze`) serves five prompt types — daily,
  weekly, idea, summary and proposal. It holds no database access at all: the
  client assembles the payload, the function calls Gemini, the client decides
  what to store.
- **Reminders:** `pg_cron` calls a `send-reminders` function every five
  minutes; it checks who is due a reminder in their own timezone and sends Web
  Push. The notification's action buttons are answered by the service worker,
  which has no session, so they authenticate with a short signed token issued
  by the reminder itself rather than a user JWT.
- **Tests:** Vitest, covering the crypto round-trips.

## Technical decisions

**The journal is end-to-end encrypted: every new note is written as ciphertext
and the server never holds the key.** Each note is encrypted with AES-GCM under
a 256-bit data key (DEK). The DEK is never stored in the clear: it is wrapped
twice, once with a key derived from the user's password and once with a key
derived from a recovery code, both via PBKDF2-HMAC-SHA256 at 600,000 iterations
with separate random salts. Changing the password rewraps only the first copy,
so the recovery code keeps working. There is no separate password verifier — a
wrong password simply fails the AES-GCM authentication tag. The DEK lives in
React state only: it is dropped when you navigate away from the journal tab, and
it is never written to `localStorage`, `sessionStorage`, IndexedDB, cookies or
the URL. The consequence is accepted rather than worked around: lose both the
password and the recovery code and the notes are gone.

**The journal is structurally excluded from the AI, not filtered out.** The
analysis module never imports the journal module, so there is no code path
where a note could reach the prompt builder — the exclusion is a missing
import, not a condition someone could get wrong later. The mentor reads habits,
tasks, goals, day comments and (optionally) aggregated money figures; the same
principle applies inside that data, where expenses travel as per-category
totals rather than individual line items, and the per-idea analysis receives
only that idea's text and status.

**Secrets are split by who is allowed to see them.** The client only ever
holds values that are public by design — Supabase project URL, anon key, VAPID
public key — as `VITE_*` environment variables; `.env.example` is committed so
the required variables are documented, `.env.local` is gitignored. Anything
genuinely secret (the Gemini API key, the VAPID private key, the cron secret,
the reminder token secret) exists only as an Edge Function secret and is read
from `Deno.env` at runtime. The scheduled job is the awkward case, because a
`pg_cron` entry is stored SQL that would otherwise contain its own credentials
in plain text: it reads the project URL, the anon key and the cron secret from
Supabase Vault at call time instead.

**History is append-only and dates are strings.** Habits, debts and journal
notes are archived, never deleted, so a rename or a cleanup can't rewrite what
actually happened on a past day — which is what makes the mentor's analysis
worth anything. Dates are stored as `YYYY-MM-DD` text rather than timestamps,
which removes the entire class of timezone bugs that daily-tracking apps run
into. Backup export deliberately skips three tables: the journal key (replacing
it would make every encrypted note unreadable forever), push subscriptions and
the reminder log.


