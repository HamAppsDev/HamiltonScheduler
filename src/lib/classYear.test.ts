import { describe, expect, it } from 'vitest'
import { describeYears, openToMe, openToYears } from './classYear'

const years = (note: string) => [...(openToYears(note) ?? [])].sort()

describe('openToYears', () => {
  it('reads the common phrasings', () => {
    expect(years('Open to Srs., Jrs., Soph., & 1st Yr')).toEqual(['FY', 'JR', 'SO', 'SR'])
    expect(years('Open to Srs., Jrs. & Sophomores')).toEqual(['JR', 'SO', 'SR'])
    expect(years('Open to 1st Yrs, Soph. & Jrs. Only')).toEqual(['FY', 'JR', 'SO'])
    expect(years('Open to Seniors Only.')).toEqual(['SR'])
    expect(years('Open to First-Years Only. (FYC)')).toEqual(['FY'])
    expect(years('Open to Juniors and Seniors Only')).toEqual(['JR', 'SR'])
    expect(years('Restricted to Sr. SOC majors only')).toEqual(['SR'])
    expect(years('Open 1st Years, Sophomores, and Juniors')).toEqual(['FY', 'JR', 'SO'])
  })
  it('looks past other sentences', () => {
    expect(years("Instructor's Signature Req. Open to Seniors Only. Restricted to Econ Concentrators")).toEqual(['SR'])
    expect(years('Not open to those who took BIO 248. Open to Sophomores only.')).toEqual(['SO'])
  })
  it('treats "not open to" as no year limit', () => {
    expect(openToYears('Not open to Sr ECON concentrators')).toBeNull()
    expect(openToYears('Not Open Students Taking Phyed-206')).toBeNull()
  })
  it('ignores ways in ("by permission") and notes without years', () => {
    expect(years('Open to Srs, Jrs, and Sophomores. First Years require instructor permission.')).toEqual(['JR', 'SO', 'SR'])
    expect(years('Open to Seniors, Juniors, and Sophomores. First Years by instructor permission.')).toEqual(['JR', 'SO', 'SR'])
    expect(openToYears('First Years require instructor permission.')).toBeNull()
    expect(openToYears('Open to Spring 2027 Justice Lab students only.')).toBeNull()
    expect(openToYears("Instructor's Signature Req.")).toBeNull()
    expect(openToYears(null)).toBeNull()
  })
})

describe('openToMe', () => {
  it('is true with no year chosen or no limit stated', () => {
    expect(openToMe('Open to Seniors Only', null)).toBe(true)
    expect(openToMe(null, 'FY')).toBe(true)
  })
  it('checks the chosen year', () => {
    expect(openToMe('Open to Seniors Only', 'SR')).toBe(true)
    expect(openToMe('Open to Seniors Only', 'SO')).toBe(false)
  })
  it('describes years for messages', () => {
    expect(describeYears(new Set(['SR']))).toBe('seniors')
    expect(describeYears(new Set(['JR', 'SR']))).toBe('juniors and seniors')
    expect(describeYears(new Set(['FY', 'SO', 'JR']))).toBe('first-years, sophomores and juniors')
  })
})
