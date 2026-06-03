import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import {
  uploadGroupImage,
  removeGroupImage,
  setGroupImageFraming
} from '../services/firebase/groups'
import styles from './GroupImage.module.css'

const ALLOWED_TYPES = ['image/png', 'image/jpeg']
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
const MAX_DIMENSION = 3000 // px, per side
const DEFAULT_POSITION = '50% 50%'
const DEFAULT_SCALE = 1
const MIN_SCALE = 1 // 100% — fits the banner (zooming out would expose gaps)
const MAX_SCALE = 3 // 300%
const BANNER_HEIGHT = 160 // px — must match .imageClip height in the stylesheet

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

function clampScale(n) {
  if (Number.isNaN(n)) return DEFAULT_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n))
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
  const clipRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [menuOpen, setMenuOpen] = useState(false)
  const [repositioning, setRepositioning] = useState(false)
  const [posX, setPosX] = useState(50)
  const [posY, setPosY] = useState(50)
  const [scale, setScale] = useState(DEFAULT_SCALE)
  const [savingPos, setSavingPos] = useState(false)

  // The banner's rendered width and the image's natural size let us pan with a
  // clamped translate (so X and Y both work, unlike object-position which only
  // pans the single axis that `cover` happens to overflow).
  const [containerW, setContainerW] = useState(0)
  const [natural, setNatural] = useState(null)

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

  // Track the banner's width (responsive) so pan offsets stay in real pixels.
  // Keyed on the image URL so it re-attaches when the banner appears/changes.
  // Also reads the image's natural size here in case it was already cached
  // (a cached <img> can finish loading before React's onLoad can fire).
  useEffect(() => {
    const el = clipRef.current
    if (!el) return
    setContainerW(el.clientWidth)
    const img = el.querySelector('img')
    // Clear stale dimensions, then adopt the new image's if it's already loaded.
    setNatural(
      img?.complete && img.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null
    )
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeGroup?.groupImageUrl])

  if (!activeGroup) return null

  const isCreator = activeGroup.createdBy === user?.uid
  const imageUrl = activeGroup.groupImageUrl || null
  const savedPosition = activeGroup.groupImagePosition || DEFAULT_POSITION
  const savedScale = clampScale(Number(activeGroup.groupImageScale) || DEFAULT_SCALE)

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
    setScale(savedScale)
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
      await setGroupImageFraming(activeGroup.id, `${posX}% ${posY}%`, scale)
      setRepositioning(false)
    } catch (err) {
      setError(messageForError(err))
    } finally {
      setSavingPos(false)
    }
  }

  const [savedX, savedY] = parsePosition(savedPosition)
  const livePosX = repositioning ? posX : savedX
  const livePosY = repositioning ? posY : savedY
  const liveScale = repositioning ? scale : savedScale

  // Cover-fit the image to the banner, apply the zoom, then translate by the
  // pan — clamped to the overflow so edges never reveal empty space. Both axes
  // pan whenever there's overflow (X needs zoom, or a wider-than-banner image).
  // Before the natural size is known we fall back to plain cover + position.
  let imageStyle
  if (natural && containerW > 0) {
    const coverScale = Math.max(containerW / natural.w, BANNER_HEIGHT / natural.h)
    const renderedW = natural.w * coverScale * liveScale
    const renderedH = natural.h * coverScale * liveScale
    const overflowX = Math.max(0, renderedW - containerW)
    const overflowY = Math.max(0, renderedH - BANNER_HEIGHT)
    const tx = (0.5 - livePosX / 100) * overflowX
    const ty = (0.5 - livePosY / 100) * overflowY
    imageStyle = {
      width: `${renderedW}px`,
      height: `${renderedH}px`,
      transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`
    }
  } else {
    imageStyle = {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: `${livePosX}% ${livePosY}%`,
      transform: 'translate(-50%, -50%)'
    }
  }

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
            <div className={styles.imageClip} ref={clipRef}>
              <img
                src={imageUrl}
                alt={`${activeGroup.name || 'Group'} photo`}
                className={styles.image}
                style={imageStyle}
                onLoad={(e) =>
                  setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })
                }
              />
            </div>
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
                      Adjust
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
              <label className={styles.sliderRow}>
                <span className={styles.sliderLabel}>Size</span>
                <input
                  type="range"
                  min={MIN_SCALE * 100}
                  max={MAX_SCALE * 100}
                  value={Math.round(scale * 100)}
                  onChange={(e) => setScale(clampScale(Number(e.target.value) / 100))}
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
                  {savingPos ? 'Saving…' : 'Save'}
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
