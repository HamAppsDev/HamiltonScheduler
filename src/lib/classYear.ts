/**
 * Class-year limits, read from a section's Self-Service note ("Open to Srs., Jrs. & Sophomores",
 * "Open to First Years only", "Restricted to Sr. SOC majors only"). Notes are typed by hand, so this
 * reads the common phrasings; a section with no year limit in its note is open to everyone.
 */

export const CLASS_YEARS = [
  { id: 'FY', label: 'First-year', plural: 'first-years' },
  { id: 'SO', label: 'Sophomore', plural: 'sophomores' },
  { id: 'JR', label: 'Junior', plural: 'juniors' },
  { id: 'SR', label: 'Senior', plural: 'seniors' },
] as const

export type ClassYear = (typeof CLASS_YEARS)[number]['id']

const PATTERNS: [ClassYear, RegExp][] = [
  ['FY', /\b1st\b|\bfirst/i],
  ['SO', /\bsoph/i],
  ['JR', /\bjrs?\b|\bjuniors?\b/i],
  ['SR', /\bsrs?\b|\bseniors?\b/i],
]

/** The class years a note limits the section to, or null when it states no limit. */
export function openToYears(note: string | null | undefined): ReadonlySet<ClassYear> | null {
  if (!note) return null
  // "Srs." -> "Srs" so abbreviation dots don't look like the end of a sentence.
  const text = note.replace(/\b(Srs|Jrs|Soph|Yrs|Sr|Jr)\./gi, '$1')
  for (const sentence of text.split(/[.;]\s*/)) {
    // "Open to …" / "Restricted to …" (sometimes "Open 1st Years…" without "to"), but not "Not open to …".
    const m = sentence.match(/(?<!\bnot\s)\b(?:open|restricted)\s+(?:only\s+)?(?:to\s+)?(.*)/i)
    if (!m) continue
    // "First Years by instructor permission" is a way in, not a limit: ignore what follows.
    const clause = m[1].split(/first[- ]?years? (?:by|require|with)|by (?:instructor )?permission/i)[0]
    const years = new Set(PATTERNS.filter(([, re]) => re.test(clause)).map(([y]) => y))
    if (years.size) return years
  }
  return null
}

/** Is the section open to this student? (No class year chosen, or no limit stated: yes.) */
export function openToMe(note: string | null | undefined, year: ClassYear | null): boolean {
  if (!year) return true
  const years = openToYears(note)
  return !years || years.has(year)
}

/** "seniors" / "juniors and seniors" / "first-years, sophomores and juniors" */
export function describeYears(years: ReadonlySet<ClassYear>): string {
  const names = CLASS_YEARS.filter((y) => years.has(y.id)).map((y) => y.plural)
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The note shown wherever something is hidden or flagged because of class year. */
export const ASK_THE_PROFESSOR = 'Not open to your year? Try emailing the professor. They’re usually accommodating.'
