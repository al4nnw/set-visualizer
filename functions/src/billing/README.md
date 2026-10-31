# Accounts, free exports and plans

Exports need an account (Google sign-in). Everyone gets **3 free exports** (sets or clips, once, not per month).
After that a plan is needed: **Monthly** (US$10, unlimited while it runs) or **Lifetime** (US$45,
paid once). The prices and the free count live in `plans.ts`.

The render stays in the browser. The server only counts, and only stores the account: plan,
free exports used, and one small record per export (when, free or paid, how it ended). Never the
set, its file name, tracks or artwork.

## How it fits together

| File | What it does |
| --- | --- |
| `plans.ts` | The plans, prices, free exports, grace period |
| `entitlements.ts` | The rules, as pure functions (tested in `test/billing.test.ts`) |
| `types.ts` | The Firestore account, the provider-neutral `BillingEvent`, what the app is told |
| `store.ts` | Firestore transactions (`users/{uid}`, `users/{uid}/exports`, `billingEvents`) |
| `functions.ts` | The callable functions the app uses, and the provider's webhook |
| `provider.ts` | **The payment provider interface** |
| `admin.ts` | The back office's callables: list users, give free exports, give or take away a plan, invite links (and claiming one) |
| `providers/` | Its implementations: `none` (default, plans "coming soon"), `fake` (emulators only) |

An export: the app asks `claimExport` before it starts (a free account spends one, or gets the
plans), and `settleExport` when it ends. A failed or cancelled export gives its free one back.

`claimExport` also returns a **ticket** signed with the EXPORT_TICKET_KEY secret (`ticket.ts`). The
app checks it with the public key it ships with (`src/renderer/src/account/ticket.ts`) and won't
render without a valid one; the ticket id goes into the MP4's comment tag. Its `paid` flag (set on
Monthly and Lifetime) makes the export render without the REKCUT watermark. This can't make the
browser tamper-proof, but skipping the payment check means rewriting the app's code.

## Back office

Account ▸ Back office (admins only) lists everyone who signed up and can:

- **Give free exports**: `bonusExports` on the account, added to the 3 everyone gets. Taking them
  back never goes below the 3.
- **Give a plan, no payment**: `granted` on the account, Monthly for 1 to 24 months (it ends, it
  doesn't renew) or Lifetime. It counts like a bought plan, so those exports have no watermark.
  It sits beside anything bought through the provider and never cancels it: a paid plan is
  cancelled or refunded with the provider.

- **Invite links**: `invites/{code}`, made in the Invite links tab with a number of uses (1 to
  100), an optional expiry and a note only admins see. Opening `app.html?invite=CODE` and signing
  in gives Lifetime (`granted` with `invite: CODE`), once per user. Someone who already has
  Lifetime doesn't use up a place. Revoking a link stops it; Lifetime already claimed stays.

An admin is a user with a document at `admins/{uid}`. Add one with
`npm run make-admin -- you@example.com` (production needs `gcloud auth application-default login`;
add `--emulators` for local runs, `--remove` to take it away), or in the Firebase console:
Firestore → collection `admins` → document id = the user's UID from Authentication → Users. The
user must have signed in once. Each change is noted in `adminLog` (who, which user, what, when).

## Adding a payment provider (Paddle, Stripe, ...)

1. Write `providers/<name>.ts` implementing `PaymentProvider`:
   - `createCheckout`: create the provider's hosted checkout for the plan and return its URL. Pass
     `uid` as the provider's custom data / client reference: webhooks find the user by it.
   - `portalUrl`: the provider's customer portal (manage, cancel), if it has one.
   - `parseWebhook`: verify the signature (keep the secret in Secret Manager with `defineSecret`)
     and turn the provider's events into `BillingEvent`s: subscription created/renewed/past due/
     canceled → `subscription`, one-off purchase → `lifetime.purchased`, refund → `lifetime.refunded`.
2. Add it to `providers/index.ts`.
3. Set `BILLING_PROVIDER=<name>` in `functions/.env` and point the provider's webhook at
   `https://southamerica-east1-set-visualizer-app.cloudfunctions.net/billingWebhook`.

Nothing else changes: the app only ever gets a checkout URL and opens it.

## Trying it locally

```sh
npm run emulators       # Auth, Functions and Firestore emulators, with the fake provider
npm run dev:emulators   # the app, talking to them
```

The fake provider "pays" as soon as a plan is chosen. In the emulator build, `emulatorSignIn(email)`
in the browser console signs in without Google's popup.

## Firebase setup (once)

- **Firestore**: Console → Build → Firestore Database → Create database, location
  `southamerica-east1`, production mode. Needed before this is deployed, or exports can't start.
- **Export ticket key**: `npm run ticket-key`, signed in to the Firebase CLI. It sets the
  EXPORT_TICKET_KEY secret and writes the matching public key into the app; commit that change.
  Needed before deploying, or the deploy fails.
- **Sign-in**: Google only (already on in Authentication → Sign-in method).
