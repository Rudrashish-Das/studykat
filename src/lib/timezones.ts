/**
 * The timezone list, taken from the browser's own IANA database rather than a
 * hardcoded array that would go stale.
 *
 * This matters more than it looks: the stored timezone decides when the user's
 * day rolls over, which decides the streak and the daily coin cap. The database
 * validates it against `pg_timezone_names` and rejects anything it does not
 * recognise, so a free-text field is a way to get a confusing error rather than
 * a way to be flexible.
 */

export interface TimeZoneOption {
  value: string
  /** e.g. "Asia/Kolkata (GMT+5:30)" */
  label: string
  /** Minutes ahead of UTC, for sorting west-to-east. */
  offsetMinutes: number
}

/** `Intl.supportedValuesOf` is ES2022 and not in every TS lib target yet. */
type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: 'timeZone') => string[]
}

/**
 * A small fallback for browsers without `supportedValuesOf` (pre-2022). Not a
 * real substitute for the full list — just enough that the control still works
 * rather than rendering empty.
 */
const FALLBACK_ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Dublin',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Warsaw',
  'Pacific/Auckland',
  'Pacific/Honolulu',
]

/** "GMT+5:30" for a zone right now, or null if the runtime rejects the name. */
function offsetLabel(zone: string, at: Date): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    }).formatToParts(at)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? null
  } catch {
    return null
  }
}

function offsetMinutes(label: string): number {
  // "GMT", "GMT+5:30", "GMT-8"
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(label)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

let cached: TimeZoneOption[] | null = null

/**
 * Every zone this runtime knows, sorted west to east then alphabetically.
 * Computed once — it is a few hundred `Intl` calls.
 */
export function timeZoneOptions(): TimeZoneOption[] {
  if (cached) return cached

  const intl = Intl as IntlWithSupportedValues
  let zones: string[]
  try {
    zones = intl.supportedValuesOf?.('timeZone') ?? FALLBACK_ZONES
  } catch {
    zones = FALLBACK_ZONES
  }
  if (zones.length === 0) zones = FALLBACK_ZONES
  if (!zones.includes('UTC')) zones = ['UTC', ...zones]

  const now = new Date()
  cached = zones
    .map((zone) => {
      const label = offsetLabel(zone, now)
      if (label === null) return null
      return {
        value: zone,
        label: `${zone.replace(/_/g, ' ')} (${label})`,
        offsetMinutes: offsetMinutes(label),
      }
    })
    .filter((option): option is TimeZoneOption => option !== null)
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value))

  return cached
}

/**
 * The options to render for a control currently set to `current`.
 *
 * The stored value is always included even when the runtime's list omits it:
 * `Asia/Calcutta` and `Asia/Kolkata` are the same zone, but only one is
 * canonical, and an existing profile must not silently lose its setting just
 * because this browser prefers the other spelling.
 */
export function timeZoneOptionsIncluding(current: string): TimeZoneOption[] {
  const options = timeZoneOptions()
  if (!current || options.some((o) => o.value === current)) return options

  const label = offsetLabel(current, new Date())
  const extra: TimeZoneOption = {
    value: current,
    label: label ? `${current.replace(/_/g, ' ')} (${label})` : current,
    offsetMinutes: label ? offsetMinutes(label) : 0,
  }
  return [extra, ...options]
}

/** The browser's best guess, used as the default at onboarding. */
export function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
