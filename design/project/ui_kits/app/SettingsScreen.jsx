/* Settings — account info + theme + sign out */
function SettingsScreen({ currentUser, group, theme, onToggleTheme, onBack, onSignOut }) {
  return (
    <>
      <header className="app-header" style={{ justifyContent: 'flex-start' }}>
        <button className="back-btn" type="button" onClick={onBack}>
          <Icon name="chevron-left" size={18} /> Dashboard
        </button>
      </header>
      <div className="app-body">
        <main className="app-main" style={{ maxWidth: 480 }}>
          <Card>
            <SectionHead title="Account" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <Avatar name={currentUser} size={44} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{currentUser}</div>
                <div className="muted" style={{ fontSize: 13 }}>{currentUser.toLowerCase()}@example.com</div>
              </div>
            </div>
          </Card>

          <Card>
            <SectionHead title="Group" />
            <div className="frow"><span className="k">Name</span><span className="v">{group.name}</span></div>
            <div className="frow"><span className="k">Invite code</span><span className="v"><span className="code-strong">{group.code}</span></span></div>
            <div className="frow"><span className="k">Members</span><span className="v">{group.members.map((m) => m.name).join(', ')}</span></div>
          </Card>

          <Card>
            <SectionHead title="Appearance" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
              <Btn size="sm" variant="secondary" type="button" onClick={onToggleTheme}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
                Switch to {theme === 'dark' ? 'light' : 'dark'}
              </Btn>
            </div>
          </Card>

          <Btn variant="danger" block type="button" onClick={onSignOut}>Sign out</Btn>
        </main>
      </div>
    </>
  );
}

Object.assign(window, { SettingsScreen });
