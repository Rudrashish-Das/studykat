import { guessTimeZone, timeZoneOptions, timeZoneOptionsIncluding } from './timezones'

/**
 * The stored timezone decides when a day rolls over, which decides the streak
 * and the daily coin cap — and the database rejects any name it does not
 * recognise. So the list has to contain real IANA names and nothing else.
 */
describe('timeZoneOptions', () => {
  const options = timeZoneOptions()

  it('returns a substantial list', () => {
    // The real Intl list is 400+; the fallback is ~38. Either is workable.
    expect(options.length).toBeGreaterThan(30)
  })

  it('only contains names this runtime actually accepts', () => {
    for (const option of options) {
      expect(() =>
        new Intl.DateTimeFormat('en-GB', { timeZone: option.value }).format(new Date()),
      ).not.toThrow()
    }
  })

  it('always offers UTC', () => {
    expect(options.some((o) => o.value === 'UTC')).toBe(true)
  })

  it('has no duplicates', () => {
    const values = options.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('sorts west to east', () => {
    for (let i = 1; i < options.length; i += 1) {
      expect(options[i]!.offsetMinutes).toBeGreaterThanOrEqual(options[i - 1]!.offsetMinutes)
    }
  })

  it('labels each zone with its current offset', () => {
    const kolkata = options.find((o) => o.value === 'Asia/Kolkata')
    if (kolkata) expect(kolkata.label).toMatch(/GMT\+5:30/)
    const utc = options.find((o) => o.value === 'UTC')
    expect(utc?.label).toMatch(/GMT/)
  })

  it('is cached, so the Intl work happens once', () => {
    expect(timeZoneOptions()).toBe(timeZoneOptions())
  })
})

describe('timeZoneOptionsIncluding', () => {
  it('keeps a stored value the runtime does not list', () => {
    // Asia/Calcutta is a legacy alias for Asia/Kolkata. A profile saved under
    // the old spelling must not silently lose its setting.
    const options = timeZoneOptionsIncluding('Asia/Calcutta')
    expect(options.some((o) => o.value === 'Asia/Calcutta')).toBe(true)
  })

  it('does not duplicate a value that is already listed', () => {
    const options = timeZoneOptionsIncluding('UTC')
    expect(options.filter((o) => o.value === 'UTC')).toHaveLength(1)
  })

  it('tolerates an empty or unknown stored value', () => {
    expect(timeZoneOptionsIncluding('').length).toBeGreaterThan(0)
    const weird = timeZoneOptionsIncluding('Mars/Olympus')
    expect(weird.some((o) => o.value === 'Mars/Olympus')).toBe(true)
  })
})

describe('guessTimeZone', () => {
  it('returns a usable IANA name', () => {
    const zone = guessTimeZone()
    expect(zone.length).toBeGreaterThan(0)
    expect(() =>
      new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(new Date()),
    ).not.toThrow()
  })
})
