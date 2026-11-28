import type { Course } from './types'

/** Course id -> the same class's listings in other departments (each one's code is in the other's cross_listed). */
export function crossListings(courses: Course[]): Map<number, Course[]> {
  const byCode = new Map(courses.map((c) => [c.code, c]))
  const out = new Map<number, Course[]>()
  for (const c of courses) {
    const others = c.cross_listed.map((x) => byCode.get(x)).filter((o): o is Course => !!o && o.id !== c.id)
    if (others.length) out.set(c.id, others)
  }
  return out
}

/**
 * Keep one card per cross-listed class: the listing in a chosen subject, else the one whose code
 * was typed ("hist"), else the first. The others are dropped.
 */
export function oneListingEach(results: Course[], others: Map<number, Course[]>, q: string, subjects: ReadonlySet<string>): Course[] {
  const words = q.split(/\s+/).filter(Boolean)
  const score = (c: Course) => {
    const subj = c.code.split(' ')[0].toLowerCase()
    const code = c.code.toLowerCase()
    return (subjects.has(c.code.split(' ')[0]) ? 2 : 0) + (words.some((w) => w === subj || code.replace(/\s+/g, '').startsWith(w.replace(/\s+/g, '')) && w.length > 2) ? 1 : 0)
  }
  const ids = new Set(results.map((c) => c.id))
  const best = (c: Course) => [c, ...(others.get(c.id) ?? []).filter((o) => ids.has(o.id))]
    .reduce((a, b) => (score(b) > score(a) ? b : a))
  const seen = new Set<number>()
  const out: Course[] = []
  for (const c of results) {
    if (seen.has(c.id)) continue
    const pick = best(c)
    for (const o of [c, ...(others.get(c.id) ?? [])]) seen.add(o.id)
    out.push(pick)
  }
  return out
}
