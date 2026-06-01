import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { signInWithEmail, registerWithEmail, signInWithGoogle } from '../services/firebase/auth'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { user, loading: authLoading } = useAuth()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (authLoading) return null
  if (user) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password)
      } else {
        await registerWithEmail(email, password, displayName)
      }
    } catch (err) {
      setError(formatAuthError(err.code))
      setSubmitting(false)
    }
  }

  async function handleGoogle() {
    setError('')
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
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.wordmark}>
        <span className={styles.wordmarkAccent}>Smash</span>
        <span className={styles.wordmarkBase}>Date</span>
        <span className={styles.wordmarkDot}>.</span>
      </h1>
      <div className={styles.card}>
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
          <input
            className={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.primaryBtn} type="submit" disabled={submitting}>
            {submitting ? 'Loading…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        <div className={styles.divider}>or</div>
        <button
          className={styles.googleBtn}
          onClick={handleGoogle}
          disabled={submitting}
          type="button"
        >
          <span className={styles.googleG}>G</span> Continue with Google
        </button>
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
    'auth/invalid-credential': 'Invalid credentials. Please try again.'
  }
  return map[code] || 'Something went wrong. Please try again.'
}
