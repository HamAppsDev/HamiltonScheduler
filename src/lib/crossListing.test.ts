import { describe, expect, it } from 'vitest'
import { crossListings, oneListingEach } from './crossListing'
import type { Course } from './types'

const course = (id: number, code: string, cross: string[]) => ({ id, code, cross_listed: cross }) as unknown as Course
const hist = course(1, 'HIST 123', ['AMST 123'])
const amst = course(2, 'AMST 123', ['HIST 123'])
const bio = course(3, 'BIO 100', [])
const all = [amst, bio, hist]
const others = crossListings(all)

describe('cross-listed courses', () => {
  it('links each listing to its twins', () => {
    expect(others.get(1)).toEqual([amst])
    expect(others.get(2)).toEqual([hist])
    expect(others.has(3)).toBe(false)
  })
  it('shows one card per class', () => {
    expect(oneListingEach(all, others, '', new Set()).map((c) => c.code)).toEqual(['AMST 123', 'BIO 100'])
  })
  it('uses the department that was searched or filtered', () => {
    expect(oneListingEach(all, others, 'hist', new Set()).map((c) => c.code)).toEqual(['HIST 123', 'BIO 100'])
    expect(oneListingEach(all, others, 'hist123', new Set()).map((c) => c.code)).toEqual(['HIST 123', 'BIO 100'])
    expect(oneListingEach(all, others, '', new Set(['HIST'])).map((c) => c.code)).toEqual(['HIST 123', 'BIO 100'])
    expect(oneListingEach(all, others, 'amst', new Set()).map((c) => c.code)).toEqual(['AMST 123', 'BIO 100'])
  })
})
