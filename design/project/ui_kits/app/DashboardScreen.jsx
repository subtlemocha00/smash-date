/* Dashboard — group info, needs attention, notifications, proposals */
function DashboardScreen({ group, proposals, notifications, theme, onToggleTheme,
                          onOpenProposal, onOpenSettings, onCreate, onMarkAllRead }) {
  const [showForm, setShowForm] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const unread = notifications.filter((n) => !n.read).length;
  const pending = proposals.filter((p) => ['proposed', 'changes_requested', 'accepted'].includes(p.status));
  const PENDING_HINTS = { proposed: 'Awaiting response', changes_requested: 'Changes requested', accepted: 'Awaiting confirmation' };

  function create(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(title.trim());
    setTitle(''); setShowForm(false);
  }

  return (
    <>
      <header className="app-header">
        <Wordmark />
        <div className="header-actions">
          <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme" type="button">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <button className="icon-btn" onClick={onOpenSettings} title="Settings" type="button">
            <Icon name="settings" size={18} />
            {unread > 0 && <span className="notif-badge">{unread}</span>}
          </button>
        </div>
      </header>

      <div className="app-body">
        <main className="app-main">
          {/* Group info */}
          <Card>
            <h2 className="h3" style={{ fontSize: 18, marginBottom: 4 }}>{group.name}</h2>
            <p className="muted">Invite code: <span className="code-strong">{group.code}</span></p>
          </Card>

          {/* Needs attention */}
          {pending.length > 0 && (
            <Card>
              <SectionHead title="Needs Attention" />
              <ul className="rows">
                {pending.map((p) => (
                  <li key={p.id}>
                    <a className="row-link" onClick={() => onOpenProposal(p.id)}>
                      <span className="row-title">{p.title}</span>
                      <span className="pending-hint">{PENDING_HINTS[p.status]}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Notifications */}
          <Card>
            <SectionHead
              title="Notifications"
              count={unread}
              action={unread > 0 && <button className="btn-text" type="button" onClick={onMarkAllRead}>Mark all read</button>}
            />
            {notifications.length === 0 ? (
              <p className="muted">You're all caught up.</p>
            ) : (
              <ul className="rows" style={{ gap: 0 }}>
                {notifications.slice(0, 4).map((n) => (
                  <li key={n.id} className={`notif ${n.read ? 'read' : ''}`} onClick={() => n.proposalId && onOpenProposal(n.proposalId)} style={{ cursor: n.proposalId ? 'pointer' : 'default' }}>
                    <span className={`dot ${n.read ? 'read' : ''}`}></span>
                    <span className="notif-body" dangerouslySetInnerHTML={{ __html: n.message }}></span>
                    <span className="notif-time">{n.time}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Proposals */}
          <Card>
            <SectionHead
              title="Proposals"
              action={!showForm && <Btn size="sm" type="button" onClick={() => setShowForm(true)}><Icon name="plus" size={15} /> New</Btn>}
            />
            {showForm && (
              <form className="form-col" onSubmit={create} style={{ marginBottom: 14 }}>
                <Field placeholder="Proposal title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn size="sm" type="submit" disabled={!title.trim()}>Create</Btn>
                  <Btn size="sm" variant="secondary" type="button" onClick={() => { setShowForm(false); setTitle(''); }}>Cancel</Btn>
                </div>
              </form>
            )}
            {proposals.length === 0 ? (
              <p className="empty">Create your first date idea.</p>
            ) : (
              <ul className="rows">
                {proposals.map((p) => (
                  <li key={p.id}>
                    <a className="row-link" onClick={() => onOpenProposal(p.id)}>
                      <span className="row-title">{p.title}</span>
                      <span className="row-meta">
                        <StatusBadge status={p.status} />
                        <span className="row-date">{p.updated}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </main>
      </div>

      {!showForm && (
        <button className="fab" type="button" onClick={() => { setShowForm(true); document.querySelector('.app-body').scrollTo({ top: 99999, behavior: 'smooth' }); }} title="New proposal">
          <Icon name="plus" size={24} />
        </button>
      )}
    </>
  );
}

Object.assign(window, { DashboardScreen });
