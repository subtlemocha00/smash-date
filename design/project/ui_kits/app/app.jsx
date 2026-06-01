/* Date Smash — interactive prototype orchestrator */
const { useState, useEffect } = React;

const GROUP = {
  name: 'Sam & Alex',
  code: '3F9K2A',
  members: [{ name: 'Sam' }, { name: 'Alex' }],
};

const INITIAL_PROPOSALS = [
  {
    id: 'p1',
    title: 'Anniversary dinner',
    description: 'Something a little special — quiet, good food, no rushing.',
    date: 'Sat, Mar 14', time: '7:30 PM', activity: 'Dinner + harbor walk',
    location: "Lucia's Trattoria", childcareNotes: 'Grandma can take the kids', budget: '$120', notes: '',
    status: 'proposed', updated: 'Mar 4',
    responsibilities: [
      { title: 'Reserve table at Lucia\'s', who: 'Sam', done: true },
      { title: 'Arrange babysitter', who: 'Alex', done: false },
    ],
    comments: [
      { author: 'Alex', time: 'Mar 4', msg: 'Love this. Can we do 8pm instead? Easier with the sitter.' },
      { author: 'Sam', time: 'Mar 4', msg: 'Works for me — updating the time.' },
    ],
    events: [
      { desc: 'Alex added a comment', time: 'Mar 4' },
      { desc: 'Sam assigned "Reserve table" to Sam', time: 'Mar 3' },
      { desc: 'Sam created this proposal', time: 'Mar 3' },
    ],
  },
  {
    id: 'p2',
    title: 'Sunday morning hike',
    description: 'Easy trail, coffee after.',
    date: 'Sun, Mar 8', time: '9:00 AM', activity: 'Eagle Ridge loop',
    location: 'Eagle Ridge trailhead', childcareNotes: '', budget: '$0', notes: 'Bring water + the good boots.',
    status: 'confirmed', updated: 'Mar 1',
    responsibilities: [{ title: 'Pack snacks', who: 'Alex', done: true }],
    comments: [{ author: 'Sam', time: 'Mar 1', msg: 'Locked in!' }],
    events: [
      { desc: 'Sam changed status to Confirmed', time: 'Mar 1' },
      { desc: 'Alex changed status to Accepted', time: 'Feb 28' },
      { desc: 'Sam created this proposal', time: 'Feb 27' },
    ],
  },
  {
    id: 'p3',
    title: 'Movie night in',
    description: '', date: '', time: '', activity: '', location: '', childcareNotes: '', budget: '', notes: '',
    status: 'draft', updated: 'Feb 25',
    responsibilities: [],
    comments: [],
    events: [{ desc: 'Sam created this proposal', time: 'Feb 25' }],
  },
];

const INITIAL_NOTIFS = [
  { id: 'n1', message: '<b>Alex</b> commented on: Anniversary dinner', proposalId: 'p1', read: false, time: 'Mar 4' },
  { id: 'n2', message: '<b>Alex</b> assigned you "Arrange babysitter"', proposalId: 'p1', read: false, time: 'Mar 4' },
  { id: 'n3', message: '<b>Sam</b> confirmed: Sunday morning hike', proposalId: 'p2', read: true, time: 'Mar 1' },
];

let _pid = 4;

function App() {
  const [theme, setTheme] = useState('light');
  const [screen, setScreen] = useState('login');     // login | group | dashboard | proposal | settings
  const [currentUser, setCurrentUser] = useState('Sam');
  const [proposals, setProposals] = useState(INITIAL_PROPOSALS);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFS);
  const [selectedId, setSelectedId] = useState(null);

  // Re-render Lucide icons after every commit
  useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  // reset scroll on screen change
  useEffect(() => {
    const body = document.querySelector('.app-body');
    if (body) body.scrollTop = 0;
  }, [screen, selectedId]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  function openProposal(id) { setSelectedId(id); setScreen('proposal'); }

  function patchProposal(id, patch) {
    setProposals((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch, updated: 'now' };
      return next;
    }));
  }

  function createProposal(title) {
    const id = 'p' + (_pid++);
    const np = {
      id, title, description: '', date: '', time: '', activity: '', location: '',
      childcareNotes: '', budget: '', notes: '', status: 'draft', updated: 'now',
      responsibilities: [], comments: [],
      events: [{ desc: `${currentUser} created this proposal`, time: 'now' }],
    };
    setProposals((prev) => [np, ...prev]);
    openProposal(id);
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const selected = proposals.find((p) => p.id === selectedId);

  let view;
  if (screen === 'login') {
    view = <LoginScreen onAuth={(dest, name) => { setCurrentUser(name); setScreen(dest); }} />;
  } else if (screen === 'group') {
    view = <GroupSetupScreen onDone={() => setScreen('dashboard')} />;
  } else if (screen === 'dashboard') {
    view = (
      <DashboardScreen
        group={GROUP} proposals={proposals} notifications={notifications}
        theme={theme} onToggleTheme={toggleTheme}
        onOpenProposal={openProposal} onOpenSettings={() => setScreen('settings')}
        onCreate={createProposal} onMarkAllRead={markAllRead}
      />
    );
  } else if (screen === 'proposal' && selected) {
    view = (
      <ProposalScreen
        proposal={selected} group={GROUP} currentUser={currentUser}
        onBack={() => setScreen('dashboard')} onPatch={patchProposal}
      />
    );
  } else if (screen === 'settings') {
    view = (
      <SettingsScreen
        currentUser={currentUser} group={GROUP} theme={theme}
        onToggleTheme={toggleTheme} onBack={() => setScreen('dashboard')}
        onSignOut={() => { setScreen('login'); }}
      />
    );
  }

  return (
    <IOSDevice dark={theme === 'dark'}>
      <div className="app" data-theme={theme}>{view}</div>
    </IOSDevice>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
