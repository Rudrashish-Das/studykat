/**
 * Every sound in the app, synthesised with Web Audio rather than shipped as
 * files: a few hundred bytes of code instead of a few hundred kilobytes of
 * audio, and they all share one volume knob.
 *
 * Each `play*` checks the preferences itself, so callers just say what
 * happened and never have to know whether the user wants to hear it.
 */
import { getEffectivePreferences, type ChimeSound } from '@/lib/preferences'

export type ItemSound =
  | 'roll'
  | 'jingle'
  | 'rattle'
  | 'rustle'
  | 'slither'
  | 'thump'
  | 'scratch'
  | 'plink'
  | 'tick'

type Channel = 'timer' | 'cat' | 'item'

let ctx: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null

function context(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  return ctx
}

/**
 * Browsers keep audio locked until the page has been interacted with. Unlock
 * it on the first tap anywhere, so a chime at the end of a focus block — which
 * nobody clicked for — can still be heard. Call once at startup.
 */
export function initSound() {
  const unlock = () => {
    const c = context()
    if (c?.state === 'suspended') void c.resume()
  }
  window.addEventListener('pointerdown', unlock, { passive: true })
  window.addEventListener('keydown', unlock)
}

function enabled(channel: Channel): boolean {
  const p = getEffectivePreferences()
  if (!p.sound || p.volume <= 0) return false
  if (channel === 'timer') return p.timerSounds
  if (channel === 'cat') return p.catSounds
  return p.itemSounds
}

/** A master gain at the user's volume, or null when this sound should stay silent. */
function output(channel: Channel, force = false): { c: AudioContext; out: GainNode } | null {
  if (!force && !enabled(channel)) return null
  const c = context()
  if (!c) return null
  if (c.state === 'suspended') void c.resume()
  const out = c.createGain()
  // Squared, so the bottom of the slider is actually quiet.
  out.gain.value = getEffectivePreferences().volume ** 2
  out.connect(c.destination)
  return { c, out }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const buffer = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buffer
  return buffer
}

/** A struck tone: quick attack, exponential ring-out. */
function tone(
  c: AudioContext,
  out: AudioNode,
  freq: number,
  start: number,
  duration: number,
  opts: { type?: OscillatorType; gain?: number; attack?: number } = {},
) {
  const osc = c.createOscillator()
  const env = c.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.value = freq
  const peak = opts.gain ?? 0.3
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(peak, start + (opts.attack ?? 0.005))
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(env).connect(out)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** A burst of filtered noise — rustles, scratches, crunches. */
function burst(
  c: AudioContext,
  out: AudioNode,
  start: number,
  duration: number,
  opts: {
    type?: BiquadFilterType
    freq?: number
    freqTo?: number
    q?: number
    gain?: number
  } = {},
) {
  const src = c.createBufferSource()
  src.buffer = noise(c)
  const filter = c.createBiquadFilter()
  filter.type = opts.type ?? 'bandpass'
  filter.frequency.setValueAtTime(opts.freq ?? 2000, start)
  if (opts.freqTo) filter.frequency.exponentialRampToValueAtTime(opts.freqTo, start + duration)
  filter.Q.value = opts.q ?? 1
  const env = c.createGain()
  const peak = opts.gain ?? 0.3
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, duration / 3))
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  src.connect(filter).connect(env).connect(out)
  src.start(start, Math.random() * 0.5)
  src.stop(start + duration + 0.05)
}

/* ------------------------------------------------------------- cat sounds */

function meowInto(c: AudioContext, out: AudioNode, start: number, pitch = 1) {
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  const f = 520 * pitch
  // "mi-aaa-ow": up, hold, and a falling tail.
  osc.frequency.setValueAtTime(f * 0.85, start)
  osc.frequency.exponentialRampToValueAtTime(f * 1.25, start + 0.18)
  osc.frequency.exponentialRampToValueAtTime(f * 0.8, start + 0.6)

  // Two formants sweeping from "ee" to "ah" to "oo" give it the vowel.
  const f1 = c.createBiquadFilter()
  f1.type = 'bandpass'
  f1.Q.value = 6
  f1.frequency.setValueAtTime(700, start)
  f1.frequency.linearRampToValueAtTime(1100, start + 0.25)
  f1.frequency.linearRampToValueAtTime(600, start + 0.6)
  const f2 = c.createBiquadFilter()
  f2.type = 'bandpass'
  f2.Q.value = 8
  f2.frequency.setValueAtTime(2400, start)
  f2.frequency.linearRampToValueAtTime(1700, start + 0.3)
  f2.frequency.linearRampToValueAtTime(1000, start + 0.6)

  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(0.6, start + 0.06)
  env.gain.setValueAtTime(0.6, start + 0.35)
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.65)

  osc.connect(f1).connect(env)
  osc.connect(f2).connect(env)
  env.connect(out)
  osc.start(start)
  osc.stop(start + 0.7)
}

export function playMeow(force = false) {
  const o = output('cat', force)
  if (!o) return
  meowInto(o.c, o.out, o.c.currentTime, 0.9 + Math.random() * 0.25)
}

export function playPurr(force = false) {
  const o = output('cat', force)
  if (!o) return
  const { c, out } = o
  const t = c.currentTime
  const length = 1.6

  const src = c.createBufferSource()
  src.buffer = noise(c)
  src.loop = true
  const low = c.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 180

  // The rumble is the noise chopped about 26 times a second.
  const chop = c.createGain()
  chop.gain.value = 0.5
  const lfo = c.createOscillator()
  lfo.frequency.value = 26
  const depth = c.createGain()
  depth.gain.value = 0.5
  lfo.connect(depth).connect(chop.gain)

  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(1.6, t + 0.25)
  env.gain.setValueAtTime(1.6, t + length - 0.4)
  env.gain.exponentialRampToValueAtTime(0.0001, t + length)

  src.connect(low).connect(chop).connect(env).connect(out)
  src.start(t)
  lfo.start(t)
  src.stop(t + length + 0.05)
  lfo.stop(t + length + 0.05)
}

