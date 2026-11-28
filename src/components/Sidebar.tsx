import { useMemo, useState } from 'react'
import { conflictsWithAny } from '../lib/time'
import { activeCount, lastFirst, matchesCourse, matchesProfessor, matchesTypes, matchesWhen, NO_FILTERS, subjectOf, type SearchFilters } from '../lib/filters'
import type { LabIndex } from '../lib/labs'
import { darken } from '../lib/theme'
import type { Course, Section, SectionWithCourse } from '../lib/types'
import { ChevronsDownIcon, MinusIcon, PlusIcon, ShareIcon } from './Icons'
import { FilterSummary, FiltersButton, type BrowseOption } from './FiltersPanel'
import { ASK_THE_PROFESSOR, CLASS_YEARS, openToMe, type ClassYear } from '../lib/classYear'

/** A course card: the class plus its lab (`courseIds` lists both), in one color. */
export interface SavedCourse { course: Course; color: string; sections: SectionWithCourse[]; courseIds: number[] }

interface Props {
  courses: Course[]
  labs: LabIndex
  query: string
  onQuery: (q: string) => void
  saved: SavedCourse[]
  scheduled: SectionWithCourse[]
  canEdit: boolean
  canExport: boolean
  classYear: ClassYear | null
  onClassYear: (y: ClassYear | null) => void
  onAdd: (course: Course) => void
  onRemove: (course: Course) => void
  onDetails: (sectionId: number) => void
  onPreview: (course: Course | null) => void
  onExport: () => void
}

const MAX_RESULTS = 100

const available = (c: Course) => c.sections.filter((s) => s.status !== 'canceled')

function matches(course: Course, labs: Course[], q: string): boolean {
  const codes = [course.code, ...course.cross_listed, ...labs.map((l) => l.code)]
  const hay = [...codes, ...codes.map((c) => c.replace(/\s+/g, '')), course.title, course.department ?? '',
    ...course.sections.flatMap((s) => s.instructors)].join(' ').toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}

/** "Includes lab" line under a card's title. */
function LabNote({ labs }: { labs: Course[] }) {
  if (!labs.length) return null
  return <span className="card-lab">Includes lab: {labs.map((l) => l.code).join(', ')}</span>
}

