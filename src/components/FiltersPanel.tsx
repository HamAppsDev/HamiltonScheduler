import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { activeCount, cycleFilter, LEVELS, NO_FILTERS, TYPE_FILTERS, type Level, type SearchFilters } from '../lib/filters'
import { DAY_NAMES, type DayLetter } from '../lib/time'
import { FilterIcon } from './Icons'
import { CLASS_YEARS, type ClassYear } from '../lib/classYear'

const WEEKDAYS: DayLetter[] = ['M', 'T', 'W', 'R', 'F']
const SHORT_DAY: Record<string, string> = { M: 'M', T: 'Tu', W: 'W', R: 'Th', F: 'F' }
const START_OPTIONS = [8, 9, 10, 11, 12, 13].map((h) => h * 60)
const END_OPTIONS = [12, 13, 14, 15, 16, 17, 18, 19].map((h) => h * 60)
const hour = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1} ${m < 720 ? 'AM' : 'PM'}`
const levelLabel = (l: Level) => (l === '400' ? '400+' : l)

function toggle<T>(set: ReadonlySet<T>, v: T): ReadonlySet<T> {
  const next = new Set(set)
  if (!next.delete(v)) next.add(v)
  return next
}

/** Mouse-hover preview: results show what clicking would do; leaving puts them back. Touch has no hover. */
type Hover = (preview: SearchFilters | null) => void
function hoverProps(hover: Hover | undefined, preview: () => SearchFilters) {
  if (!hover) return {}
  return {
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') hover(preview()) },
    onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType === 'mouse') hover(null) },
  }
}

/** One entry in a browse list: `id` is what's stored in the filter, `label` what's shown. */
export interface BrowseOption { id: string; label: string; hint?: string; count: number }

interface Props { filters: SearchFilters; onChange: (f: SearchFilters) => void }
interface ButtonProps extends Props {
  subjects: BrowseOption[]; professors: BrowseOption[]; onHover?: Hover
  classYear: ClassYear | null; onClassYear: (y: ClassYear | null) => void
}

/** "All subjects ▾" box that opens a scrollable, findable checklist. */
function BrowseList({ id, noun, options, chosen, onToggle, preview }: {
  id: string; noun: string; options: BrowseOption[]; chosen: ReadonlySet<string>; onToggle: (id: string) => void
  preview: (id: string) => ReturnType<typeof hoverProps>
}) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const q = find.trim().toLowerCase()
  const shown = q ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : options
  const summary = chosen.size === 0 ? `All ${noun}s`
    : chosen.size === 1 ? options.find((o) => chosen.has(o.id))?.label ?? `1 ${noun}`
    : `${chosen.size} ${noun}s chosen`
  return (
    <div className="browse">
      <button className={`browse-box${chosen.size ? ' on' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-controls={`${id}-list`}>
        <span>{summary}</span><span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="browse-pop" id={`${id}-list`}>
          <input type="search" placeholder={`Find a ${noun}…`} value={find} onChange={(e) => setFind(e.target.value)}
            aria-label={`Find a ${noun}`} autoFocus />
          <ul className="browse-list" aria-label={`${noun}s`}>
            {shown.map((o) => (
              <li key={o.id}>
                <label title={`${o.count} course${o.count === 1 ? '' : 's'}`} {...preview(o.id)}>
                  <span className="browse-count muted">{o.count}</span>
                  <span className="browse-name">{o.label}{o.hint && <span className="muted"> · {o.hint}</span>}</span>
                  <input type="checkbox" checked={chosen.has(o.id)} onChange={() => onToggle(o.id)} />
                </label>
              </li>
            ))}
            {!shown.length && <li className="muted small">No {noun} matches “{find}”.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

/** The Filters button (with a count) and its panel. */
export function FiltersButton({ filters: f, onChange, subjects, professors, onHover, classYear, onClassYear }: ButtonProps) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<CSSProperties | undefined>()
  const ref = useRef<HTMLDivElement>(null)
  const count = activeCount(f)

  // On wide screens the panel opens to the right of the sidebar (over the calendar), level with the
  // button, so the search results stay visible. On phones CSS makes it a sheet from the bottom.
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const side = ref.current?.closest('.side')?.getBoundingClientRect()
      const btn = ref.current?.getBoundingClientRect()
      if (!side || !btn || !window.matchMedia('(min-width: 801px)').matches) return setPlace(undefined)
      setPlace({ position: 'fixed', top: btn.top, left: side.right + 10, right: 'auto', maxHeight: `calc(100vh - ${btn.top + 12}px)` })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open])

  useEffect(() => {
    if (!open) return
    // Clicks in the sidebar (scrolling or adding results) keep the panel open; elsewhere close it.
    const close = (e: MouseEvent) => { const t = e.target as Element; if (!ref.current?.contains(t) && !t.closest?.('.side')) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  // A click makes the change real, so any hover preview is dropped (it would show the old toggle).
  const set = (over: Partial<SearchFilters>) => { onHover?.(null); onChange({ ...f, ...over }) }
  const hov = (over: () => Partial<SearchFilters>) => hoverProps(onHover, () => ({ ...f, ...over() }))
  useEffect(() => { if (!open) onHover?.(null) }, [open, onHover])

  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`icon-btn filter-btn${count ? ' on' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label={count ? 'Filters (some on)' : 'Filters'} title="Filters">
        <FilterIcon />
      </button>
      {open && (
        <div className="filter-panel" role="dialog" aria-label="Search filters" style={place}>
          <div className="fp-head">
            <strong>Filters</strong>
            <span>
              {count > 0 && <button className="link" onClick={() => onChange(NO_FILTERS)}>Clear all</button>}
              <button className="link fp-done" onClick={() => setOpen(false)}>Done</button>
            </span>
          </div>

          <div className="fp-row fp-year">
            <label className="fp-label" htmlFor="fp-year">My class year</label>
            <select id="fp-year" value={classYear ?? ''} onChange={(e) => onClassYear((e.target.value || null) as ClassYear | null)}>
              <option value="">Not set</option>
              {CLASS_YEARS.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
            <span className="muted small">Hides sections not open to your year</span>
          </div>

          <h4>Subject</h4>
          <BrowseList id="fp-subjects" noun="subject" options={subjects} chosen={f.subjects}
            onToggle={(id) => set({ subjects: toggle(f.subjects, id) })} preview={(id) => hov(() => ({ subjects: toggle(f.subjects, id) }))} />
          <h4>Professor</h4>
          <BrowseList id="fp-professors" noun="professor" options={professors} chosen={f.professors}
            onToggle={(id) => set({ professors: toggle(f.professors, id) })} preview={(id) => hov(() => ({ professors: toggle(f.professors, id) }))} />

          <h4>When</h4>
          <div className="fp-row">
            <span className="fp-label">Days</span>
            <div className="chips" role="group" aria-label="Days: show only classes that meet on the chosen days">
              {WEEKDAYS.map((d) => (
                <button key={d} className={f.days.has(d) ? 'chip active' : 'chip'} aria-pressed={f.days.has(d)}
                  aria-label={DAY_NAMES[d]} onClick={() => set({ days: toggle(f.days, d) })} {...hov(() => ({ days: toggle(f.days, d) }))}>
                  {SHORT_DAY[d]}
                </button>
              ))}
            </div>
          </div>
          <div className="fp-row fp-times">
            <label className="fp-label" htmlFor="fp-start">Start after</label>
            <select id="fp-start" value={f.startAfter ?? ''} onChange={(e) => set({ startAfter: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any time</option>
              {START_OPTIONS.map((m) => <option key={m} value={m}>{hour(m)}</option>)}
            </select>
            <label className="fp-label" htmlFor="fp-end">End by</label>
            <select id="fp-end" value={f.endBy ?? ''} onChange={(e) => set({ endBy: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any time</option>
              {END_OPTIONS.map((m) => <option key={m} value={m}>{hour(m)}</option>)}
            </select>
          </div>
          <label className="menu-check fp-check" {...hov(() => ({ noConflicts: !f.noConflicts }))}>
            <input type="checkbox" checked={f.noConflicts} onChange={(e) => set({ noConflicts: e.target.checked })} />
            Hide classes that conflict with my schedule
          </label>

          <h4>Level</h4>
          <div className="chips" role="group" aria-label="Course level">
            {LEVELS.map((l) => (
              <button key={l} className={f.levels.has(l) ? 'chip active' : 'chip'} aria-pressed={f.levels.has(l)}
                onClick={() => set({ levels: toggle(f.levels, l) })} {...hov(() => ({ levels: toggle(f.levels, l) }))}>{levelLabel(l)}</button>
            ))}
          </div>

          <h4>Course type <span className="muted small">click once for only these, twice to hide them</span></h4>
          <div className="chips" role="group" aria-label="Course type filters: click once to show only, twice to hide, three times to turn off">
            {TYPE_FILTERS.map((t) => {
              const state = f.types.get(t.id)
              return (
                <button key={t.id} className={`chip${state === 'include' ? ' active' : ''}${state === 'exclude' ? ' excluded' : ''}`}
                  aria-label={`${t.label}: ${state === 'include' ? 'showing only these' : state === 'exclude' ? 'hiding these' : 'off'}`}
                  onClick={() => set({ types: cycleFilter(f.types, t.id) })} {...hov(() => ({ types: cycleFilter(f.types, t.id) }))}>
                  {state === 'exclude' && <span aria-hidden="true">✕ </span>}{t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** One line under the search box listing the filters that are on, each removable. */
export function FilterSummary({ filters: f, onChange, subjects, classYear, onClassYear }: Props & {
  subjects: BrowseOption[]; classYear: ClassYear | null; onClassYear: (y: ClassYear | null) => void
}) {
  const items: { key: string; label: string; remove: () => void }[] = []
  const set = (over: Partial<SearchFilters>) => onChange({ ...f, ...over })
  const year = CLASS_YEARS.find((y) => y.id === classYear)
  if (year) items.push({ key: 'year', label: `Open to ${year.plural}`, remove: () => onClassYear(null) })
  for (const s of f.subjects) items.push({ key: `s${s}`, label: subjects.find((o) => o.id === s)?.label ?? s, remove: () => set({ subjects: toggle(f.subjects, s) }) })
  for (const name of f.professors) items.push({ key: `p${name}`, label: name, remove: () => set({ professors: toggle(f.professors, name) }) })
  if (f.days.size) items.push({ key: 'days', label: `Only ${WEEKDAYS.filter((d) => f.days.has(d)).map((d) => SHORT_DAY[d]).join(' ')}`, remove: () => set({ days: new Set() }) })
  if (f.startAfter != null) items.push({ key: 'start', label: `After ${hour(f.startAfter)}`, remove: () => set({ startAfter: null }) })
  if (f.endBy != null) items.push({ key: 'end', label: `Done by ${hour(f.endBy)}`, remove: () => set({ endBy: null }) })
  for (const l of LEVELS) if (f.levels.has(l)) items.push({ key: `l${l}`, label: `${levelLabel(l)}-level`, remove: () => set({ levels: toggle(f.levels, l) }) })
  for (const t of TYPE_FILTERS) {
    const state = f.types.get(t.id)
    if (!state) continue
    const types = new Map(f.types); types.delete(t.id)
    items.push({ key: t.id, label: state === 'exclude' ? `No ${t.label}` : t.label, remove: () => set({ types }) })
  }
  if (!items.length) return null
  return (
    <ul className="filter-summary" aria-label="Filters on">
      {items.map((i) => (
        <li key={i.key}>
          {i.label}
          <button onClick={i.remove} aria-label={`Remove filter: ${i.label}`}>✕</button>
        </li>
      ))}
    </ul>
  )
}
