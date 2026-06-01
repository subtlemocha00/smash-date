/* Date Smash UI Kit — shared primitives. Exports to window. */

function Icon({ name, size = 20, style = {} }) {
  // Lucide renders into <i data-lucide>; createIcons() runs after each commit (see app.jsx)
  return (
    <span className="ic" style={{ width: size, height: size, ...style }}>
      <i data-lucide={name}></i>
    </span>
  );
}

function Wordmark() {
  return (
    <span className="wm">
      <span className="date">Date</span><span className="smash">Smash</span><span className="dot">.</span>
    </span>
  );
}

const AV_COLORS = {
  S: 'var(--coral)', A: 'var(--azure)', J: 'var(--granite)',
  M: 'var(--chartreuse-700)', default: 'var(--granite)',
};
function Avatar({ name = '?', size = 32 }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const bg = AV_COLORS[initial] || AV_COLORS.default;
  return (
    <span className="avatar" style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}>
      {initial}
    </span>
  );
}

const STATUS_LABELS = {
  draft: 'Draft', proposed: 'Proposed', changes_requested: 'Changes Requested',
  accepted: 'Accepted', confirmed: 'Confirmed', completed: 'Completed', declined: 'Declined',
};
function StatusBadge({ status }) {
  return <span className={`badge st-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

function Btn({ variant = 'primary', size, block, children, ...rest }) {
  const cls = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', block ? 'btn-block' : '']
    .filter(Boolean).join(' ');
  return <button className={cls} {...rest}>{children}</button>;
}

function Field({ label, multiline, ...rest }) {
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      {multiline
        ? <textarea className="textarea" {...rest}></textarea>
        : <input className="input" {...rest} />}
    </label>
  );
}

function Card({ children, style }) {
  return <section className="card" style={style}>{children}</section>;
}

function SectionHead({ title, count, action }) {
  return (
    <div className="section-head">
      <h2 className="section-title">
        {title}
        {count != null && count > 0 && <span className="count-pill">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

// relative-ish time formatter for mock timestamps (string passthrough)
function fmt(t) { return t; }

Object.assign(window, {
  Icon, Wordmark, Avatar, StatusBadge, Btn, Field, Card, SectionHead,
  STATUS_LABELS, fmt,
});
