import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth'
import { app } from './config'

export const auth = getAuth(app)

const googleProvider = new GoogleAuthProvider()

export const signInWithEmail = (email, password) =>
  signInWithEmailAndPassword(auth, email, password)

export const registerWithEmail = async (email, password, displayName) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(cred.user, { displayName })
  return cred
}

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider)

export const resetPassword = (email) => sendPasswordResetEmail(auth, email)

export const logOut = () => signOut(auth)
