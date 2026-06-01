import { useTheme } from '../context/ThemeContext'
import styles from './ThemeToggle.module.css'

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className={styles.group} role="group" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${styles.option} ${theme === o.value ? styles.active : ''}`}
          aria-pressed={theme === o.value}
          onClick={() => setTheme(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
