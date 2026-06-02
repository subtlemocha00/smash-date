import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth } from '../services/firebase/auth'
import { db } from '../services/firebase/firestore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        try {
          const userRef = doc(db, 'users', firebaseUser.uid)
          const snap = await getDoc(userRef)
          if (!snap.exists()) {
            const profile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || '',
              email: firebaseUser.email,
              groupId: null,
              activeGroupId: null,
              createdAt: serverTimestamp()
            }
            await setDoc(userRef, profile)
            setUserProfile(profile)
          } else {
            setUserProfile(snap.data())
          }
        } catch (err) {
          console.error('Failed to load user profile:', err)
          // Don't strand the user on a blank screen if the profile can't be
          // read or created (transient network / rules issue). Fall back to a
          // minimal in-memory profile so the app still renders; the groups
          // listener loads independently of this.
          setUserProfile({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || '',
            email: firebaseUser.email,
            groupId: null,
            activeGroupId: null
          })
        }
      } else {
        setUser(null)
        setUserProfile(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{ user, userProfile, setUserProfile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
