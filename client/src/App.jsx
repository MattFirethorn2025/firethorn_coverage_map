import { useEffect, useState } from 'react'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import AuthCallback from './pages/AuthCallback.jsx'
import Login from './pages/Login.jsx'
import MapView from './pages/MapView.jsx'

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const isAuthenticated = useIsAuthenticated()
  const { accounts } = useMsal()

  useEffect(() => {
    const syncPathname = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', syncPathname)
    return () => window.removeEventListener('popstate', syncPathname)
  }, [])

  if (pathname === '/auth/callback') {
    return <AuthCallback />
  }

  const hasMsalAccount = isAuthenticated && accounts.length > 0
  if (!hasMsalAccount) {
    return <Login />
  }

  return <MapView />
}

export default App
