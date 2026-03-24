import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'

const ACCESS_DENIED_KEY = 'firethorn_access_denied'

const ALLOWED_EMAILS = new Set(
  [
    'john@firethornholdings.com',
    'brad@firethornholdings.com',
    'sulynn@firethornholdings.com',
    'erin@firethornholdings.com',
    'matt@firethornholdings.com',
    'john.aycox@firethornholdings.com',
  ].map((e) => e.toLowerCase()),
)

function emailFromAccount(account) {
  if (!account) return null
  const claims = account.idTokenClaims
  const raw =
    (claims && (claims.email ?? claims.preferred_username)) ?? account.username
  return raw ? String(raw).toLowerCase() : null
}

export default function AuthCallback() {
  const { instance } = useMsal()
  const [phase, setPhase] = useState('loading')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const pendingDenied = sessionStorage.getItem(ACCESS_DENIED_KEY) === '1'

      try {
        const response = await instance.handleRedirectPromise()
        if (cancelled) return

        if (pendingDenied) {
          sessionStorage.removeItem(ACCESS_DENIED_KEY)
          setPhase('denied')
          return
        }

        const account = response?.account ?? instance.getActiveAccount()
        if (!account) {
          setPhase('error')
          return
        }

        const email = emailFromAccount(account)
        if (email && ALLOWED_EMAILS.has(email)) {
          instance.setActiveAccount(account)
          window.location.replace('/')
          return
        }

        sessionStorage.setItem(ACCESS_DENIED_KEY, '1')
        await instance.logoutRedirect({
          account,
          postLogoutRedirectUri: `${window.location.origin}/auth/callback`,
        })
      } catch {
        if (!cancelled) setPhase('error')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [instance])

  const wrap = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
    background: '#0c0e12',
    color: '#e8eaef',
    padding: '1.5rem',
    textAlign: 'center',
    boxSizing: 'border-box',
  }

  if (phase === 'loading') {
    return (
      <div style={wrap}>
        <p style={{ margin: 0, fontSize: '1.05rem' }}>Signing you in…</p>
      </div>
    )
  }

  if (phase === 'denied') {
    return (
      <div style={wrap}>
        <p style={{ margin: 0, maxWidth: '28rem', lineHeight: 1.5 }}>
          Access is restricted. Your account is not authorized to use this
          application.
        </p>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <p style={{ margin: 0, maxWidth: '28rem', lineHeight: 1.5 }}>
        Sign-in could not be completed. Please try again from the login page.
      </p>
    </div>
  )
}
