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
| `providers/` | Its implementations: `none` (default, plans "coming soon"), `fake` (emulators only) |

An export: the app asks `claimExport` before it starts (a free account spends one, or gets the
plans), and `settleExport` when it ends. A failed or cancelled export gives its free one back.

`claimExport` also returns a **ticket** signed with the EXPORT_TICKET_KEY secret (`ticket.ts`). The
app checks it with the public key it ships with (`src/renderer/src/account/ticket.ts`) and won't
render without a valid one; the ticket id goes into the MP4's comment tag. This can't make the
browser tamper-proof, but skipping the payment check means rewriting the app's code.

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
