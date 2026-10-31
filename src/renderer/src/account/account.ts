import { useSyncExternalStore } from 'react'
import { i18n } from '../i18n'
import type { User } from '../platform/webFirebase'

/**
 * Who is signed in and what they may export. Exports need an account: the first few are free,
 * then a plan (monthly or lifetime). The counting happens in the account functions
 * (functions/src/billing); this only asks them, and never knows which payment provider sells the
 * plans: it gets a checkout page's URL and opens it.
 */

export type PlanId = 'monthly' | 'lifetime'

/** As functions/src/billing/types.ts sends it. */
export interface Entitlement {
  plan: 'free' | PlanId
  unlimited: boolean
  freeLimit: number
  freeUsed: number
  freeLeft: number
  periodEnd?: number
  cancelAtPeriodEnd?: boolean
  canManage: boolean
  plans: { id: PlanId; price: number; currency: string; interval: 'month' | null }[]
  checkout: boolean
  /** May open the back office. Only shows the menu entry: the server checks every admin call. */
  admin?: boolean
}

export type AccountDialog =
  | { kind: 'signIn'; reason: 'export' | 'search' | 'menu' }
  | { kind: 'plans'; reason: 'limit' | 'menu' }
  | { kind: 'account' }
  | { kind: 'admin' }
  | { kind: 'invite'; /** Why it can't be claimed, once the server said so. */ problem?: string }
  | { kind: 'inviteDone' }
  | { kind: 'paid' }
  | { kind: 'error'; message: string }

export interface AccountState {
  /** Firebase has said whether anyone is signed in. */
  ready: boolean
  user: User | null
  entitlement: Entitlement | null
  dialog: AccountDialog | null
  /** A sign-in or checkout under way (its button shows it). */
  pending: 'signIn' | PlanId | 'portal' | 'invite' | null
  /** What went wrong in the open dialog. */
  error: string | null
}

let state: AccountState = { ready: false, user: null, entitlement: null, dialog: null, pending: null, error: null }
const listeners = new Set<() => void>()
const setState = (p: Partial<AccountState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}

export const useAccount = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => state
  )

type Fb = typeof import('../platform/webFirebase')
let fbLoad: Promise<Fb> | null = null
/** Firebase, loaded the first time; the editor never waits for it. */
const fb = () => (fbLoad ??= import('../platform/webFirebase').then(start))

/** The invite code from the link this tab was opened with, until it is claimed. */
let invite: string | null = null

/** Someone waiting on the sign-in dialog (an export, a YouTube search). */
let waiting: ((signedIn: boolean) => void) | null = null

function start(m: Fb): Fb {
  m.setSignInPrompt(() => askSignIn('search'))
  m.onUser((user) => {
    setState({ ready: true, user, entitlement: user && state.user?.uid === user.uid ? state.entitlement : null })
    if (user) {
      void refresh()
      if (state.dialog?.kind === 'signIn') setState({ dialog: null, pending: null, error: null })
      waiting?.(true)
      waiting = null
      // Signed in from an invite link's dialog: claim it straight away.
      if (state.dialog?.kind === 'invite' && invite) void claimInvite()
    }
  })
  return m
}

/** Starts loading the account in the background (after the editor is up). */
export function loadAccount() {
  // Back from a checkout, in the tab the provider opened: say so, and leave the URL clean.
  const q = new URLSearchParams(location.search)
  if (q.get('checkout') === 'done') setState({ dialog: { kind: 'paid' } })
  // An invite link (app.html?invite=CODE): offer it, and claim it once signed in.
  const code = q.get('invite')?.trim().toUpperCase()
  if (code) {
    invite = code
    setState({ dialog: { kind: 'invite' } })
  }
  if (q.has('checkout') || q.has('invite')) {
    q.delete('checkout')
    q.delete('invite')
    history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash)
  }
  void fb()
  // Coming back to the tab (from a checkout, say) picks up a plan bought meanwhile.
  let last = 0
  window.addEventListener('focus', () => {
    if (state.user && Date.now() - last > 5000) {
      last = Date.now()
      void refresh()
    }
  })
}

const call = async <Res>(name: Parameters<Fb['callAccount']>[0], data?: unknown) => (await fb()).callAccount<unknown, Res>(name, data)

/** One of the back office's calls (functions/src/billing/admin.ts). The server refuses non-admins. */
export const callAdmin = <Res>(name: 'adminListUsers' | 'adminAddExports' | 'adminSetPlan' | 'adminCreateInvite' | 'adminListInvites' | 'adminRevokeInvite', data?: unknown) => call<Res>(name, data)

/** Who is signed in now, for checking an export ticket is theirs. */
export const currentUid = () => state.user?.uid

/** Reloads what the signed-in user may do. */
export async function refresh(): Promise<Entitlement | null> {
  if (!state.user) return null
  try {
    const entitlement = await call<Entitlement>('accountStatus')
    setState({ entitlement })
    return entitlement
  } catch (e) {
    console.warn('Account status', e)
    return null
  }
}

