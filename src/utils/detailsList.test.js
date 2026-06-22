import { describe, it, expect } from 'vitest'
import {
  normalizeDetailsItem,
  normalizeDetailsList,
  formatResponsibilityText
} from './detailsList'

describe('normalizeDetailsItem', () => {
  it('upgrades a legacy string item to an incomplete object', () => {
    expect(normalizeDetailsItem('milk')).toEqual({ text: 'milk', completed: false })
  })

  it('preserves an existing object item', () => {
    expect(normalizeDetailsItem({ text: 'eggs', completed: true })).toEqual({
      text: 'eggs',
      completed: true
    })
  })

  it('coerces a truthy/missing completed flag to a real boolean', () => {
    expect(normalizeDetailsItem({ text: 'eggs', completed: 1 })).toEqual({
      text: 'eggs',
      completed: true
    })
    expect(normalizeDetailsItem({ text: 'eggs' })).toEqual({
      text: 'eggs',
      completed: false
    })
  })

  it('defaults a missing/invalid text field to empty string', () => {
    expect(normalizeDetailsItem({ completed: true })).toEqual({ text: '', completed: true })
    expect(normalizeDetailsItem(null)).toEqual({ text: '', completed: false })
  })
})

describe('normalizeDetailsList', () => {
  it('returns an empty array for non-array / missing input', () => {
    expect(normalizeDetailsList(undefined)).toEqual([])
    expect(normalizeDetailsList(null)).toEqual([])
  })

  it('normalizes a mixed legacy + new format list seamlessly', () => {
    expect(normalizeDetailsList(['milk', { text: 'eggs', completed: true }])).toEqual([
      { text: 'milk', completed: false },
      { text: 'eggs', completed: true }
    ])
  })
})

describe('formatResponsibilityText', () => {
  it('formats title, items, and note per spec with a blank line before the note', () => {
    const r = {
      title: 'Pack the cooler',
      detailsList: ['Mickey of vodka', '12 beers', '12 coolers'],
      detailsNote: 'WHAM-O brand, specifically.'
    }
    expect(formatResponsibilityText(r)).toBe(
      [
        'Pack the cooler',
        '- Mickey of vodka',
        '- 12 beers',
        '- 12 coolers',
        '',
        'Note:',
        'WHAM-O brand, specifically.'
      ].join('\n')
    )
  })

  it('omits the item list when there are no items', () => {
    expect(formatResponsibilityText({ title: 'Book table', detailsList: [] })).toBe('Book table')
  })

  it('omits the note section entirely when no note is present', () => {
    expect(formatResponsibilityText({ title: 'Book table', detailsList: ['milk'] })).toBe(
      'Book table\n- milk'
    )
  })

  it('ignores item completion state and uses item.text for object items', () => {
    const r = {
      title: 'Shopping',
      detailsList: [
        { text: 'milk', completed: true },
        { text: 'eggs', completed: false }
      ]
    }
    expect(formatResponsibilityText(r)).toBe('Shopping\n- milk\n- eggs')
  })

  it('never emits "undefined" for empty / missing fields', () => {
    expect(formatResponsibilityText({})).toBe('Untitled responsibility')
    expect(formatResponsibilityText()).toBe('Untitled responsibility')
  })

  it('skips blank/whitespace-only items and a whitespace-only note', () => {
    const r = {
      title: 'Mixed',
      detailsList: ['real', '   ', { text: '  ', completed: false }],
      detailsNote: '   '
    }
    expect(formatResponsibilityText(r)).toBe('Mixed\n- real')
  })
})
