import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { useAuthNoticeStore } from '@/state/authNotices'

/**
 * The only place auth toasts are shown. It drains the notice queue published by the login and sign-up actions,
 * so a session that was merely restored from storage never produces a toast.
 */
export function AuthNoticeToaster() {
  const { t } = useTranslation()
  const notices = useAuthNoticeStore((state) => state.notices)
  const drain = useAuthNoticeStore((state) => state.drain)

  useEffect(() => {
    if (notices.length === 0) {
      return
    }

    for (const notice of drain()) {
      if (notice.kind === 'signedUp') {
        showAppSuccessToast(t('auth.toasts.accountCreated'), { id: 'auth-signup-status', duration: 3200 })
        continue
      }

      showAppInfoToast(t('auth.toasts.loggedInAs', { username: notice.username }), {
        id: 'auth-login-status',
        duration: 3200,
      })
    }
  }, [notices, drain, t])

  return null
}
