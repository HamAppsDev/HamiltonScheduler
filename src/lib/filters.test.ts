import { describe, expect, it } from 'vitest'
import { activeCount, cycleFilter, lastFirst, levelOf, matchesCourse, matchesProfessor, matchesTypes, matchesWhen, NO_FILTERS, type FilterState, type Level, type SearchFilters, type TypeFilterId } from './filters'
import type { DayLetter } from './time'

const sec = (...types: string[]) => ({ types })
const pick = (...ids: TypeFilterId[]) => new Map(ids.map((id) => [id, 'include' as FilterState]))
const without = (...ids: TypeFilterId[]) => new Map(ids.map((id) => [id, 'exclude' as FilterState]))

describe('matchesTypes', () => {
  it('lets everything through when no filter is chosen', () => {
    expect(matchesTypes(sec(), pick())).toBe(true)
  })
  it('matches by Self-Service label', () => {
    expect(matchesTypes(sec('Writing Intensive Courses'), pick('writing'))).toBe(true)
    expect(matchesTypes(sec('Speaking Intensive Course'), pick('writing'))).toBe(false)
    expect(matchesTypes(sec(), pick('writing'))).toBe(false)
  })
  it('requires every chosen filter', () => {
    expect(matchesTypes(sec('Writing Intensive Courses', 'Proseminar'), pick('writing', 'proseminar'))).toBe(true)
    expect(matchesTypes(sec('Writing Intensive Courses'), pick('writing', 'proseminar'))).toBe(false)
  })
  it('hides excluded types', () => {
    expect(matchesTypes(sec('Writing Intensive Courses'), without('writing'))).toBe(false)
    expect(matchesTypes(sec('Proseminar'), without('writing'))).toBe(true)
    expect(matchesTypes(sec(), without('writing'))).toBe(true)
  })
  it('combines include and exclude', () => {
    const f = new Map<TypeFilterId, FilterState>([['quant', 'include'], ['firstyear', 'exclude']])
    expect(matchesTypes(sec('Quantitative & Symbolic R'), f)).toBe(true)
    expect(matchesTypes(sec('Quantitative & Symbolic R', 'First Year Courses'), f)).toBe(false)
    expect(matchesTypes(sec('First Year Courses'), f)).toBe(false)
  })
})

describe('cycleFilter', () => {
  it('goes off -> include -> exclude -> off', () => {
    let f = cycleFilter(new Map(), 'writing')
    expect(f.get('writing')).toBe('include')
    f = cycleFilter(f, 'writing')
    expect(f.get('writing')).toBe('exclude')
    f = cycleFilter(f, 'writing')
    expect(f.has('writing')).toBe(false)
  })
  it('leaves other chips alone', () => {
    const f = cycleFilter(new Map([['quant', 'include']]), 'writing')
    expect(f.get('quant')).toBe('include')
  })
})

describe('panel filters', () => {
  const at = (days: string, start: string, end: string, type = 'LEC') => ({ days, start_time: start, end_time: end, type })
  const section = (...meetings: ReturnType<typeof at>[]) => ({ days: null, start_time: null, end_time: null, meetings })
  const f = (over: Partial<SearchFilters>): SearchFilters => ({ ...NO_FILTERS, ...over })

  it('levels come from the course number; 400 means 400 and up', () => {
    expect(levelOf('CHEM 190L')).toBe('100')
    expect(levelOf('AFRST 201W')).toBe('200')
    expect(levelOf('MATH 551')).toBe('400')
    expect(matchesCourse({ code: 'BIO 330' }, f({ levels: new Set(['100', '300'] as Level[]) }))).toBe(true)
    expect(matchesCourse({ code: 'BIO 230' }, f({ levels: new Set(['100', '300'] as Level[]) }))).toBe(false)
  })
  it('subjects match a course by its own or a cross-listed code', () => {
    const bio = f({ subjects: new Set(['WMGST']) })
    expect(matchesCourse({ code: 'SOC 405', cross_listed: ['WMGST 405'] }, bio)).toBe(true)
    expect(matchesCourse({ code: 'WMGST 101', cross_listed: [] }, bio)).toBe(true)
    expect(matchesCourse({ code: 'SOC 101', cross_listed: [] }, bio)).toBe(false)
  })
  it('professors match a section any of them teaches', () => {
    const p = f({ professors: new Set(['Tara M. Holman']) })
    expect(matchesProfessor({ instructors: ['Tara M. Holman', 'Todd Franklin'] }, p)).toBe(true)
    expect(matchesProfessor({ instructors: ['Todd Franklin'] }, p)).toBe(false)
    expect(matchesProfessor({ instructors: [] }, NO_FILTERS)).toBe(true)
    expect(lastFirst('J. Seth T. Schermerhorn')).toBe('Schermerhorn, J. Seth T.')
  })
  it('days keep only classes that meet on the chosen days and no others', () => {
    const mwf = f({ days: new Set(['M', 'W', 'F'] as DayLetter[]) })
    expect(matchesWhen(section(at('MWF', '09:00', '09:50')), mwf)).toBe(true)
    expect(matchesWhen(section(at('MW', '13:00', '14:15')), mwf)).toBe(true)
    expect(matchesWhen(section(at('TR', '10:00', '11:15')), mwf)).toBe(false)
    expect(matchesWhen(section(at('MW', '09:00', '09:50'), at('R', '13:00', '16:00', 'LAB')), mwf)).toBe(false)
  })
  it('start-after and end-by apply to every meeting', () => {
    const tenToFour = f({ startAfter: 600, endBy: 960 })
    expect(matchesWhen(section(at('TR', '10:00', '11:15')), tenToFour)).toBe(true)
    expect(matchesWhen(section(at('MW', '09:00', '09:50')), tenToFour)).toBe(false)
    expect(matchesWhen(section(at('TR', '10:00', '11:15'), at('W', '13:00', '16:30', 'LAB')), tenToFour)).toBe(false)
  })
  it('ignores final exams and lets sections without a set time through', () => {
    const trEarly = f({ days: new Set(['T', 'R'] as DayLetter[]), endBy: 1020 })
    expect(matchesWhen(section(at('TR', '10:00', '11:15'), at('F', '19:00', '22:00', 'FINAL')), trEarly)).toBe(true)
    expect(matchesWhen(section(), trEarly)).toBe(true)
  })
  it('counts active filters (all chosen days count as one; "no conflicts" has its own tabs)', () => {
    expect(activeCount(NO_FILTERS)).toBe(0)
    expect(activeCount(f({ noConflicts: true }))).toBe(0)
    expect(activeCount(f({ days: new Set(['M', 'W'] as DayLetter[]), startAfter: 600, noConflicts: true, types: new Map([['pe', 'exclude']]) }))).toBe(3)
  })
})
