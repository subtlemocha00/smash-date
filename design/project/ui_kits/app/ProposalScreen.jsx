/* Proposal detail — fields, status machine, responsibilities, comments, activity */

const STATUS_TRANSITIONS = {
  draft: ['proposed'],
  proposed: ['accepted', 'changes_requested', 'declined'],
  changes_requested: ['proposed'],
  accepted: ['confirmed', 'declined'],
  confirmed: ['completed'],
  completed: [],
  declined: ['proposed'],
};
const ACTION_LABELS = {
  proposed: 'Send proposal', accepted: 'Accept', changes_requested: 'Request Changes',
  declined: 'Decline', confirmed: 'Confirm', completed: 'Mark Completed',
};
function actionVariant(s) {
  if (['accepted', 'confirmed', 'completed'].includes(s)) return 'accept';
  if (['declined', 'changes_requested'].includes(s)) return 'danger';
  return 'primary';
}

const FIELD_DEFS = [
  ['date', 'Date'], ['time', 'Time'], ['activity', 'Activity'],
  ['location', 'Restaurant / Location'], ['childcareNotes', 'Childcare notes'],
  ['budget', 'Budget'], ['notes', 'Notes'],
];

function ProposalScreen({ proposal, group, currentUser, onBack, onPatch }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(proposal);
  const [saved, setSaved] = React.useState(false);
  const [commentText, setCommentText] = React.useState('');
  const [respText, setRespText] = React.useState('');
  const [respWho, setRespWho] = React.useState(group.members[0].name);

  React.useEffect(() => { setDraft(proposal); }, [proposal.id]);

  function save() {
    onPatch(proposal.id, { ...draft });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }
  function changeStatus(next) {
    onPatch(proposal.id, {
      status: next,
      events: [{ desc: `${currentUser} changed status to ${STATUS_LABELS[next]}`, time: 'now' }, ...proposal.events],
    });
  }
  function addComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    onPatch(proposal.id, {
      comments: [...proposal.comments, { author: currentUser, time: 'now', msg: commentText.trim() }],
      events: [{ desc: `${currentUser} added a comment`, time: 'now' }, ...proposal.events],
    });
    setCommentText('');
  }
  function addResp(e) {
    e.preventDefault();
    if (!respText.trim()) return;
    onPatch(proposal.id, {
      responsibilities: [...proposal.responsibilities, { title: respText.trim(), who: respWho, done: false }],
      events: [{ desc: `${currentUser} assigned "${respText.trim()}" to ${respWho}`, time: 'now' }, ...proposal.events],
    });
    setRespText('');
  }
  function toggleResp(i) {
    const next = proposal.responsibilities.map((r, idx) => idx === i ? { ...r, done: !r.done } : r);
    onPatch(proposal.id, { responsibilities: next });
  }

  const nextStatuses = STATUS_TRANSITIONS[proposal.status] || [];

  return (
    <>
      <header className="app-header" style={{ justifyContent: 'flex-start' }}>
        <button className="back-btn" type="button" onClick={onBack}>
          <Icon name="chevron-left" size={18} /> Dashboard
        </button>
      </header>

      <div className="app-body">
        <main className="app-main">
          {/* Details */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                {editing
                  ? <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ fontWeight: 600 }} />
                  : <h1 className="h2" style={{ fontSize: 20 }}>{proposal.title}</h1>}
                <span><StatusBadge status={proposal.status} /></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {saved && <span className="save-flag">Saved</span>}
                {editing ? (
                  <>
                    <Btn size="sm" type="button" onClick={save} disabled={!draft.title.trim()}>Save</Btn>
                    <Btn size="sm" variant="secondary" type="button" onClick={() => { setDraft(proposal); setEditing(false); }}>Cancel</Btn>
                  </>
                ) : (
                  <Btn size="sm" variant="secondary" type="button" onClick={() => setEditing(true)}>Edit</Btn>
                )}
              </div>
            </div>

            {editing ? (
              <div className="form-col">
                <Field label="Description" multiline value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                {FIELD_DEFS.map(([key, label]) => (
                  <Field key={key} label={label} value={draft[key] || ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                ))}
              </div>
            ) : (
              <div>
                {proposal.description && <p className="p" style={{ marginBottom: 10, lineHeight: 1.5 }}>{proposal.description}</p>}
                <div>
                  {FIELD_DEFS.map(([key, label]) => (
                    <div className="frow" key={key}>
                      <span className="k">{label}</span>
                      <span className={`v ${proposal[key] ? '' : 'empty'}`}>{proposal[key] || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Status actions */}
          {nextStatuses.length > 0 && (
            <Card>
              <SectionHead title="Move this forward" />
              <div className="status-actions">
                {nextStatuses.map((s) => (
                  <Btn key={s} size="sm" variant={actionVariant(s)} type="button" onClick={() => changeStatus(s)}>
                    {ACTION_LABELS[s]}
                  </Btn>
                ))}
              </div>
            </Card>
          )}

          {/* Responsibilities */}
          <Card>
            <SectionHead title="Responsibilities" />
            {proposal.responsibilities.length === 0
              ? <p className="empty">No tasks yet.</p>
              : (
                <ul className="rows" style={{ gap: 0 }}>
                  {proposal.responsibilities.map((r, i) => (
                    <li key={i} className="resp">
                      <span className={`checkbox ${r.done ? 'on' : ''}`} onClick={() => toggleResp(i)}>{r.done ? '✓' : ''}</span>
                      <span className={`resp-title ${r.done ? 'done' : ''}`}>{r.title}</span>
                      <span className="resp-who">{r.who}</span>
                    </li>
                  ))}
                </ul>
              )}
            <form className="row-form" onSubmit={addResp}>
              <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Add a task" value={respText} onChange={(e) => setRespText(e.target.value)} />
              <select className="select" style={{ width: 'auto' }} value={respWho} onChange={(e) => setRespWho(e.target.value)}>
                {group.members.map((m) => <option key={m.name}>{m.name}</option>)}
              </select>
              <Btn size="sm" type="submit" disabled={!respText.trim()}>Add</Btn>
            </form>
          </Card>

          {/* Comments */}
          <Card>
            <SectionHead title="Comments" />
            {proposal.comments.length === 0
              ? <p className="empty">No comments yet.</p>
              : (
                <ul className="rows" style={{ gap: 0 }}>
                  {proposal.comments.map((c, i) => (
                    <li key={i} className="comment">
                      <Avatar name={c.author} size={30} />
                      <div className="comment-main">
                        <div className="comment-meta">
                          <span className="comment-author">{c.author}</span>
                          <span className="comment-time">{c.time}</span>
                        </div>
                        <p className="comment-msg">{c.msg}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            <form className="row-form" onSubmit={addComment}>
              <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Add a comment" value={commentText} onChange={(e) => setCommentText(e.target.value)} />
              <Btn size="sm" type="submit" disabled={!commentText.trim()}>Post</Btn>
            </form>
          </Card>

          {/* Activity */}
          <Card>
            <SectionHead title="Activity" />
            <ul className="rows" style={{ gap: 0 }}>
              {proposal.events.map((a, i) => (
                <li key={i} className="activity">
                  <span className="activity-desc">{a.desc}</span>
                  <span className="activity-time">{a.time}</span>
                </li>
              ))}
            </ul>
          </Card>
        </main>
      </div>
    </>
  );
}

Object.assign(window, { ProposalScreen });
