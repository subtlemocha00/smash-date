import { describe, it, expect } from 'vitest'
import {
  PROPOSAL_EVENTS,
  buildRecipientUids,
  buildProposalEmailContent,
  buildProposalMailDocuments
} from './proposalEmailService'

// A group with three members and group-aware display names. Kev is the actor in
// most cases; Sarah/Ted are the other members.
const group = {
  id: 'group1',
  name: 'Cottage Crew',
  memberIds: ['kev', 'sarah', 'ted'],
  memberNames: { kev: 'Kevin Turley', sarah: 'Sarah', ted: 'Ted' },
  memberDisplayNames: { kev: 'Kev' } // per-group override takes priority
}

const proposal = { id: 'prop1', title: 'Weekend Cottage Trip', date: '2027-08-14' }

describe('buildRecipientUids', () => {
  it('returns every member except the triggering user', () => {
    expect(buildRecipientUids(group, 'kev')).toEqual(['sarah', 'ted'])
    expect(buildRecipientUids(group, 'sarah')).toEqual(['kev', 'ted'])
  })

  it('never includes removed members (they are absent from memberIds)', () => {
    // "removed" member "jenny" is not in memberIds, so she's never a recipient.
    const recipients = buildRecipientUids(group, 'kev')
    expect(recipients).not.toContain('jenny')
  })

  it('handles an actor who is not a member, and empty/missing groups', () => {
    expect(buildRecipientUids(group, 'outsider')).toEqual(['kev', 'sarah', 'ted'])
    expect(buildRecipientUids({ memberIds: [] }, 'kev')).toEqual([])
    expect(buildRecipientUids(null, 'kev')).toEqual([])
  })
})

