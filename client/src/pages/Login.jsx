import { useMsal } from '@azure/msal-react'
import { loginRequest } from '../authConfig'
import './Login.css'

function MicrosoftLogo() {
  return (
    <svg
      className="login-ms-logo"
      width="21"
      height="21"
      viewBox="0 0 21 21"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export default function Login() {
  const { instance } = useMsal()

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-brand">Firethorn</h1>
        <p className="login-subtitle">Coverage Map</p>
        <div className="login-divider" />
        <button
          type="button"
          className="login-ms-button"
          onClick={() => instance.loginRedirect(loginRequest)}
        >
          <MicrosoftLogo />
          Sign in with Microsoft
        </button>
      </div>
    </div>
  )
}
