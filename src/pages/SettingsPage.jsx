import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logOut } from '../services/firebase/auth'
import GroupManager from '../components/GroupManager'
import ThemeToggle from '../components/ThemeToggle'
import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  const { user, userProfile } = useAuth()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/dashboard" className={styles.backBtn}>
          ← Dashboard
        </Link>
      </header>
      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Account</h2>
          <div className={styles.row}>
            <span className={styles.label}>Name</span>
            <span className={styles.value}>{userProfile?.displayName || '—'}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Email</span>
            <span className={styles.value}>{user?.email}</span>
          </div>
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Appearance</h2>
          <div className={styles.controlRow}>
            <span className={styles.label}>Theme</span>
            <ThemeToggle />
          </div>
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Group</h2>
          <GroupManager />
        </section>
        <section className={styles.section}>
          <button className={styles.signOutBtn} onClick={logOut} type="button">
            Sign Out
          </button>
        </section>
      </main>
    </div>
  )
}
