import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons'
import { lang } from '../i18n'
import { BackOffice } from './BackOffice'
import { buyPlan, closeDialog, managePlan, openDialog, signInWithGoogle, signOut, useAccount, type Entitlement, type PlanId } from './account'

function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop account-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <div className="modal small-modal account-modal" role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={closeDialog}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const price = (p: Entitlement['plans'][number]) => new Intl.NumberFormat(lang(), { style: 'currency', currency: p.currency, maximumFractionDigits: p.price % 1 ? 2 : 0 }).format(p.price)
const date = (ms: number) => new Date(ms).toLocaleDateString(lang(), { dateStyle: 'medium' })

/** What the account line says about a plan: "Free · 2 of 3 exports left", "Monthly · renews on …". */
export function usePlanLine() {
  const { t } = useTranslation()
  return (e: Entitlement) =>
    e.plan === 'lifetime'
      ? t('account.planLifetime')
      : e.plan === 'monthly'
        ? `${t('account.planMonthly')} · ${t(e.cancelAtPeriodEnd ? 'account.endsOn' : 'account.renewsOn', { date: date(e.periodEnd!) })}`
        : `${t('account.planFree')} · ${t('account.freeLeft', { count: e.freeLeft, limit: e.freeLimit })}`
}

/** The account's dialogs (sign-in, plans, account), over whatever else is open. */
export function AccountDialogs() {
  const { t } = useTranslation()
  const { dialog, user, entitlement: ent, pending, error } = useAccount()
  const planLine = usePlanLine()
  if (!dialog) return null
  const err = error && <div className="error">{error}</div>

  if (dialog.kind === 'signIn')
    return (
      <Modal title={t(dialog.reason === 'export' ? 'account.signInToExport' : 'account.signIn')}>
        <p className="muted">{t(`account.signInWhy.${dialog.reason}`, { count: 3 })}</p>
        <button className="btn sign-in-btn" disabled={!!pending} onClick={() => void signInWithGoogle()}>
          {pending === 'signIn' ? t('account.signingIn') : t('account.continueWithGoogle')}
        </button>
        {err}
        <p className="muted small">{t('account.privacy')}</p>
      </Modal>
    )

  if (dialog.kind === 'plans') {
    const current = ent?.plan ?? 'free'
    const plans = ent?.plans ?? []
    return (
      <Modal title={t('account.plans.title')}>
        {dialog.reason === 'limit' && <p>{t('account.plans.limitReached', { count: ent?.freeLimit ?? 3 })}</p>}
        <div className="plans">
          <div className={`plan ${current === 'free' ? 'current' : ''}`}>
            <h4>{t('account.planFree')}</h4>
            <div className="plan-price">{t('account.plans.freePrice')}</div>
            <p className="muted small">{t('account.plans.freeWhat', { count: ent?.freeLimit ?? 3 })}</p>
            {current === 'free' && ent && <span className="plan-tag">{t('account.freeLeft', { count: ent.freeLeft, limit: ent.freeLimit })}</span>}
          </div>
          {plans.map((p) => {
            const owned = current === p.id || current === 'lifetime'
            return (
              <div key={p.id} className={`plan ${current === p.id ? 'current' : ''} ${p.id === 'lifetime' ? 'best' : ''}`}>
                <h4>{t(p.id === 'monthly' ? 'account.planMonthly' : 'account.planLifetime')}</h4>
                <div className="plan-price">
                  {price(p)} <span className="muted small">{t(p.interval ? 'account.plans.perMonth' : 'account.plans.once')}</span>
                </div>
                <p className="muted small">{t(p.id === 'monthly' ? 'account.plans.monthlyWhat' : 'account.plans.lifetimeWhat')}</p>
                {current === p.id ? (
                  <span className="plan-tag">{t('account.plans.current')}</span>
                ) : (
                  <button className="btn primary" disabled={!ent?.checkout || owned || !!pending} onClick={() => void buyPlan(p.id as PlanId)}>
                    {!ent?.checkout ? t('account.plans.soonShort') : pending === p.id ? t('account.plans.opening') : t(p.interval ? 'account.plans.subscribe' : 'account.plans.buy')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {ent && !ent.checkout && <p className="muted small">{t('account.plans.soon')}</p>}
        {err}
      </Modal>
    )
  }

  if (dialog.kind === 'account' && user)
    return (
      <Modal title={t('account.title')}>
        <div className="account-who">
          <Avatar />
          <div>
            <div className="account-name">{user.name || user.email}</div>
            {user.name && user.email && <div className="muted small">{user.email}</div>}
          </div>
        </div>
        <p>{ent ? planLine(ent) : t('account.loading')}</p>
        {err}
        <div className="modal-foot">
          <button className="btn" onClick={() => void signOut()}>
            {t('account.signOut')}
          </button>
          {ent?.admin && (
            <button className="btn" onClick={() => openDialog({ kind: 'admin' })}>
              {t('account.backOffice')}
            </button>
          )}
          <div className="grow" />
          {ent?.canManage && (
            <button className="btn" disabled={!!pending} onClick={() => void managePlan()}>
              {pending === 'portal' ? t('account.plans.opening') : t('account.manage')}
            </button>
          )}
          {ent && ent.plan !== 'lifetime' && (
            <button className="btn primary" onClick={() => openDialog({ kind: 'plans', reason: 'menu' })}>
              {t('account.seePlans')}
            </button>
          )}
        </div>
      </Modal>
    )

  if (dialog.kind === 'admin') return <BackOffice />

  if (dialog.kind === 'paid')
    return (
      <Modal title={t('account.paidTitle')}>
        <p className="muted">{t('account.paid')}</p>
      </Modal>
    )

  if (dialog.kind === 'error')
    return (
      <Modal title={t('account.errorTitle')}>
        <p className="muted">{dialog.message}</p>
      </Modal>
    )
  return null
}

function Avatar() {
  const { user } = useAccount()
  if (!user) return null
  return user.photo ? (
    <img className="avatar" src={user.photo} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar">{(user.name || user.email || '?').trim()[0]?.toUpperCase()}</span>
  )
}

/** In the top bar: "Sign in", or the signed-in user's picture (opening the account). */
export function AccountButton() {
  const { t } = useTranslation()
  const { ready, user } = useAccount()
  if (!ready) return null
  return user ? (
    <button className="icon-btn account-btn" title={t('account.title')} onClick={() => openDialog({ kind: 'account' })}>
      <Avatar />
    </button>
  ) : (
    <button className="btn small" onClick={() => openDialog({ kind: 'signIn', reason: 'menu' })}>
      {t('account.signIn')}
    </button>
  )
}
