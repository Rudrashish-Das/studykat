import { useEffect, useRef } from 'react'
import { playItemSound, playMeow, playMunch, playPurr } from '@/lib/sound'
import { EAT_MS, type CatLifeView } from './useCatLife'

/** How often a toy keeps making its noise while the cat is still at it. */
const ITEM_REPEAT_MS = 3500

/**
 * The room's soundtrack, played off the cat's life: a meow or a purr for a
 * pat, crunching while it eats, and whatever the thing it is playing with
 * sounds like. Whether any of it is heard is up to Settings — the sound
 * functions check, so this only says what happened.
 */
export function useCatSounds(life: Pick<CatLifeView, 'pats' | 'eating' | 'itemSound'>) {
  const lastPats = useRef(life.pats)

  useEffect(() => {
    if (life.pats === lastPats.current) return
    lastPats.current = life.pats
    if (Math.random() < 0.5) playMeow()
    else playPurr()
  }, [life.pats])

  useEffect(() => {
    if (life.eating) playMunch(EAT_MS / 1000 - 0.4)
  }, [life.eating])

  const itemId = life.itemSound?.itemId
  const sound = life.itemSound?.sound
  useEffect(() => {
    if (!itemId || !sound) return
    playItemSound(sound)
    const id = window.setInterval(() => playItemSound(sound), ITEM_REPEAT_MS)
    return () => window.clearInterval(id)
  }, [itemId, sound])
}