export default function Sidebar(p: Props) {
  const { query, onQuery: setQuery } = p
  const [chosen, setFilters] = useState<SearchFilters>(NO_FILTERS)
  // While the mouse is over a filter option, results show what clicking it would do.
  const [hovered, setHovered] = useState<SearchFilters | null>(null)
  const filters = hovered ?? chosen
  const anyFilter = activeCount(filters) > 0

  const savedIds = useMemo(() => new Set(p.saved.flatMap((s) => s.courseIds)), [p.saved])
  const labsOf = (c: Course) => p.labs.labsOf.get(c.id) ?? []

  // Browse lists: every subject (named after its department) and every professor this semester, with course counts.
  const browse = useMemo(() => {
    const subj = new Map<string, { names: Map<string, number>; courses: Set<number> }>()
    const prof = new Map<string, Set<number>>()
    const profDepts = new Map<string, Map<string, number>>()
    for (const c of p.courses) {
      if (p.labs.classesOf.has(c.id)) continue // labs are counted with their class
      for (const code of [c.code, ...c.cross_listed]) {
        const k = subjectOf(code)
        const e = subj.get(k) ?? { names: new Map(), courses: new Set() }
        e.courses.add(c.id)
        if (code === c.code && c.department) e.names.set(c.department, (e.names.get(c.department) ?? 0) + 1)
        subj.set(k, e)
      }
      for (const s of c.sections) for (const i of s.instructors) {
        prof.set(i, (prof.get(i) ?? new Set()).add(c.id))
        if (c.department) {
          const d = profDepts.get(i) ?? new Map<string, number>()
          d.set(c.department, (d.get(c.department) ?? 0) + 1)
          profDepts.set(i, d)
        }
      }
    }
    const subjects: BrowseOption[] = [...subj].map(([id, e]) => ({
      id, hint: id, count: e.courses.size,
      label: [...e.names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? id,
    })).sort((a, b) => a.label.localeCompare(b.label))
    // A professor's department: the one they teach the most sections in this semester.
    const professors: BrowseOption[] = [...prof].map(([id, cs]) => ({
      id, label: lastFirst(id), count: cs.size,
      hint: [...(profDepts.get(id) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0],
    }))
      .sort((a, b) => a.label.localeCompare(b.label))
    return { subjects, professors }
  }, [p.courses, p.labs])

  // With a filter on, an empty search lists every matching course.
  const showResults = query.trim() !== '' || anyFilter

  // `hiddenByYear`: courses that match everything else but have no section open to the student's class year.
  const { results, hiddenByYear } = useMemo(() => {
    const q = query.trim().toLowerCase()
    let hiddenByYear = 0
    if (!q && !anyFilter) return { results: [], hiddenByYear }
    // A section (or lab time) fits when it passes the day/time filters and, with "No Conflicts", clashes with nothing saved.
    const fits = (s: Section) => matchesWhen(s, filters) && (!filters.noConflicts || !conflictsWithAny(s, p.scheduled))
    const results = p.courses.filter((c) => {
      // Labs that belong to a class are shown inside that class's card, not on their own.
      if (savedIds.has(c.id) || p.labs.classesOf.has(c.id)) return false
      const labs = p.labs.labsOf.get(c.id) ?? []
      if (q && !matches(c, labs, q)) return false
      if (!matchesCourse(c, filters)) return false
      const secs = available(c).filter((s) => matchesTypes(s, filters.types) && matchesProfessor(s, filters))
      if (!secs.some(fits)) return false
      // A class with a lab also needs a lab time that fits.
      if (!labs.every((l) => savedIds.has(l.id) || available(l).some(fits))) return false
      if (!secs.some((s) => fits(s) && openToMe(s.comments, p.classYear))) { hiddenByYear++; return false }
      return true
    })
    return { results, hiddenByYear }
  }, [query, p.courses, p.scheduled, p.labs, p.classYear, savedIds, filters, anyFilter])
  const yearPlural = CLASS_YEARS.find((y) => y.id === p.classYear)?.plural

  const firstSectionId = (c: Course) => (available(c)[0] ?? c.sections[0])?.id

  return (
    <aside className="side" aria-label="Courses">
      <div className="seg">
        <button className={!chosen.noConflicts ? 'seg-btn active' : 'seg-btn'} onClick={() => setFilters({ ...chosen, noConflicts: false })}>Show All</button>
        <button className={chosen.noConflicts ? 'seg-btn active' : 'seg-btn'} onClick={() => setFilters({ ...chosen, noConflicts: true })}>No Conflicts</button>
      </div>

      <div className="search-row">
        <input type="search" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search courses" />
        <FiltersButton filters={chosen} onChange={setFilters} onHover={setHovered} classYear={p.classYear} onClassYear={p.onClassYear} subjects={browse.subjects} professors={browse.professors} />
      </div>
      <FilterSummary filters={chosen} onChange={setFilters} subjects={browse.subjects} />

      <div className="side-head">
        <h3>0 Custom Events</h3>
        <button className="text-btn" disabled title="Custom events are coming soon"><ChevronsDownIcon /> Show</button>
      </div>

      <div className="side-head">
        <h3>{p.saved.length} Saved Course{p.saved.length === 1 ? '' : 's'}</h3>
        <button className="text-btn" onClick={p.onExport} disabled={!p.canExport} title="Export to Google Calendar (.ics)">
          <ShareIcon /> Export
        </button>
      </div>

      <ul className="cards">
        {p.saved.map(({ course, color, sections }) => {
          return (
            <li key={course.id} className="card saved" style={{ background: color, borderLeftColor: darken(color) }}>
              <div className="card-main">
                <button className="card-body" onClick={() => p.onDetails(sections[0]?.id ?? firstSectionId(course)!)} aria-label={`${course.code} details`}>
                  <span className="card-code">{[course.code, ...course.cross_listed].join(' / ')}</span>
                  <span className="card-title">{course.title}</span>
                  <LabNote labs={[...new Map(sections.filter((s) => s.course.id !== course.id).map((s) => [s.course.id, s.course])).values()]} />
                </button>
                <button className="card-act" onClick={() => p.onRemove(course)} disabled={!p.canEdit} aria-label={`Remove ${course.code}`}>
                  <MinusIcon />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {showResults && (
        <>
          <div className="divider"><span /></div>
          <div className="side-head"><h3>{results.length} Search Result{results.length === 1 ? '' : 's'}</h3></div>
          <ul className="cards results">
            {results.slice(0, MAX_RESULTS).map((course) => {
              return (
                <li key={course.id} className="card result"
                  onMouseEnter={() => p.onPreview(course)} onMouseLeave={() => p.onPreview(null)}>
                  <div className="card-main">
                    <button className="card-body" onClick={() => { p.onPreview(null); p.onDetails(firstSectionId(course)!) }} aria-label={`${course.code} details`}>
                      <span className="card-code">{[course.code, ...course.cross_listed].join(' / ')}</span>
                      <span className="card-title">{course.title}</span>
                      <LabNote labs={labsOf(course)} />
                    </button>
                    <button className="card-act" onClick={() => { p.onPreview(null); p.onAdd(course) }} disabled={!p.canEdit} aria-label={`Add ${course.code}`}>
                      <PlusIcon />
                    </button>
                  </div>
                </li>
              )
            })}
            {hiddenByYear > 0 && (
              <li className="year-note pad">
                {hiddenByYear} course{hiddenByYear === 1 ? '' : 's'} not open to {yearPlural} {hiddenByYear === 1 ? 'is' : 'are'} hidden. {ASK_THE_PROFESSOR}
              </li>
            )}
            {results.length > MAX_RESULTS && <li className="muted small pad">Showing the first {MAX_RESULTS}. {query.trim() ? 'Keep typing' : 'Search or add a filter'} to narrow.</li>}
          </ul>
        </>
      )}
    </aside>
  )
}
