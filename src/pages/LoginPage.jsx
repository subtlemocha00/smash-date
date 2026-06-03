import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { signInWithEmail, registerWithEmail, signInWithGoogle, resetPassword } from '../services/firebase/auth'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (authLoading) return null
  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    if (mode === 'reset') {
      if (!email.trim()) {
        setError('Please enter your email.')
        return
      }
      setError('')
      setNotice('')
      setSubmitting(true)
      try {
        await resetPassword(email.trim())
        setNotice('Password reset email sent. Check your inbox.')
      } catch (err) {
        setError(formatAuthError(err.code))
      }
      setSubmitting(false)
      return
    }

    if (mode === 'register' && !displayName.trim()) {
      setError('Please enter your name.')
      return
    }
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password)
      } else {
        await registerWithEmail(email, password, displayName.trim())
      }
    } catch (err) {
      setError(formatAuthError(err.code))
      setSubmitting(false)
    }
  }

  async function handleGoogle() {
    if (submitting) return
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(formatAuthError(err.code))
      setSubmitting(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.wordmark}>
        <span className={styles.wordmarkAccent}>Smash</span>
        <span className={styles.wordmarkBase}>Date</span>
        <span className={styles.wordmarkDot}>.</span>
      </h1>
      <div className={styles.card}>
        {mode !== 'reset' && (
          <div className={styles.tabs}>
            <button
              className={mode === 'login' ? styles.activeTab : styles.tab}
              onClick={() => switchMode('login')}
              type="button"
            >
              Sign In
            </button>
            <button
              className={mode === 'register' ? styles.activeTab : styles.tab}
              onClick={() => switchMode('register')}
              type="button"
            >
              Register
            </button>
          </div>
        )}
        {mode === 'reset' && (
          <p className={styles.resetIntro}>
            Enter your email and we’ll send you a link to reset your password.
          </p>
        )}
        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === 'register' && (
            <input
              className={styles.input}
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          )}
          <input
            className={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {mode !== 'reset' && (
            <input
              className={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
          {error && <p className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}
          <button className={styles.primaryBtn} type="submit" disabled={submitting}>
            {submitting
              ? 'Loading…'
              : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                  ? 'Create Account'
                  : 'Send Reset Email'}
          </button>
        </form>
        {mode === 'login' && (
          <button
            className={styles.linkBtn}
            onClick={() => switchMode('reset')}
            type="button"
          >
            Forgot password?
          </button>
        )}
        {mode === 'reset' ? (
          <button
            className={styles.linkBtn}
            onClick={() => switchMode('login')}
            type="button"
          >
            Back to sign in
          </button>
        ) : (
          <>
            <div className={styles.divider}>or</div>
            <button
              className={styles.googleBtn}
              onClick={handleGoogle}
              disabled={submitting}
              type="button"
            >
              <span className={styles.googleG}>G</span> Continue with Google
            </button>
          </>
        )}
      </div>
      <p className={styles.tagline}>Propose. Refine. Lock it in.</p>
    </div>
  )
}

function formatAuthError(code) {
  const map = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/invalid-credential': 'Invalid credentials. Please try again.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.'
  }
  return map[code] || 'Something went wrong. Please try again.'
}
