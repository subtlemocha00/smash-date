import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useAuth } from './AuthContext'
import {
  subscribeToUserGroups,
  setActiveGroupId,
  setMemberName
} from '../services/firebase/groups'

const GroupContext = createContext(null)

function storageKey(uid) {
  return `smashdate.activeGroupId.${uid}`
}

export function GroupProvider({ children }) {
  const { user, userProfile, setUserProfile } = useAuth()
  const uid = user?.uid

  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [activeGroupId, setActiveGroupIdState] = useState(null)

  // Tracks whether we've applied the initial active-group selection for this
  // user, so realtime updates don't keep resetting the user's choice.
  const initializedRef = useRef(false)

  // Subscribe to the user's groups (realtime). A removed member stops matching
  // the array-contains query immediately, so access updates without a refresh.
  useEffect(() => {
    if (!uid) {
      setGroups([])
      setGroupsLoading(false)
      initializedRef.current = false
      return
    }
    initializedRef.current = false
    setGroupsLoading(true)
    const unsub = subscribeToUserGroups(
      uid,
      (list) => {
        setGroups(list)
        setGroupsLoading(false)
      },
      (err) => {
        console.error('Failed to load groups:', err)
        setGroupsLoading(false)
      }
    )
    return unsub
  }, [uid])

  // Reconcile the active group against the loaded list. Handles first load,
  // and the case where the active group was deleted or the user was removed.
  useEffect(() => {
    if (!uid || groupsLoading) return

    const ids = groups.map((g) => g.id)

    if (!initializedRef.current) {
      const stored =
        activeGroupId ??
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem(storageKey(uid))
          : null) ??
        userProfile?.activeGroupId ??
        userProfile?.groupId ??
        null
      const initial = ids.includes(stored) ? stored : (ids[0] ?? null)
      initializedRef.current = true
      if (initial !== activeGroupId) setActiveGroupIdState(initial)
      return
    }

    // Active group is unset (e.g. first group just created) or no longer
    // accessible (deleted / removed) — fall back to the first available.
    if (!ids.includes(activeGroupId)) {
      setActiveGroupIdState(ids[0] ?? null)
    }
  }, [
    uid,
    groups,
    groupsLoading,
    activeGroupId,
    userProfile?.activeGroupId,
    userProfile?.groupId
  ])

  function setActiveGroup(groupId) {
    if (groupId === activeGroupId) return
    setActiveGroupIdState(groupId)
    if (uid && groupId) {
      try {
        localStorage.setItem(storageKey(uid), groupId)
      } catch {
        // localStorage unavailable — Firestore persistence below still applies.
      }
      setActiveGroupId(uid, groupId).catch(() => {})
      setUserProfile?.((prev) =>
        prev ? { ...prev, activeGroupId: groupId } : prev
      )
    }
  }

  // Optimistically insert a just-created/joined group so the UI doesn't see an
  // empty list during the brief window before the realtime listener catches up
  // (which would otherwise bounce a new user back to group setup).
  function seedGroup(group) {
    if (!group?.id) return
    setGroups((prev) =>
      prev.some((g) => g.id === group.id) ? prev : [...prev, group]
    )
  }

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === activeGroupId) ?? null,
    [groups, activeGroupId]
  )

  // Keep the current user's display name recorded on the active group so other
  // members can show it (e.g. the responsibility assignee picker). Runs once per
  // group until the recorded name matches; covers the owner, joiners, and legacy
  // groups created before memberNames existed.
  const selfName = userProfile?.displayName || user?.email || ''
  useEffect(() => {
    if (!uid || !activeGroup || !selfName) return
    if (activeGroup.memberNames?.[uid] === selfName) return
    setMemberName(activeGroup.id, uid, selfName).catch(() => {})
  }, [uid, activeGroup, selfName])

  const value = {
    groups,
    groupsLoading,
    activeGroupId,
    activeGroup,
    setActiveGroup,
    seedGroup
  }

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
}

export function useGroups() {
  const ctx = useContext(GroupContext)
  if (!ctx) throw new Error('useGroups must be used within GroupProvider')
  return ctx
}