describe('buildProposalEmailContent', () => {
  it('proposal created: subject + body include title, actor, group, and date', () => {
    const { subject, text } = buildProposalEmailContent(PROPOSAL_EVENTS.CREATED, {
      group,
      proposal,
      actorName: 'Kev'
    })
    expect(subject).toBe('New Proposal Created: Weekend Cottage Trip')
    expect(text).toContain('Weekend Cottage Trip')
    expect(text).toContain('Kev')
    expect(text).toContain('Cottage Crew')
    expect(text).toContain('August 14, 2027')
  })

  it('links "Smash Date" to the proposal URL in the created email', () => {
    const url = 'https://smash-date.example/proposal/prop1'
    const { html, text } = buildProposalEmailContent(PROPOSAL_EVENTS.CREATED, {
      group,
      proposal,
      actorName: 'Kev',
      proposalUrl: url
    })
    // HTML: only the words "Smash Date" are the anchor.
    expect(html).toContain(`<a href="${url}"`)
    expect(html).toContain('>Smash Date</a>')
    // Plain-text body still carries the raw URL for non-HTML clients.
    expect(text).toContain(url)
  })

  it('links "Smash Date" to the proposal URL in the changes-requested email', () => {
    const url = 'https://smash-date.example/proposal/prop1'
    const { html } = buildProposalEmailContent(PROPOSAL_EVENTS.CHANGES_REQUESTED, {
      group,
      proposal,
      actorName: 'Sarah',
      proposalUrl: url
    })
    expect(html).toContain(`<a href="${url}"`)
    expect(html).toContain('>Smash Date</a>')
  })

  it('proposal created: omits the date line when no date is set', () => {
    const { text } = buildProposalEmailContent(PROPOSAL_EVENTS.CREATED, {
      group,
      proposal: { id: 'p', title: 'No Date Yet', date: '' },
      actorName: 'Kev'
    })
    expect(text).not.toContain('Date:')
  })

  it('proposal proposed: subject + body include title, actor, group, and link', () => {
    const url = 'https://smash-date.example/proposal/prop1'
    const { subject, text, html } = buildProposalEmailContent(PROPOSAL_EVENTS.PROPOSED, {
      group,
      proposal,
      actorName: 'Kev',
      proposalUrl: url
    })
    expect(subject).toBe('Date Proposed: Weekend Cottage Trip')
    expect(text).toContain('Weekend Cottage Trip')
    expect(text).toContain('Kev')
    expect(text).toContain('Cottage Crew')
    expect(html).toContain('>Smash Date</a>')
  })

  it('proposal re-proposed: distinct subject + re-proposed wording', () => {
    const { subject, text } = buildProposalEmailContent(PROPOSAL_EVENTS.REPROPOSED, {
      group,
      proposal,
      actorName: 'Sarah'
    })
    expect(subject).toBe('Date Re-proposed: Weekend Cottage Trip')
    expect(text).toContain('re-proposed')
    expect(text).toContain('Sarah')
    expect(text).toContain('Cottage Crew')
  })

  it('proposal locked: subject + body include title, group, and locking user', () => {
    const { subject, text } = buildProposalEmailContent(PROPOSAL_EVENTS.LOCKED, {
      group,
      proposal,
      actorName: 'Kev'
    })
    expect(subject).toBe('Proposal Locked: Weekend Cottage Trip')
    expect(text).toContain('Weekend Cottage Trip')
    expect(text).toContain('Cottage Crew')
    expect(text).toContain('Kev')
    expect(text).toContain('finalized')
  })

  it('proposal locked: includes proposal detail fields, but not responsibilities/comments/activity', () => {
    const detailed = {
      id: 'prop1',
      title: 'Weekend Cottage Trip',
      description: 'Two nights away',
      date: '2027-08-14',
      time: '18:30',
      activity: 'Hiking',
      location: 'Lakeside cabin',
      childcareNotes: 'Grandparents on call',
      budget: '$400',
      notes: 'Bring board games'
    }
    const { text } = buildProposalEmailContent(PROPOSAL_EVENTS.LOCKED, {
      group,
      proposal: detailed,
      actorName: 'Kev'
    })
    expect(text).toContain('Proposal Details:')
    expect(text).toContain('Description: Two nights away')
    expect(text).toContain('Date: August 14, 2027')
    expect(text).toContain('Time: 18:30')
    expect(text).toContain('Activity: Hiking')
    expect(text).toContain('Location: Lakeside cabin')
    expect(text).toContain('Childcare Notes: Grandparents on call')
    expect(text).toContain('Budget: $400')
    expect(text).toContain('Notes: Bring board games')
    // The locked email is planning info only — it never lists responsibilities,
    // comments, or activity-feed entries. (Note: the proposal's own "Activity"
    // detail field above IS included; that's planning info, not the feed.)
    expect(text).not.toMatch(/responsibilit/i)
    expect(text).not.toMatch(/comment/i)
  })

  it('proposal locked: omits the details section when no detail fields are set', () => {
    const { text } = buildProposalEmailContent(PROPOSAL_EVENTS.LOCKED, {
      group,
      proposal: { id: 'p', title: 'Bare', date: '' },
      actorName: 'Kev'
    })
    expect(text).not.toContain('Proposal Details:')
  })

  it('changes requested: subject + body include title, group, and requesting user', () => {
    const { subject, text } = buildProposalEmailContent(PROPOSAL_EVENTS.CHANGES_REQUESTED, {
      group,
      proposal,
      actorName: 'Sarah'
    })
    expect(subject).toBe('Changes Requested: Weekend Cottage Trip')
    expect(text).toContain('Weekend Cottage Trip')
    expect(text).toContain('Cottage Crew')
    expect(text).toContain('Sarah')
  })

  it('escapes HTML in the proposal title for the html body', () => {
    const { html } = buildProposalEmailContent(PROPOSAL_EVENTS.CREATED, {
      group,
      proposal: { id: 'p', title: '<script>x</script>', date: '' },
      actorName: 'Kev'
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('returns null for an unknown event', () => {
    expect(buildProposalEmailContent('nope', { group, proposal })).toBeNull()
  })
})

describe('buildProposalMailDocuments', () => {
  it('produces one mail doc per recipient, excluding the actor', () => {
    const docs = buildProposalMailDocuments(PROPOSAL_EVENTS.CREATED, {
      group,
      proposal,
      actorUid: 'kev',
      actorName: 'Kev'
    })
    expect(docs).toHaveLength(2)
    const allTo = docs.flatMap((d) => d.toUids)
    expect(allTo.sort()).toEqual(['sarah', 'ted'])
    expect(allTo).not.toContain('kev')
  })

  it('addresses recipients by UID (toUids) — never by raw email', () => {
    const docs = buildProposalMailDocuments(PROPOSAL_EVENTS.LOCKED, {
      group,
      proposal,
      actorUid: 'kev',
      actorName: 'Kev'
    })
    docs.forEach((d) => {
      expect(d.toUids).toHaveLength(1)
      expect(d).not.toHaveProperty('to')
      expect(d.message.subject).toContain('Weekend Cottage Trip')
    })
  })

  it('embeds the proposal deep link (built from baseUrl) in each email', () => {
    const docs = buildProposalMailDocuments(PROPOSAL_EVENTS.CREATED, {
      group,
      proposal,
      actorUid: 'kev',
      actorName: 'Kev',
      baseUrl: 'https://smash-date.example/'
    })
    docs.forEach((d) => {
      // Trailing slash on baseUrl is normalized; route is /proposal/:id.
      expect(d.message.html).toContain('href="https://smash-date.example/proposal/prop1"')
      expect(d.message.text).toContain('https://smash-date.example/proposal/prop1')
    })
  })

  it('stamps security metadata used by the Firestore rules', () => {
    const [doc] = buildProposalMailDocuments(PROPOSAL_EVENTS.CHANGES_REQUESTED, {
      group,
      proposal,
      actorUid: 'sarah',
      actorName: 'Sarah'
    })
    expect(doc.groupId).toBe('group1')
    expect(doc.proposalId).toBe('prop1')
    expect(doc.createdBy).toBe('sarah')
    expect(doc.event).toBe(PROPOSAL_EVENTS.CHANGES_REQUESTED)
  })

  it('returns no documents when the actor is the only member', () => {
    const solo = { id: 'g', name: 'Solo', memberIds: ['kev'] }
    expect(
      buildProposalMailDocuments(PROPOSAL_EVENTS.CREATED, {
        group: solo,
        proposal,
        actorUid: 'kev'
      })
    ).toEqual([])
  })

  it('falls back to group-aware name resolution when actorName is not passed', () => {
    // No actorName given → resolves "kev" via memberDisplayNames override = "Kev".
    const [doc] = buildProposalMailDocuments(PROPOSAL_EVENTS.CREATED, {
      group,
      proposal,
      actorUid: 'kev'
    })
    expect(doc.message.text).toContain('Kev')
  })
})
