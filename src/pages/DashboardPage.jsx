import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { logOut } from '../services/firebase/auth'
import { db } from '../services/firebase/firestore'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const { userProfile } = useAuth()
  const [group, setGroup] = useState(null)
  const [groupLoading, setGroupLoading] = useState(true)

  useEffect(() => {
    if (!userProfile?.groupId) {
      setGroupLoading(false)
      return
    }
    getDoc(doc(db, 'groups', userProfile.groupId)).then((snap) => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
      setGroupLoading(false)
    })
  }, [userProfile?.groupId])

  if (!userProfile) return null
  if (!userProfile.groupId) return <Navigate to="/group-setup" replace />

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo}>Smash Date</span>
        <div className={styles.headerRight}>
          <Link to="/settings" className={styles.navLink}>Settings</Link>
          <button className={styles.signOutBtn} onClick={logOut} type="button">
            Sign Out
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.section}>
          {groupLoading ? (
            <p className={styles.muted}>Loading group…</p>
          ) : group ? (
            <>
              <h2 className={styles.groupName}>{group.name}</h2>
              <p className={styles.muted}>
                Invite code: <strong>{group.inviteCode}</strong>
              </p>
            </>
          ) : (
            <p className={styles.muted}>Group not found.</p>
          )}
        </section>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Proposals</h2>
            <button className={styles.newBtn} disabled type="button">
              + New Proposal
            </button>
          </div>
          <p className={styles.muted}>No proposals yet.</p>
        </section>
      </main>
    </div>
  )
}