/** A few crunchy bites, spread over `seconds`. */
export function playMunch(seconds = 3, force = false) {
  const o = output('cat', force)
  if (!o) return
  const { c, out } = o
  const t = c.currentTime
  const bites = Math.max(2, Math.round(seconds * 2.2))
  for (let i = 0; i < bites; i++) {
    const at = t + (i / bites) * seconds + Math.random() * 0.12
    burst(c, out, at, 0.07, { type: 'bandpass', freq: 1800 + Math.random() * 1200, q: 1.5, gain: 0.35 })
    burst(c, out, at + 0.05, 0.05, { type: 'bandpass', freq: 2600, q: 2, gain: 0.2 })
  }
}

/* ------------------------------------------------------------ item sounds */

export function playItemSound(sound: ItemSound, force = false) {
  const o = output('item', force)
  if (!o) return
  const { c, out } = o
  const t = c.currentTime
  switch (sound) {
    case 'roll':
      burst(c, out, t, 0.9, { type: 'lowpass', freq: 500, freqTo: 220, gain: 0.35 })
      tone(c, out, 2600, t + 0.1, 0.25, { gain: 0.05 })
      tone(c, out, 3100, t + 0.45, 0.25, { gain: 0.04 })
      break
    case 'jingle':
      for (let i = 0; i < 5; i++) {
        tone(c, out, 3200 + Math.random() * 900, t + i * 0.07, 0.3, { gain: 0.07, type: 'triangle' })
      }
      burst(c, out, t, 0.4, { type: 'bandpass', freq: 1200, freqTo: 3000, q: 0.8, gain: 0.12 })
      break
    case 'rattle':
      for (let i = 0; i < 6; i++) {
        burst(c, out, t + i * 0.06, 0.04, { type: 'bandpass', freq: 900 + i * 60, q: 4, gain: 0.3 })
      }
      break
    case 'rustle':
      for (let i = 0; i < 4; i++) {
        burst(c, out, t + i * 0.13 + Math.random() * 0.05, 0.16, {
          type: 'highpass',
          freq: 3500,
          gain: 0.15,
        })
      }
      break
    case 'slither':
      burst(c, out, t, 0.8, { type: 'bandpass', freq: 2500, freqTo: 900, q: 2, gain: 0.18 })
      break
    case 'thump':
      tone(c, out, 110, t, 0.25, { gain: 0.5 })
      burst(c, out, t, 0.12, { type: 'lowpass', freq: 400, gain: 0.3 })
      tone(c, out, 95, t + 0.32, 0.22, { gain: 0.4 })
      break
    case 'scratch':
      for (let i = 0; i < 4; i++) {
        burst(c, out, t + i * 0.18, 0.13, {
          type: 'bandpass',
          freq: 2200,
          freqTo: 4200,
          q: 1.2,
          gain: 0.25,
        })
      }
      break
    case 'plink': {
      // A couple of keys stepped on, roughly in tune.
      const notes = [523.25, 659.25, 587.33, 783.99]
      const first = notes[Math.floor(Math.random() * notes.length)] ?? 523.25
      tone(c, out, first, t, 1.2, { type: 'triangle', gain: 0.25 })
      tone(c, out, first * 2, t, 0.6, { gain: 0.05 })
      tone(c, out, first * 1.5, t + 0.35, 1, { type: 'triangle', gain: 0.18 })
      break
    }
    case 'tick':
      for (let i = 0; i < 4; i++) {
        tone(c, out, i % 2 ? 1500 : 1900, t + i * 0.5, 0.05, { type: 'square', gain: 0.06 })
      }
      break
  }
}

/* ----------------------------------------------------------- timer chimes */

/** The end of a focus block or a break. `soft` is the gentler break-over cue. */
export function playChime(chime: ChimeSound = getEffectivePreferences().chime, opts: { force?: boolean; soft?: boolean } = {}) {
  const o = output('timer', opts.force)
  if (!o) return
  const { c, out } = o
  const t = c.currentTime
  const level = opts.soft ? 0.6 : 1
  switch (chime) {
    case 'bell':
      // Three strikes of a small bell: a fundamental and its inharmonic partials.
      for (let i = 0; i < (opts.soft ? 2 : 3); i++) {
        const at = t + i * 0.9
        tone(c, out, 880, at, 2.2, { gain: 0.3 * level })
        tone(c, out, 880 * 2.76, at, 1.2, { gain: 0.08 * level })
        tone(c, out, 880 * 5.4, at, 0.6, { gain: 0.04 * level })
      }
      break
    case 'chime': {
      const notes = opts.soft ? [783.99, 659.25, 523.25] : [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, i) => tone(c, out, f, t + i * 0.22, 1.6, { gain: 0.25 * level }))
      break
    }
    case 'marimba': {
      const notes = opts.soft ? [587.33, 440] : [440, 587.33, 739.99, 587.33, 880]
      notes.forEach((f, i) => {
        tone(c, out, f, t + i * 0.16, 0.5, { gain: 0.35 * level })
        tone(c, out, f * 4, t + i * 0.16, 0.08, { gain: 0.06 * level })
      })
      break
    }
    case 'meow':
      meowInto(c, out, t, 1)
      if (!opts.soft) meowInto(c, out, t + 0.8, 1.15)
      break
  }
}
