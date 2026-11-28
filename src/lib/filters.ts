import { meetingsOf, parseDays, toMinutes, type DayLetter } from './time'
import type { Course, Section } from './types'

/**
 * Course-type filters shown as chips in the Filters panel. Each matches a section whose
 * `types` (Self-Service course types) include any of its labels. To add one, append an entry:
 * see "Adding a search filter" in the README for the labels.
 */
export const TYPE_FILTERS = [
  { id: 'writing', label: 'Writing Intensive', types: ['Writing Intensive Courses'] },
  { id: 'speaking', label: 'Speaking Intensive', types: ['Speaking Intensive Course'] },
  { id: 'quant', label: 'Quantitative', types: ['Quantitative & Symbolic R'] },
  { id: 'proseminar', label: 'Proseminar', types: ['Proseminar'] },
  { id: 'firstyear', label: 'First Year', types: ['First Year Courses'] },
  { id: 'pe', label: 'Phys Ed', types: ['Physical Education Course'] },
  { id: 'senior', label: 'Senior Project', types: ['Senior Project'] },
] as const

export type TypeFilterId = (typeof TYPE_FILTERS)[number]['id']

/** A chip is off (not in the map), "include" (only these) or "exclude" (hide these). */
export type FilterState = 'include' | 'exclude'
export type TypeFilters = ReadonlyMap<TypeFilterId, FilterState>

/** Clicking a chip cycles: off -> include -> exclude -> off. */
export function cycleFilter(filters: TypeFilters, id: TypeFilterId): TypeFilters {
  const next = new Map(filters)
  const now = filters.get(id)
  if (!now) next.set(id, 'include')
  else if (now === 'include') next.set(id, 'exclude')
  else next.delete(id)
  return next
}

/** True if the section has every included type and none of the excluded ones (no filters: always true). */
export function matchesTypes(section: Pick<Section, 'types'>, filters: TypeFilters): boolean {
  return TYPE_FILTERS.every((f) => {
    const state = filters.get(f.id)
    if (!state) return true
    const has = f.types.some((t) => section.types.includes(t))
    return state === 'include' ? has : !has
  })
}

// ---------- Everything in the Filters panel ----------

export const LEVELS = ['100', '200', '300', '400'] as const // '400' means 400 and up
export type Level = (typeof LEVELS)[number]

export interface SearchFilters {
  types: TypeFilters
  days: ReadonlySet<DayLetter> // only classes that meet on these days (and no others)
  startAfter: number | null // minutes after midnight: every meeting starts at or after this
  endBy: number | null // every meeting ends at or before this
  levels: ReadonlySet<Level> // course number level (any of these)
  noConflicts: boolean // hide classes that clash with the schedule (checked in Sidebar, which knows the schedule)
  subjects: ReadonlySet<string> // subject codes ("BIO"); a course matches by its own or a cross-listed code
  professors: ReadonlySet<string> // instructor names; a section matches if any of them teaches it
}

export const NO_FILTERS: SearchFilters = {
  types: new Map(), days: new Set(), startAfter: null, endBy: null, levels: new Set(), noConflicts: false,
  subjects: new Set(), professors: new Set(),
}

/**
 * How many panel filters are on. "No conflicts" isn't counted: it also has its own Show All / No
 * Conflicts tabs at the top of the sidebar, and on its own it doesn't list every course.
 */
export function activeCount(f: SearchFilters): number {
  return f.types.size + (f.days.size ? 1 : 0) + (f.startAfter != null ? 1 : 0) + (f.endBy != null ? 1 : 0) + f.levels.size
    + f.subjects.size + f.professors.size
}

/** "CHEM 190L" -> "100"; 400-, 500-level… -> "400". */
export function levelOf(code: string): Level | null {
  const d = code.match(/\b(\d)\d\d/)?.[1]
  if (!d) return null
  return d >= '4' ? '400' : (`${d}00` as Level)
}

/** "AFRST 146W" -> "AFRST" */
export const subjectOf = (code: string) => code.split(' ')[0]

/** Course-wide filters: level and subject (its own code or any cross-listed one). */
export function matchesCourse(c: Pick<Course, 'code'> & Partial<Pick<Course, 'cross_listed'>>, f: SearchFilters): boolean {
  if (f.levels.size && !f.levels.has(levelOf(c.code) as Level)) return false
  if (f.subjects.size && ![c.code, ...(c.cross_listed ?? [])].some((x) => f.subjects.has(subjectOf(x)))) return false
  return true
}

/** Professor filter for one section. */
export function matchesProfessor(s: Pick<Section, 'instructors'>, f: SearchFilters): boolean {
  return !f.professors.size || s.instructors.some((i) => f.professors.has(i))
}

/** "Tara M. Holman" -> "Holman, Tara M." (for the alphabetical professor list). */
export function lastFirst(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length < 2 ? name : `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
}

/**
 * Day and time filters for one section. Final exams don't count, and a section with no set
 * time (independent study, TBA) always passes.
 */
export function matchesWhen(s: Parameters<typeof meetingsOf>[0], f: SearchFilters): boolean {
  if (!f.days.size && f.startAfter == null && f.endBy == null) return true
  return meetingsOf(s).filter((m) => m.type !== 'FINAL').every((m) =>
    (!f.days.size || parseDays(m.days).every((d) => f.days.has(d)))
    && (f.startAfter == null || toMinutes(m.start_time) >= f.startAfter)
    && (f.endBy == null || toMinutes(m.end_time) <= f.endBy))
}
