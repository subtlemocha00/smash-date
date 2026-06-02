import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import {
  uploadGroupImage,
  removeGroupImage,
  setGroupImagePosition
} from '../services/firebase/groups'
import styles from './GroupImage.module.css'

const ALLOWED_TYPES = ['image/png', 'image/jpeg']
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
const MAX_DIMENSION = 3000 // px, per side
const DEFAULT_POSITION = '50% 50%'

function messageForError(err) {
  const code = err?.code || ''
  if (code === 'storage/unauthorized') {
    return 'You don’t have permission to change this image.'
  }
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') {
    return 'Upload failed. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

// Reads a file's pixel dimensions so we can reject oversized images (Storage
// rules can only check byte size, not resolution).
function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}

function clampPercent(n) {
  if (Number.isNaN(n)) return 50
  return Math.min(100, Math.max(0, n))
}

// Parses a "x% y%" object-position string into [x, y] numbers (defaults 50/50).
function parsePosition(value) {
  const m = /(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/.exec(value || '')
  if (!m) return [50, 50]
  return [clampPercent(Number(m[1])), clampPercent(Number(m[2]))]
}

export default function GroupImage() {
  const { user } = useAuth()
  const { activeGroup } = useGroups()
  const fileRef = useRef(null)
  const menuRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [menuOpen, setMenuOpen] = useState(false)
  const [repositioning, setRepositioning] = useState(false)
  const [posX, setPosX] = useState(50)
  const [posY, setPosY] = useState(50)
  const [savingPos, setSavingPos] = useState(false)

  // Collapse the controls widget when tapping/clicking anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  if (!activeGroup) return null

  const isCreator = activeGroup.createdBy === user?.uid
  const imageUrl = activeGroup.groupImageUrl || null
  const savedPosition = activeGroup.groupImagePosition || DEFAULT_POSITION

  // Non-creator with no image sees nothing at all — no placeholder, no spacing.
  if (!imageUrl && !isCreator) return null

  function openPicker() {
    setError('')
    fileRef.current?.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-selected after an error
    if (!file) return

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please choose a PNG or JPG image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('That image is too large. Please choose one under 15 MB.')
      return
    }

    let size
    try {
      size = await readImageSize(file)
    } catch {
      setError('Couldn’t read that image. Please try a different file.')
      return
    }
    if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION) {
      setError(`Image resolution is too high. Max ${MAX_DIMENSION}×${MAX_DIMENSION} pixels.`)
      return
    }

    setBusy(true)
    setError('')
    try {
      await uploadGroupImage(activeGroup.id, activeGroup.createdBy, file)
    } catch (err) {
      setError(messageForError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    setError('')
    try {
      await removeGroupImage(activeGroup.id, activeGroup.createdBy)
    } catch (err) {
      setError(messageForError(err))
    } finally {
      setBusy(false)
    }
  }

  function startReposition() {
    const [x, y] = parsePosition(savedPosition)
    setPosX(x)
    setPosY(y)
    setError('')
    setRepositioning(true)
  }

  function cancelReposition() {
    setRepositioning(false)
  }

  async function savePosition() {
    setSavingPos(true)
    setError('')
    try {
      await setGroupImagePosition(activeGroup.id, `${posX}% ${posY}%`)
      setRepositioning(false)
    } catch (err) {
      setError(messageForError(err))
    } finally {
      setSavingPos(false)
    }
  }

  const livePosition = repositioning ? `${posX}% ${posY}%` : savedPosition

  return (
    <div className={styles.wrap}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className={styles.hiddenInput}
        onChange={handleFileChange}
      />

      {imageUrl ? (
        <>
          <div className={styles.imageBlock}>
            <img
              src={imageUrl}
              alt={`${activeGroup.name || 'Group'} photo`}
              className={styles.image}
              style={{ objectPosition: livePosition }}
            />
            {isCreator && !repositioning && (
              <div className={styles.menu} ref={menuRef}>
                <button
                  className={styles.menuToggle}
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  aria-label="Image options"
                  type="button"
                >
                  {busy ? '…' : '⋯'}
                </button>
                {menuOpen && (
                  <div className={styles.controls}>
                    <button
                      className={styles.btn}
                      onClick={() => {
                        setMenuOpen(false)
                        openPicker()
                      }}
                      disabled={busy}
                      type="button"
                    >
                      {busy ? 'Working…' : 'Change'}
                    </button>
                    <button
                      className={styles.btn}
                      onClick={() => {
                        setMenuOpen(false)
                        startReposition()
                      }}
                      disabled={busy}
                      type="button"
                    >
                      Reposition
                    </button>
                    <button
                      className={styles.btnDanger}
                      onClick={() => {
                        setMenuOpen(false)
                        handleRemove()
                      }}
                      disabled={busy}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {isCreator && repositioning && (
            <div className={styles.reposition}>
              <label className={styles.sliderRow}>
                <span className={styles.sliderLabel}>Horizontal</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={posX}
                  onChange={(e) => setPosX(clampPercent(Number(e.target.value)))}
                  className={styles.slider}
                />
              </label>
              <label className={styles.sliderRow}>
                <span className={styles.sliderLabel}>Vertical</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={posY}
                  onChange={(e) => setPosY(clampPercent(Number(e.target.value)))}
                  className={styles.slider}
                />
              </label>
              <div className={styles.repositionActions}>
                <button
                  className={styles.btn}
                  onClick={savePosition}
                  disabled={savingPos}
                  type="button"
                >
                  {savingPos ? 'Saving…' : 'Save position'}
                </button>
                <button
                  className={styles.btn}
                  onClick={cancelReposition}
                  disabled={savingPos}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        // Creator, no image yet — compact upload affordance.
        <div className={styles.placeholder}>
          <button
            className={styles.uploadBtn}
            onClick={openPicker}
            disabled={busy}
            type="button"
          >
            {busy ? 'Uploading…' : '+ Upload group image'}
          </button>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