export function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const key = (
    {
      'auth/popup-blocked': 'account.errors.popupBlocked',
      'auth/network-request-failed': 'account.errors.offline',
      'functions/unavailable': 'account.errors.offline',
      'functions/internal': 'account.errors.server',
      'functions/not-found': 'account.errors.server',
      'functions/permission-denied': 'admin.notAdmin'
    } as Record<string, string>
  )[code]
  return key ? i18n.t(key as 'account.errors.server') : String((e as Error)?.message ?? e)
}

const INVITE_PROBLEMS = ['invalid', 'revoked', 'expired', 'used-up', 'already-lifetime'] as const

/** Claims the invite link this tab was opened with: the signed-in user gets Lifetime. */
export async function claimInvite() {
  if (!invite || state.pending === 'invite') return
  setState({ pending: 'invite', error: null })
  try {
    const entitlement = await call<Entitlement>('redeemInviteLink', { code: invite })
    invite = null
    setState({ entitlement, pending: null, dialog: { kind: 'inviteDone' } })
  } catch (e) {
    // The server's reason, without the status the emulator adds ("used-up [400]").
    const msg = String((e as { message?: string })?.message ?? '').replace(/\s*\[\d+\]$/, '') as (typeof INVITE_PROBLEMS)[number]
    if (!INVITE_PROBLEMS.includes(msg)) return setState({ pending: null, error: errorText(e) })
    invite = null
    setState({ pending: null, dialog: { kind: 'invite', problem: i18n.t(`account.invite.problem.${msg}`) } })
  }
}

/** Opens the sign-in dialog; true once someone signs in, false if it's closed. */
export function askSignIn(reason: 'export' | 'search' | 'menu'): Promise<boolean> {
  waiting?.(false)
  setState({ dialog: { kind: 'signIn', reason }, error: null, pending: null })
  void fb()
  return new Promise((resolve) => (waiting = resolve))
}

export async function signInWithGoogle() {
  setState({ pending: 'signIn', error: null })
  try {
    await (await fb()).signIn()
  } catch (e) {
    const code = (e as { code?: string })?.code
    const closed = code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
    setState({ pending: null, error: closed ? null : errorText(e) })
  }
}

export async function signOut() {
  setState({ dialog: null })
  await (await fb()).signOut()
}

export function openDialog(dialog: AccountDialog) {
  setState({ dialog, error: null, pending: null })
  if (dialog.kind === 'plans' || dialog.kind === 'account') void refresh()
}

export function closeDialog() {
  setState({ dialog: null, error: null, pending: null })
  waiting?.(false)
  waiting = null
}

/**
 * Before asking where to save an export: false (and the sign-in or plans dialog opens) when it
 * can't start. It doesn't wait on the network when it can help it, so the save dialog that comes
 * next still counts as opened by the click.
 */
export async function beforeExport(): Promise<boolean> {
  await fb()
  // Someone signing in clicks Export again after: the browser only opens a save dialog from a click.
  if (!state.user) return void askSignIn('export'), false
  const ent = state.entitlement ?? (await refresh())
  if (ent && !ent.unlimited && ent.freeLeft <= 0) return void openDialog({ kind: 'plans', reason: 'limit' }), false
  return true
}

/**
 * Spends an export on the server (free ones are counted there); its id (to settle once the export
 * ends) and signed ticket, or null when it can't start (the plans or an error show).
 */
export async function claimExport(kind: 'set' | 'clip'): Promise<{ id: string; ticket: string } | null> {
  try {
    const r = await call<{ ok: boolean; id?: string; ticket?: string; entitlement: Entitlement }>('claimExport', { kind })
    setState({ entitlement: r.entitlement })
    if (r.ok && r.id && r.ticket) return { id: r.id, ticket: r.ticket }
    openDialog({ kind: 'plans', reason: 'limit' })
  } catch (e) {
    openDialog({ kind: 'error', message: i18n.t('account.errors.claim', { error: errorText(e) }) })
  }
  return null
}

/** An export ended: a failed or cancelled one gives its free export back. */
export function settleExport(id: string, ok: boolean) {
  call<Entitlement>('settleExport', { id, ok }).then(
    (entitlement) => setState({ entitlement }),
    (e) => console.warn('Settle export', e)
  )
}

/**
 * Opens the provider's page (checkout, or managing a plan) in a new tab, so the project stays
 * open here. The tab opens at once, during the click, so the browser doesn't block it.
 */
async function openProviderPage(pending: PlanId | 'portal', get: () => Promise<{ url: string }>) {
  const tab = window.open('', '_blank')
  setState({ pending, error: null })
  try {
    const { url } = await get()
    if (tab) tab.location.href = url
    else location.href = url
    setState({ pending: null })
    void refresh()
  } catch (e) {
    tab?.close()
    const msg = (e as { message?: string })?.message
    setState({ pending: null, error: msg === 'billing-unavailable' ? i18n.t('account.plans.soon') : msg === 'already-paid' ? i18n.t('account.plans.alreadyPaid') : errorText(e) })
  }
}

const returnUrl = () => location.origin + location.pathname

export const buyPlan = (plan: PlanId) => openProviderPage(plan, () => call('startCheckout', { plan, returnUrl: returnUrl() }))
export const managePlan = () => openProviderPage('portal', () => call('billingPortal', { returnUrl: returnUrl() }))
