/* Login — email/password + Google, with Register tab */
function LoginScreen({ onAuth }) {
  const [mode, setMode] = React.useState('login');
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [name, setName] = React.useState('');

  function submit(e) {
    e.preventDefault();
    // register → new user needs a group; login → existing user lands on dashboard
    onAuth(mode === 'register' ? 'group' : 'dashboard', name || 'Sam');
  }

  return (
    <div className="auth-wrap">
      <div style={{ marginBottom: 22 }}><Wordmark /></div>
      <div className="auth-card">
        <div className="tabs">
          <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')} type="button">Sign In</button>
          <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')} type="button">Register</button>
        </div>
        <form className="form-col" onSubmit={submit}>
          {mode === 'register' && (
            <Field label={null} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <Field placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Field placeholder="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Btn type="submit" block>{mode === 'login' ? 'Sign In' : 'Create Account'}</Btn>
        </form>
        <div className="divider-or">or</div>
        <Btn variant="secondary" block type="button" onClick={() => onAuth(mode === 'register' ? 'group' : 'dashboard', 'Sam')}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--azure)' }}>G</span> Continue with Google
        </Btn>
      </div>
      <p className="subtle" style={{ fontSize: 12, marginTop: 18, textAlign: 'center' }}>
        Propose. Refine. Lock it in.
      </p>
    </div>
  );
}

/* Group Setup — create or join with a 6-char invite code */
function GroupSetupScreen({ onDone }) {
  const [mode, setMode] = React.useState('create');
  const [groupName, setGroupName] = React.useState('');
  const [code, setCode] = React.useState('');

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="h2 auth-title">Set up your group</h1>
        <p className="auth-sub">Plan together — invite the people you make plans with.</p>
        <div className="tabs">
          <button className={`tab ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')} type="button">Create</button>
          <button className={`tab ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')} type="button">Join</button>
        </div>
        {mode === 'create' ? (
          <form className="form-col" onSubmit={(e) => { e.preventDefault(); onDone(); }}>
            <Field label="Group name" placeholder="e.g. Sam & Alex" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            <Btn type="submit" block>Create group</Btn>
          </form>
        ) : (
          <form className="form-col" onSubmit={(e) => { e.preventDefault(); onDone(); }}>
            <Field label="Invite code" placeholder="6-character code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} style={{ fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-code)' }} />
            <Btn type="submit" block>Join group</Btn>
          </form>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen, GroupSetupScreen });
