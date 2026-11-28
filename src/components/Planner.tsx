import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../lib/api'
import { buildIcs, downloadIcs } from '../lib/ics'
import { indexLabs, isLabCourse } from '../lib/labs'
import { ASK_THE_PROFESSOR, CLASS_YEARS, openToMe, type ClassYear } from '../lib/classYear'
import { applyMode, applyPaletteUi, initialMode, loadPref, PALETTES, savePref, type Mode } from '../lib/theme'
import { MAX_SCHEDULES_PER_TERM, type Course, type Schedule, type SectionWithCourse, type Term } from '../lib/types'
import Header from './Header'
import Sidebar, { type SavedCourse } from './Sidebar'
import Calendar from './Calendar'
import DetailsPanel from './DetailsPanel'
import { CalendarIcon, PencilIcon, PlusIcon } from './Icons'

export default function Planner() {
  const [terms, setTerms] = useState<Term[]>([])
  const [termId, setTermId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<Course[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleId, setScheduleId] = useState<number | null>(null)
  const scheduleIdRef = useRef<number | null>(null) // the schedule on screen, for background saves that finish later
  scheduleIdRef.current = scheduleId
  const [sectionIds, setSectionIds] = useState<number[]>([])
  const [detailId, setDetailId] = useState<number | null>(null)
  const [previewCourse, setPreviewCourse] = useState<Course | null>(null)
  const [pickCourseId, setPickCourseId] = useState<number | null>(null) // choosing another section of this course
  const [adding, setAdding] = useState<Adding | null>(null) // adding a course: choosing its section (then lab) first
  const [query, setQuery] = useState('')
  // The student's class year (remembered on this device): sections not open to it are left out of picking.
  const [classYear, setClassYearState] = useState<ClassYear | null>(() => {
    const v = loadPref('hs-class-year')
    return CLASS_YEARS.some((y) => y.id === v) ? (v as ClassYear) : null
  })
  const setClassYear = (y: ClassYear | null) => { setClassYearState(y); savePref('hs-class-year', y ?? '') }
  const choices = (c: Course) => choicesOf(c, classYear)
  const yearPlural = CLASS_YEARS.find((y) => y.id === classYear)?.plural
  /** Class-year note for the pick bar: sections left out, or none open to this year at all. */
  const yearNote = (c: Course) => {
    if (!classYear) return null
    const notMine = choicesOf(c).filter((s) => !openToMe(s.comments, classYear)).length
    if (!notMine) return null
    const noneOpen = choices(c).every((s) => !openToMe(s.comments, classYear))
    return <YearNote count={notMine} plural={yearPlural!} noneOpen={noneOpen} />
  }
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [paletteIndex, setPaletteIndex] = useState(() => Number(loadPref('hs-palette')) || 0)

  useEffect(() => applyMode(mode), [mode])
  useEffect(() => {
    savePref('hs-palette', String(paletteIndex))
    applyPaletteUi(PALETTES[paletteIndex] ?? PALETTES[0])
  }, [paletteIndex])

  // Picking a theme that comes in a light or dark version also switches the mode.
  const choosePalette = useCallback((i: number) => {
    setPaletteIndex(i)
    const m = PALETTES[i]?.mode
    if (m) setMode(m)
  }, [])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null)
    try { await fn() } catch (e) { setError(api.friendlyError(e)) }
  }, [])

  // First load: make sure default schedules exist, then load semesters.
  useEffect(() => {
    run(async () => {
      await api.ensureDefaultSchedules()
      const t = await api.fetchTerms()
      setTerms(t)
      const active = t.filter((x) => x.is_active)
      setTermId((active[active.length - 1] ?? t[t.length - 1])?.id ?? null)
    })
  }, [run])

  // Semester changed: load its catalog and the student's schedules.
  useEffect(() => {
    if (!termId) return
    let stale = false
    setDetailId(null); setPickCourseId(null); setAdding(null); setCatalog([]); setSchedules([]); setScheduleId(null)
    run(async () => {
      const [c, s] = await Promise.all([api.fetchCatalog(termId), api.fetchSchedules(termId)])
      if (stale) return
      setCatalog(c); setSchedules(s); setScheduleId(s[0]?.id ?? null)
    })
    return () => { stale = true }
  }, [termId, run])

  // Schedule changed: load its sections.
  useEffect(() => {
    setSectionIds([])
    setPickCourseId(null)
    setAdding(null)
    if (!scheduleId) return
    let stale = false
    run(async () => {
      const ids = await api.fetchScheduleSectionIds(scheduleId)
      if (!stale) setSectionIds(ids)
    })
    return () => { stale = true }
  }, [scheduleId, run])

  const sectionsById = useMemo(() => {
    const m = new Map<number, SectionWithCourse>()
    for (const course of catalog) for (const s of course.sections) m.set(s.id, { ...s, course })
    return m
  }, [catalog])

  const scheduled = useMemo(
    () => sectionIds.map((id) => sectionsById.get(id)).filter((s): s is SectionWithCourse => !!s),
    [sectionIds, sectionsById],
  )

  const labs = useMemo(() => indexLabs(catalog), [catalog])

  // Saved courses, in the order they were added, each with its palette color. A lab joins its
  // class's card (same color); a lab whose class isn't on the schedule gets a card of its own.
  const palette = PALETTES[paletteIndex] ?? PALETTES[0]
  const saved: SavedCourse[] = useMemo(() => {
    const out: SavedCourse[] = []
    const add = (s: SectionWithCourse, group?: SavedCourse) => {
      if (group) {
        group.sections.push(s)
        if (!group.courseIds.includes(s.course.id)) group.courseIds.push(s.course.id)
      } else {
        out.push({ course: s.course, color: palette.colors[out.length % palette.colors.length], sections: [s], courseIds: [s.course.id] })
      }
    }
    const isAttachedLab = (s: SectionWithCourse) => labs.classesOf.has(s.course.id)
    for (const s of scheduled) if (!isAttachedLab(s)) add(s, out.find((x) => x.course.id === s.course.id))
    for (const s of scheduled) {
      if (!isAttachedLab(s)) continue
      const classIds = labs.classesOf.get(s.course.id)!.map((c) => c.id)
      add(s, out.find((x) => classIds.includes(x.course.id)) ?? out.find((x) => x.course.id === s.course.id))
    }
    return out
  }, [scheduled, palette, labs])
  const colorOf = useCallback(
    (courseId: number) => saved.find((x) => x.courseIds.includes(courseId))?.color ?? palette.colors[saved.length % palette.colors.length],
    [saved, palette],
  )

  const pickCourse = pickCourseId ? catalog.find((c) => c.id === pickCourseId) ?? null : null
  const addingCourse = adding ? adding.steps[adding.step] : null
  // Sections already chosen while adding: shown solid, saved only when every choice is made.
  const pending = useMemo(
    () => (adding?.picked ?? []).map((id) => sectionsById.get(id)).filter((s): s is SectionWithCourse => !!s),
    [adding, sectionsById],
  )

  // Faded blocks: the choices while adding a course, else the other sections of the course
  // being switched, else the hovered search result (with its lab).
  const preview = useMemo(() => {
    const open = (c: Course, skip: number[] = []) => choices(c).filter((s) => !skip.includes(s.id)).map((s) => ({ ...s, course: c }))
    if (addingCourse) return open(addingCourse)
    if (pickCourse) return open(pickCourse, sectionIds)
    if (!previewCourse) return []
    return [previewCourse, ...(labs.labsOf.get(previewCourse.id) ?? [])].flatMap((c) => open(c))
  }, [addingCourse, pickCourse, previewCourse, sectionIds, labs, classYear])

  // Esc cancels adding (nothing is saved) or leaves section-switching mode.
  useEffect(() => {
    if (!pickCourseId && !adding) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAdding(null); setPickCourseId(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickCourseId, adding])

  const term = terms.find((t) => t.id === termId) ?? null
  const schedule = schedules.find((s) => s.id === scheduleId) ?? null

  /**
   * Change the schedule on screen right away, then save to the database in the background.
   * If saving fails, undo the change (unless the student has moved to another schedule meanwhile)
   * and show the error.
   */
  function changeSections(added: number[], removed: number[], save: (scheduleId: number) => Promise<void>) {
    if (!scheduleId) return
    const target = scheduleId
    const apply = (ids: number[], add: number[], drop: number[]) => [...ids.filter((x) => !drop.includes(x) && !add.includes(x)), ...add]
    setError(null)
    setSectionIds((ids) => apply(ids, added, removed))
    save(target).catch((e) => {
      if (scheduleIdRef.current === target) setSectionIds((ids) => apply(ids, removed, added))
      setError(`Couldn't save that change: ${api.friendlyError(e)}`)
    })
  }

  function removeSectionById(id: number) {
    changeSections([], [id], (sid) => api.removeSections(sid, [id]))
  }

  /**
   * Add a course: the student picks its section on the calendar, then its lab's. A step with only
   * one choice is filled in automatically. Nothing is saved until the last choice (Esc cancels).
   * `sectionId` skips the first step when a specific section was chosen (from Details).
   */
  function addCourse(course: Course, sectionId?: number) {
    if (!choices(course).length) return setNotice(`${course.code} has no sections this semester.`)
    // A cross-listed class is one class: don't add the HIST copy when the AMST copy is already on.
    const twin = scheduled.find((s) => s.course.id !== course.id && course.cross_listed.includes(s.course.code))
    if (twin) return setNotice(`${course.code} is already on your schedule as ${twin.course.code}.`)
    setPickCourseId(null); setPreviewCourse(null)
    const onSchedule = (c: Course) => c.sections.some((s) => sectionIds.includes(s.id))
    const labSteps = (labs.labsOf.get(course.id) ?? []).filter((l) => choices(l).length && !onSchedule(l))
    advance({ steps: [course, ...labSteps], step: sectionId ? 1 : 0, picked: sectionId ? [sectionId] : [] })
  }
  /** Fill in single-choice steps; save once every step is chosen, else wait for the student. */
  function advance(a: Adding) {
    let { step } = a
    const picked = [...a.picked]
    while (step < a.steps.length && choices(a.steps[step]).length === 1) picked.push(choices(a.steps[step++])[0].id)
    if (step < a.steps.length) return setAdding({ ...a, step, picked })
    setAdding(null)
    const ids = picked.filter((id) => !sectionIds.includes(id))
    if (ids.length) changeSections(ids, [], async (sid) => { for (const id of ids) await api.addSection(sid, id) })
  }
  /** Replace whichever section of `course` is on the schedule with `newId`. */
  function switchSection(course: Course, newId: number) {
    const old = sectionIds.filter((id) => sectionsById.get(id)?.course.id === course.id && id !== newId)
    // Add the new section before removing the old one, so a failure never leaves the course off the schedule.
    changeSections([newId], old, async (sid) => {
      await api.addSection(sid, newId)
      await api.removeSections(sid, old)
    })
  }

  /** Calendar block clicked (TigerJunction style). */
  function onBlockClick(id: number) {
    const sec = sectionsById.get(id)
    if (!sec) return
    const course = sec.course
    if (adding) {
      if (course.id === addingCourse?.id) advance({ ...adding, step: adding.step + 1, picked: [...adding.picked, id] })
      return
    }
    if (pickCourseId === course.id) {
      setPickCourseId(null)
      if (sectionIds.includes(id)) setDetailId(id) // clicked the current section again
      else void switchSection(course, id)          // clicked another section: switch to it
      return
    }
    const choices = course.sections.filter((s) => s.status !== 'canceled')
    if (sectionIds.includes(id) && choices.length > 1) setPickCourseId(course.id)
    else setDetailId(id)
  }

  /** Remove a saved course card: the class and its lab. */
  function removeCourse(course: Course) {
    const courseIds = saved.find((x) => x.course.id === course.id)?.courseIds ?? [course.id]
    const ids = sectionIds.filter((id) => courseIds.includes(sectionsById.get(id)?.course.id ?? -1))
    changeSections([], ids, (sid) => api.removeSections(sid, ids))
  }

  async function newSchedule() {
    if (!termId) return
    const name = window.prompt('Name for the new schedule:', `Schedule ${schedules.length + 1}`)
    if (!name?.trim()) return
    await run(async () => {
      const s = await api.createSchedule(termId, name)
      setSchedules((list) => [...list, s]); setScheduleId(s.id)
    })
  }
  async function editSchedule(s: Schedule) {
    const name = window.prompt(`Rename "${s.name}" (leave empty to delete it):`, s.name)
    if (name === null) return
    if (!name.trim()) {
      if (!window.confirm(`Delete "${s.name}"? This can't be undone.`)) return
      return run(async () => {
        await api.deleteSchedule(s.id)
        const rest = schedules.filter((x) => x.id !== s.id)
        setSchedules(rest); setScheduleId(rest[0]?.id ?? null)
      })
    }
    if (name.trim() === s.name) return
    await run(async () => {
      await api.renameSchedule(s.id, name)
      setSchedules((list) => list.map((x) => (x.id === s.id ? { ...x, name: name.trim() } : x)))
    })
  }

  function exportIcs() {
    if (!term || !schedule) return
    const safe = `${term.name} ${schedule.name}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')
    downloadIcs(`${safe || 'schedule'}.ics`, buildIcs(term, scheduled))
  }

  const detail = detailId ? sectionsById.get(detailId) ?? null : null
  const canExport = scheduled.some((s) => s.days && s.start_time)

  return (
    <div className="shell">
      <Header mode={mode} onToggleMode={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
        paletteIndex={paletteIndex} onPalette={choosePalette} />

      {(error || notice) && (
        <div className="banner" role="alert">
          {error ?? notice} <button className="link" onClick={() => { setError(null); setNotice(null) }}>Dismiss</button>
        </div>
      )}

      <div className="bars">
        <div className="bars-left">
          <nav className="pillbar" aria-label="Semesters">
            {terms.map((t) => (
              <button key={t.id} className={t.id === termId ? 'pill-tab active' : 'pill-tab'} onClick={() => setTermId(t.id)}>
                {t.name}
              </button>
            ))}
          </nav>
          <nav className="pillbar" aria-label="Schedules">
            {schedules.map((s) => (
              <span key={s.id} className={s.id === scheduleId ? 'pill-tab active sched' : 'pill-tab sched'}>
                <button className="sched-name" onClick={() => setScheduleId(s.id)}>{s.name}</button>
                {s.id === scheduleId && (
                  <button className="sched-edit" onClick={() => editSchedule(s)} aria-label={`Rename or delete ${s.name}`}><PencilIcon /></button>
                )}
              </span>
            ))}
            {schedules.length < MAX_SCHEDULES_PER_TERM && termId && (
              <button className="pill-tab icon" onClick={newSchedule} aria-label="New schedule"><PlusIcon /></button>
            )}
          </nav>
        </div>
        <button className="events-btn" onClick={() => setNotice('Custom events are coming soon.')}>
          <CalendarIcon /> Manage Events
        </button>
      </div>

      <main className="main">
        <Sidebar
          courses={catalog}
          labs={labs}
          query={query}
          onQuery={setQuery}
          saved={saved}
          scheduled={scheduled}
          canEdit={!!scheduleId}
          canExport={canExport}
          classYear={classYear}
          onClassYear={setClassYear}
          onAdd={addCourse}
          onRemove={removeCourse}
          onDetails={setDetailId}
          onPreview={setPreviewCourse}
          onExport={exportIcs}
        />
        <Calendar
          sections={[...scheduled, ...pending]}
          preview={preview}
          pickingCourseId={addingCourse?.id ?? pickCourseId}
          colorOf={colorOf}
          onOpen={onBlockClick}
          notice={adding && addingCourse ? (
            <div className="pick-bar" role="status">
              {adding.steps.length > 1 && <span>Step {adding.step + 1} of {adding.steps.length}:</span>}
              {isLabCourse(addingCourse) && adding.step > 0
                ? <span>Now pick a lab time for <strong>{adding.steps[0].code}</strong> ({addingCourse.code}, {preview.length} options).</span>
                : <span>Pick a section of <strong>{addingCourse.code}</strong> on the calendar ({preview.length} options).</span>}
              <button className="link" onClick={() => setAdding(null)}>Cancel</button>
              {yearNote(addingCourse)}
            </div>
          ) : pickCourse && (
            <div className="pick-bar" role="status">
              Pick a section of <strong>{pickCourse.code}</strong> ({preview.length} other{preview.length === 1 ? '' : 's'}) — click the current one for details, or press Esc.
              <button className="link" onClick={() => setPickCourseId(null)}>Done</button>
              {yearNote(pickCourse)}
            </div>
          )}
        />
      </main>

      {detail && (
        <DetailsPanel
          section={detail}
          classYear={classYear}
          labs={labs.labsOf.get(detail.course.id) ?? []}
          onSearch={(q) => { setDetailId(null); setQuery(q) }}
          inSchedule={sectionIds.includes(detail.id)}
          conflicts={scheduled.filter((s) => s.id !== detail.id)}
          canAdd={!!scheduleId}
          onToggle={() => {
            if (sectionIds.includes(detail.id)) {
              // Removing a class also removes its lab (the whole card); removing a lab removes just the lab.
              const card = saved.find((x) => x.course.id === detail.course.id)
              return card ? removeCourse(card.course) : removeSectionById(detail.id)
            }
            setDetailId(null)
            addCourse(detail.course, detail.id)
          }}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

/** Adding a course: its steps (the class, then labs), which one is being chosen, and sections chosen so far. */
interface Adding { steps: Course[]; step: number; picked: number[] }

/** "2 sections not open to sophomores aren't shown." plus the ask-the-professor tip, in the pick bar. */
function YearNote({ count, plural, noneOpen }: { count: number; plural: string; noneOpen: boolean }) {
  return (
    <span className="year-note">
      {noneOpen ? `None of these sections are open to ${plural}.`
        : `${count} section${count === 1 ? '' : 's'} not open to ${plural} ${count === 1 ? "isn't" : "aren't"} shown.`} {ASK_THE_PROFESSOR}
    </span>
  )
}

/**
 * Sections a student can choose: canceled ones are hidden, and with a class year, those not open to
 * it (unless that would leave none, e.g. a course added from Details anyway).
 */
function choicesOf(c: Course, year: ClassYear | null = null) {
  const all = c.sections.filter((s) => s.status !== 'canceled')
  const mine = all.filter((s) => openToMe(s.comments, year))
  return mine.length ? mine : all
}
