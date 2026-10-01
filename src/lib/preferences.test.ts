import { DEFAULT_PREFERENCES, applyUpgrades, sanitize, upgradeKey, type Upgrade } from './preferences'

describe('sanitize', () => {
  it('fills in anything missing or malformed', () => {
    expect(sanitize(null)).toEqual(DEFAULT_PREFERENCES)
    expect(sanitize({ chime: 'airhorn', sound: 'yes', volume: 'loud' })).toEqual(
      DEFAULT_PREFERENCES,
    )
  })

  it('keeps the volume between silent and full', () => {
    expect(sanitize({ volume: 3 }).volume).toBe(1)
    expect(sanitize({ volume: -1 }).volume).toBe(0)
  })
})

describe('applyUpgrades', () => {
  const chosen = {
    ...DEFAULT_PREFERENCES,
    chime: 'meow' as const,
    catSounds: true,
    itemSounds: true,
  }

  it('falls back to the free version of everything locked', () => {
    const p = applyUpgrades(chosen, new Set())
    expect(p.chime).toBe('bell')
    expect(p.catSounds).toBe(false)
    expect(p.itemSounds).toBe(false)
  })

  it('honours what has been bought', () => {
    const all = new Set<Upgrade>(['chimes', 'meow-alarm', 'cat-voice', 'room-sounds'])
    expect(applyUpgrades(chosen, all)).toEqual(chosen)
  })

  it('keeps a chime from a pack that is owned', () => {
    const p = applyUpgrades({ ...chosen, chime: 'marimba' }, new Set<Upgrade>(['chimes']))
    expect(p.chime).toBe('marimba')
  })
})

describe('upgradeKey', () => {
  it('reads the key from an upgrade art key only', () => {
    expect(upgradeKey('upgrade/cat-voice')).toBe('cat-voice')
    expect(upgradeKey('upgrade/jetpack')).toBeNull()
    expect(upgradeKey('toy-ball/red')).toBeNull()
  })
})
