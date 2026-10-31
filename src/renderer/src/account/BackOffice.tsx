import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons'
import { lang } from '../i18n'
import { callAdmin, closeDialog, errorText, refresh } from './account'

/**
 * The back office, for the owner: everyone who signed up, newest first, with their plan and
 * exports, and a panel to give a user more free exports or a plan without a payment.
 *
 * Only admins see the entry (the server says who is one), and the server checks again on every
 * call (functions/src/billing/admin.ts), so this screen holds no secrets of its own.
 */

/** As functions/src/billing/admin.ts sends it. */
export interface AdminUser {
  uid: string
  name: string
  email: string
  photo?: string
  createdAt: number
  lastSignInAt?: number
  plan: 'free' | 'monthly' | 'lifetime'
  planSource: 'paid' | 'granted' | null
  grantedUntil?: number
  freeLimit: number
  freeUsed: number
  bonusExports: number
  exportsTotal: number
  admin: boolean
}

const DAY = 24 * 3600 * 1000
const date = (ms: number) => new Date(ms).toLocaleDateString(lang(), { dateStyle: 'medium' })

export function BackOffice() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    setError(null)
    callAdmin<{ users: AdminUser[]; total: number }>('adminListUsers').then(
      (r) => live && (setUsers(r.users), setTotal(r.total)),
      (e) => live && setError(errorText(e))
    )
    return () => void (live = false)
  }, [reload])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (users ?? []).filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, query])
  const now = Date.now()
  const newThisWeek = (users ?? []).filter((u) => now - u.createdAt < 7 * DAY).length
  const paying = (users ?? []).filter((u) => u.plan !== 'free').length
  const user = users?.find((u) => u.uid === selected) ?? null
  const replace = (u: AdminUser) => {
    setUsers((list) => list?.map((x) => (x.uid === u.uid ? u : x)) ?? null)
    // Changing your own account shows at once in the account dialog and the export button.
    void refresh()
  }

  return (
    <div className="modal-backdrop account-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <div className="modal admin-modal" role="dialog" aria-label={t('admin.title')}>
        <div className="modal-head">
          <h3>{t('admin.title')}</h3>
          <button className="icon-btn" onClick={closeDialog}>
            <Icon name="close" />
          </button>
        </div>
        <div className="admin-bar">
          <div className="admin-stats">
            <span>
              <b>{users ? total : '–'}</b> {t('admin.statUsers')}
            </span>
            <span>
              <b>{users ? newThisWeek : '–'}</b> {t('admin.statNew')}
            </span>
            <span>
              <b>{users ? paying : '–'}</b> {t('admin.statPlans')}
            </span>
          </div>
          <div className="grow" />
          <input type="text" className="admin-search" placeholder={t('admin.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn small" onClick={() => setReload((n) => n + 1)}>
            {t('admin.reload')}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="admin-body">
          <div className="admin-list">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.colUser')}</th>
                  <th className="admin-col-date">{t('admin.colJoined')}</th>
                  <th className="admin-col-plan">{t('admin.colPlan')}</th>
                  <th className="num admin-col-exports">{t('admin.colExports')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.uid} className={u.uid === selected ? 'on' : ''} onClick={() => setSelected(u.uid)}>
                    <td>
                      <div className="admin-who">
                        <Avatar u={u} />
                        <div>
                          <div className="admin-name">
                            {u.name || u.email}
                            {now - u.createdAt < 7 * DAY && <span className="admin-new">{t('admin.new')}</span>}
                          </div>
                          {u.name && <div className="muted small">{u.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="muted admin-date">{date(u.createdAt)}</td>
                    <td>
                      <PlanCell u={u} />
                    </td>
                    <td className="num">
                      <ExportsCell u={u} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users && !error && <p className="muted admin-empty">{t('account.loading')}</p>}
            {users && !shown.length && <p className="muted admin-empty">{t(users.length ? 'admin.noMatch' : 'admin.noUsers')}</p>}
            {users && total > users.length && <p className="muted small admin-empty">{t('admin.newestOnly', { count: users.length, total })}</p>}
          </div>
          <aside className="admin-side">{user ? <UserPanel key={user.uid} u={user} onChange={replace} /> : <p className="muted">{t('admin.pick')}</p>}</aside>
        </div>
      </div>
    </div>
  )
}

function Avatar({ u }: { u: AdminUser }) {
  return u.photo ? <img className="avatar" src={u.photo} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(u.name || u.email || '?').trim()[0]?.toUpperCase()}</span>
}

function PlanCell({ u }: { u: AdminUser }) {
  const { t } = useTranslation()
  const name = t(u.plan === 'lifetime' ? 'account.planLifetime' : u.plan === 'monthly' ? 'account.planMonthly' : 'account.planFree')
  return (
    <span className={`admin-plan ${u.plan}`}>
      {name}
      {u.planSource === 'granted' && <span className="muted small"> · {u.plan === 'monthly' && u.grantedUntil ? t('admin.givenUntil', { date: date(u.grantedUntil) }) : t('admin.given')}</span>}
    </span>
  )
}

function ExportsCell({ u }: { u: AdminUser }) {
  const { t } = useTranslation()
  if (u.plan !== 'free') return <span>{u.exportsTotal}</span>
  const left = Math.max(0, u.freeLimit - u.freeUsed)
  return (
    <span title={t('admin.freeOf', { used: u.freeUsed, limit: u.freeLimit })}>
      {u.exportsTotal} <span className={`muted small ${left ? '' : 'admin-out'}`}>· {t('admin.left', { count: left })}</span>
    </span>
  )
}

/** The selected user: who they are, and what can be given to them. */
function UserPanel({ u, onChange }: { u: AdminUser; onChange: (u: AdminUser) => void }) {
  const { t } = useTranslation()
  const [count, setCount] = useState(3)
  const [months, setMonths] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const run = async (what: string, name: 'adminAddExports' | 'adminSetPlan', data: object, message: string) => {
    setBusy(what)
    setError(null)
    setDone(null)
    try {
      onChange(await callAdmin<AdminUser>(name, { uid: u.uid, ...data }))
      setDone(message)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }
  const left = Math.max(0, u.freeLimit - u.freeUsed)

  return (
    <div className="admin-panel">
      <div className="admin-who">
        <Avatar u={u} />
        <div>
          <div className="admin-name">{u.name || u.email}</div>
          {u.name && <div className="muted small">{u.email}</div>}
        </div>
      </div>
      <dl className="admin-facts">
        <dt>{t('admin.joined')}</dt>
        <dd>{date(u.createdAt)}</dd>
        {u.lastSignInAt && (
          <>
            <dt>{t('admin.lastSeen')}</dt>
            <dd>{date(u.lastSignInAt)}</dd>
          </>
        )}
        <dt>{t('admin.colPlan')}</dt>
        <dd>
          <PlanCell u={u} />
        </dd>
        <dt>{t('admin.colExports')}</dt>
        <dd>{t('admin.exportsTotal', { count: u.exportsTotal })}</dd>
        <dt>{t('admin.free')}</dt>
        <dd>
          {t('admin.freeOf', { used: u.freeUsed, limit: u.freeLimit })}
          {u.bonusExports > 0 && <span className="muted small"> · {t('admin.extra', { count: u.bonusExports })}</span>}
        </dd>
      </dl>

      <h4>{t('admin.giveExports')}</h4>
      <div className="row">
        <div className="seg admin-stepper">
          <button onClick={() => setCount((c) => Math.max(1, c - 1))}>
            <Icon name="minus" size={10} />
          </button>
          <span>{count}</span>
          <button onClick={() => setCount((c) => Math.min(100, c + 1))}>
            <Icon name="plus" size={10} />
          </button>
        </div>
        <button className="btn small primary" disabled={!!busy} onClick={() => void run('add', 'adminAddExports', { count }, t('admin.gaveExports', { count }))}>
          {busy === 'add' ? t('admin.saving') : t('admin.give')}
        </button>
        <div className="grow" />
        <button
          className="btn small ghost"
          disabled={!!busy || u.bonusExports <= 0}
          title={t('admin.takeBackTitle')}
          onClick={() => void run('take', 'adminAddExports', { count: -Math.min(count, u.bonusExports) }, t('admin.tookExports', { count: Math.min(count, u.bonusExports) }))}
        >
          {t('admin.takeBack')}
        </button>
      </div>
      {u.plan === 'free' && <p className="muted small">{t('admin.leftNow', { count: left })}</p>}

      <h4>{t('admin.givePlan')}</h4>
      <div className="admin-plan-choices">
        <div className="row">
          <button className="btn small" disabled={!!busy || (u.planSource !== 'granted' && u.plan === 'lifetime')} onClick={() => void run('monthly', 'adminSetPlan', { plan: 'monthly', months }, t('admin.gaveMonthly', { count: months }))}>
            {busy === 'monthly' ? t('admin.saving') : t('admin.giveMonthly')}
          </button>
          <div className="seg admin-stepper">
            <button onClick={() => setMonths((m) => Math.max(1, m - 1))}>
              <Icon name="minus" size={10} />
            </button>
            <span>{t('admin.months', { count: months })}</span>
            <button onClick={() => setMonths((m) => Math.min(24, m + 1))}>
              <Icon name="plus" size={10} />
            </button>
          </div>
        </div>
        <button className="btn small" disabled={!!busy || u.plan === 'lifetime'} onClick={() => void run('lifetime', 'adminSetPlan', { plan: 'lifetime' }, t('admin.gaveLifetime'))}>
          {busy === 'lifetime' ? t('admin.saving') : t('admin.giveLifetime')}
        </button>
        {u.planSource === 'granted' && (
          <button className="btn small danger" disabled={!!busy} onClick={() => void run('free', 'adminSetPlan', { plan: 'free' }, t('admin.removed'))}>
            {busy === 'free' ? t('admin.saving') : t('admin.removePlan')}
          </button>
        )}
      </div>
      {u.planSource === 'paid' && <p className="muted small">{t('admin.paidNote')}</p>}
      {done && (
        <p className="admin-done small">
          <Icon name="check" size={11} /> {done}
        </p>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
