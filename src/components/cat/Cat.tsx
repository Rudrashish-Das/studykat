import { useId, memo } from 'react'
import type { CatAppearance } from '@/lib/cat/appearance'
import { describeAppearance } from '@/lib/cat/appearance'
import { cn } from '@/lib/cn'

/**
 * The cat, composed from paths and filled from the appearance object.
 *
 * Nothing here is an image asset — that is the whole point. Every one of the
 * millions of possible cats is this one component with different fills, which
 * is how each account gets a visually distinct cat without anyone drawing
 * hundreds of sprites.
 *
 * Structure, back to front: tail, body, socks, chest, head, pattern overlays,
 * ears, face. The pattern overlays are clipped to the body and head silhouettes
 * so markings can never spill past the outline.
 */

export type CatPose =
  | 'idle'
  | 'studying'
  | 'sleeping'
  | 'happy'
  /** Batting at a toy, one paw up. */
  | 'playing'
  /** Up on its back legs at a scratching post. */
  | 'scratching'
  /** Head down, eyes wide: sniffing or staring at something. */
  | 'curious'
  /** Crouch, bum wiggle, spring, pin with both paws — on a beat the toy shares. */
  | 'pouncing'
  /** Both paws wrapped round something, rocking into it and bunny-kicking. */
  | 'wrestling'

/**
 * Whole-body moves for the poses that go somewhere. They share a beat with the
 * toy's own animation in index.css, so the toy reacts when the paws land.
 */
const BODY_MOTION: Partial<Record<CatPose, string>> = {
  pouncing: 'sc-cat-pounce',
  wrestling: 'sc-cat-wrestle',
}

const OUTLINE = '#4a3b34'

export const Cat = memo(function Cat({
  appearance,
  pose = 'idle',
  className,
  animate = true,
  title,
}: {
  appearance: CatAppearance
  pose?: CatPose
  className?: string
  /** Idle loops off for thumbnails and pickers. */
  animate?: boolean
  /** Overrides the generated accessible description. */
  title?: string
}) {
  const uid = useId().replace(/:/g, '')
  const bodyClip = `${uid}-body`
  const headClip = `${uid}-head`
  const sparkleId = `${uid}-sparkle`

  const { coat, accent, nose } = appearance
  const label = title ?? describeAppearance(appearance)

  if (pose === 'sleeping') {
    return (
      <SleepingCat
        appearance={appearance}
        className={className}
        animate={animate}
        label={label}
        uid={uid}
      />
    )
  }

  // Studying: head dips toward the desk and the tail settles. Curious: lower
  // still, nose first.
  const headDip = pose === 'studying' ? 3 : pose === 'curious' ? 5 : 0

  return (
    <svg
      viewBox="0 0 120 124"
      className={cn('h-auto w-full select-none overflow-visible', className)}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={bodyClip}>
          <path d={BODY_PATH} />
        </clipPath>
        <clipPath id={headClip}>
          <ellipse cx="60" cy={48 + headDip} rx="25" ry="22" />
        </clipPath>
        {appearance.sparkle && (
          <radialGradient id={sparkleId} cx="35%" cy="25%" r="75%">
            <stop offset="0%" stopColor="#fff6e0" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#fff6e0" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>

      {/* One soft contact shadow, as every object in this world gets. */}
      <ellipse cx="60" cy="112" rx="34" ry="7" fill={OUTLINE} opacity="0.15" />

      <g
        className={animate ? BODY_MOTION[pose] : undefined}
        style={{ transformOrigin: '60px 108px' }}
      >
        <g
          stroke={OUTLINE}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className={animate ? 'sc-cat-breathe' : undefined}
          style={{ transformOrigin: '60px 104px' }}
        >
          <Tail appearance={appearance} pose={pose} animate={animate} />

          {/* Body */}
          <path d={BODY_PATH} fill={coat.body} />
          <g clipPath={`url(#${bodyClip})`} stroke="none">
            <BodyPattern appearance={appearance} />
          </g>
          <path d={BODY_PATH} fill="none" />

          {/* Front paws, and the socks that sit on them */}
          <Paws appearance={appearance} pose={pose} animate={animate} />

          {/* Head */}
          <Ears appearance={appearance} dip={headDip} animate={animate} />
          <ellipse cx="60" cy={48 + headDip} rx="25" ry="22" fill={coat.body} />
          <g clipPath={`url(#${headClip})`} stroke="none">
            <HeadPattern appearance={appearance} dip={headDip} />
          </g>
          <ellipse cx="60" cy={48 + headDip} rx="25" ry="22" fill="none" />

          <Face appearance={appearance} pose={pose} dip={headDip} animate={animate} nose={nose} />

          {appearance.sparkle && (
            <ellipse
              cx="60"
              cy="66"
              rx="52"
              ry="54"
              fill={`url(#${sparkleId})`}
              stroke="none"
              className={animate ? 'sc-cat-sparkle' : undefined}
            />
          )}
        </g>
      </g>
      {/* Keeps the accent colour referenced even for solid cats, so the value
          is never dropped by a future refactor that only reads what it draws. */}
      <desc>{`coat ${coat.name}, accent ${accent}`}</desc>
    </svg>
  )
})

/* ------------------------------------------------------------------ parts */

const BODY_PATH =
  'M60 60 C 42 60 32 74 32 92 C 32 104 40 108 60 108 C 80 108 88 104 88 92 C 88 74 78 60 60 60 Z'

function Tail({
  appearance,
  pose,
  animate,
}: {
  appearance: CatAppearance
  pose: CatPose
  animate: boolean
}) {
  const { coat, tail } = appearance
  // A studying cat's tail rests; an idle one flicks.
  const flick = animate && pose !== 'studying'

  const d =
    tail === 'short'
      ? 'M86 98 C 96 98 100 92 98 86'
      : tail === 'curl'
        ? 'M86 98 C 102 100 108 88 100 80 C 95 75 88 78 90 84'
        : pose === 'happy' ||
            pose === 'playing' ||
            pose === 'scratching' ||
            pose === 'pouncing' ||
            pose === 'wrestling'
          ? 'M86 96 C 104 94 110 76 104 60'
          : 'M86 98 C 104 98 110 84 104 70'

  return (
    <path
      d={d}
      fill="none"
      stroke={coat.shade}
      strokeWidth="9"
      strokeLinecap="round"
      className={flick ? 'sc-cat-tail' : undefined}
      style={{ transformOrigin: '86px 98px' }}
    />
  )
}

function Paws({
  appearance,
  pose,
  animate,
}: {
  appearance: CatAppearance
  pose: CatPose
  animate: boolean
}) {
  const { coat, socks } = appearance
  // Socks are drawn front-left, front-right, then hinted at the back.
  const front = Math.min(socks, 2)
  const sock = '#f3e8d8'
  // Playing lifts the left paw to bat with; scratching raises both, and they
  // take turns. Wrestling holds both up round the toy; pouncing keeps them down
  // but shoots them forward to pin.
  const leftUp = pose === 'playing' || pose === 'scratching' || pose === 'wrestling'
  const rightUp = pose === 'scratching' || pose === 'wrestling'
  const raised = (up: boolean, cls: string) =>
    up ? { cy: 80, className: animate ? cls : undefined } : { cy: 104 }
  const left =
    pose === 'playing' ? 'sc-cat-bat' : pose === 'wrestling' ? 'sc-cat-grapple-left' : 'sc-cat-knead-left'
  const right = pose === 'wrestling' ? 'sc-cat-grapple-right' : 'sc-cat-knead-right'
  const pin = pose === 'pouncing' && animate ? 'sc-cat-pin' : undefined

  return (
    <g>
      <ellipse
        cx="48"
        rx="9"
        ry="6"
        fill={front >= 1 ? sock : coat.body}
        {...raised(leftUp, left)}
        {...(pin && { className: pin })}
        style={{ transformOrigin: '48px 92px' }}
      />
      <ellipse
        cx="72"
        rx="9"
        ry="6"
        fill={front >= 2 ? sock : coat.body}
        {...raised(rightUp, right)}
        {...(pin && { className: pin })}
        style={{ transformOrigin: '72px 92px' }}
      />
      {socks >= 3 && <ellipse cx="34" cy="99" rx="5" ry="4" fill={sock} />}
      {socks >= 4 && <ellipse cx="86" cy="99" rx="5" ry="4" fill={sock} />}
    </g>
  )
}

function BodyPattern({ appearance }: { appearance: CatAppearance }) {
  const { pattern, accent, coat } = appearance

  switch (pattern) {
    case 'tabby':
      return (
        <g stroke={accent} strokeWidth="4" strokeLinecap="round" opacity="0.7" fill="none">
          <path d="M40 76 L 52 80" />
          <path d="M38 86 L 51 89" />
          <path d="M80 76 L 68 80" />
          <path d="M82 86 L 69 89" />
          <path d="M60 96 L 60 106" />
        </g>
      )
    case 'tuxedo':
      return <path d="M60 64 C 50 74 48 92 52 110 L 68 110 C 72 92 70 74 60 64 Z" fill={accent} />
    case 'calico':
      return (
        <g>
          <ellipse cx="42" cy="82" rx="14" ry="16" fill={accent} />
          <ellipse cx="78" cy="94" rx="12" ry="13" fill={coat.shade} opacity="0.75" />
        </g>
      )
    case 'colorpoint':
      return <ellipse cx="60" cy="112" rx="30" ry="12" fill={accent} opacity="0.55" />
    case 'bicolor':
      return <path d="M32 90 C 46 82 74 82 88 90 L 88 110 L 32 110 Z" fill={accent} />
    case 'van':
      // Van cats are nearly all light: flood the body and leave colour at the
      // extremities only.
      return <path d={BODY_PATH} fill={accent} />
    case 'solid':
    default:
      return null
  }
}

function HeadPattern({ appearance, dip }: { appearance: CatAppearance; dip: number }) {
  const { pattern, accent } = appearance
  const y = (v: number) => v + dip

  switch (pattern) {
    case 'tabby':
      return (
        <g stroke={accent} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75">
          <path d={`M52 ${y(32)} L 57 ${y(40)}`} />
          <path d={`M60 ${y(30)} L 60 ${y(39)}`} />
          <path d={`M68 ${y(32)} L 63 ${y(40)}`} />
        </g>
      )
    case 'tuxedo':
    case 'bicolor':
      return <ellipse cx="60" cy={y(58)} rx="14" ry="10" fill={accent} />
    case 'calico':
      return <ellipse cx="46" cy={y(40)} rx="12" ry="12" fill={accent} />
    case 'colorpoint':
      return <ellipse cx="60" cy={y(54)} rx="17" ry="12" fill={accent} opacity="0.7" />
    case 'van':
      return <ellipse cx="60" cy={y(66)} rx="26" ry="16" fill={accent} />
    case 'solid':
    default:
      return null
  }
}

function Ears({
  appearance,
  dip,
  animate,
}: {
  appearance: CatAppearance
  dip: number
  animate: boolean
}) {
  const { coat, ear, nose } = appearance
  const y = (v: number) => v + dip

  const shapes: Record<typeof ear, { left: string; right: string }> = {
    pointed: {
      left: `M40 ${y(36)} L 36 ${y(16)} L 55 ${y(28)} Z`,
      right: `M80 ${y(36)} L 84 ${y(16)} L 65 ${y(28)} Z`,
    },
    round: {
      left: `M40 ${y(36)} C 34 ${y(22)} 44 ${y(18)} 54 ${y(28)} Z`,
      right: `M80 ${y(36)} C 86 ${y(22)} 76 ${y(18)} 66 ${y(28)} Z`,
    },
    folded: {
      left: `M41 ${y(34)} C 36 ${y(26)} 44 ${y(23)} 53 ${y(29)} Z`,
      right: `M79 ${y(34)} C 84 ${y(26)} 76 ${y(23)} 67 ${y(29)} Z`,
    },
  }

  const { left, right } = shapes[ear]

  return (
    <g>
      <path
        d={left}
        fill={coat.shade}
        className={animate ? 'sc-cat-ear-left' : undefined}
        style={{ transformOrigin: `46px ${y(34)}px` }}
      />
      <path
        d={right}
        fill={coat.shade}
        className={animate ? 'sc-cat-ear-right' : undefined}
        style={{ transformOrigin: `74px ${y(34)}px` }}
      />
      {/* Inner ear, only where there is room for it. */}
      {ear !== 'folded' && (
        <g stroke="none" opacity="0.5">
          <path d={`M43 ${y(33)} L 41 ${y(23)} L 50 ${y(29)} Z`} fill={nose} />
          <path d={`M77 ${y(33)} L 79 ${y(23)} L 70 ${y(29)} Z`} fill={nose} />
        </g>
      )}
    </g>
  )
}

function Face({
  appearance,
  pose,
  dip,
  animate,
  nose,
}: {
  appearance: CatAppearance
  pose: CatPose
  dip: number
  animate: boolean
  nose: string
}) {
  const { eye, eyeRight, face, accent } = appearance
  const y = (v: number) => v + dip
  const leftEye = { x: 51, y: y(48) }
  const rightEye = { x: 69, y: y(48) }

  // Happy cats close their eyes into arcs; studying cats narrow them.
  const closed = pose === 'happy'
  const narrow = pose === 'studying' || pose === 'scratching'
  // Hunting eyes: pupils blown wide.
  const wide = pose === 'playing' || pose === 'curious' || pose === 'pouncing' || pose === 'wrestling'

  return (
    <g>
      <FaceMarkingLayer marking={face} accent={accent} dip={dip} />

      {closed ? (
        <g fill="none" strokeWidth="2.4">
          <path d={`M${leftEye.x - 5} ${leftEye.y + 1} Q ${leftEye.x} ${leftEye.y - 5} ${leftEye.x + 5} ${leftEye.y + 1}`} />
          <path d={`M${rightEye.x - 5} ${rightEye.y + 1} Q ${rightEye.x} ${rightEye.y - 5} ${rightEye.x + 5} ${rightEye.y + 1}`} />
        </g>
      ) : (
        <g className={animate ? 'sc-cat-blink' : undefined} style={{ transformOrigin: `60px ${y(48)}px` }}>
          <Eye cx={leftEye.x} cy={leftEye.y} color={eye} narrow={narrow} wide={wide} />
          <Eye cx={rightEye.x} cy={rightEye.y} color={eyeRight ?? eye} narrow={narrow} wide={wide} />
        </g>
      )}

      {/* Muzzle */}
      <path d={`M60 ${y(55)} L 57 ${y(58)}`} strokeWidth="1.8" fill="none" />
      <path d={`M60 ${y(55)} L 63 ${y(58)}`} strokeWidth="1.8" fill="none" />
      <path
        d={`M56.5 ${y(54)} L 63.5 ${y(54)} L 60 ${y(57.5)} Z`}
        fill={nose}
        strokeWidth="1.6"
      />

      {/* Whiskers — thin, and warm rather than black. */}
      <g stroke={OUTLINE} strokeWidth="1.2" opacity="0.55" fill="none">
        <path d={`M44 ${y(54)} L 30 ${y(51)}`} />
        <path d={`M44 ${y(57)} L 31 ${y(58)}`} />
        <path d={`M76 ${y(54)} L 90 ${y(51)}`} />
        <path d={`M76 ${y(57)} L 89 ${y(58)}`} />
      </g>
    </g>
  )
}

function Eye({
  cx,
  cy,
  color,
  narrow,
  wide = false,
}: {
  cx: number
  cy: number
  color: string
  narrow: boolean
  wide?: boolean
}) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="5" ry={narrow ? 3 : 5.5} fill={color} strokeWidth="1.8" />
      <ellipse
        cx={cx}
        cy={cy}
        rx={wide ? 3.4 : 1.8}
        ry={narrow ? 2.2 : wide ? 4.4 : 4}
        fill={OUTLINE}
        stroke="none"
      />
      {/* One catchlight, upper-left, matching the world's fixed light. */}
      <circle cx={cx - 1.6} cy={cy - 2} r="1.3" fill="#fffaf2" stroke="none" opacity="0.9" />
    </g>
  )
}

function FaceMarkingLayer({
  marking,
  accent,
  dip,
}: {
  marking: CatAppearance['face']
  accent: string
  dip: number
}) {
  const y = (v: number) => v + dip

  switch (marking) {
    case 'blaze':
      return (
        <path
          d={`M60 ${y(28)} L 55 ${y(46)} L 60 ${y(52)} L 65 ${y(46)} Z`}
          fill={accent}
          stroke="none"
          opacity="0.85"
        />
      )
    case 'mask':
      return (
        <path
          d={`M38 ${y(44)} C 46 ${y(34)} 74 ${y(34)} 82 ${y(44)} C 74 ${y(50)} 46 ${y(50)} 38 ${y(44)} Z`}
          fill={accent}
          stroke="none"
          opacity="0.35"
        />
      )
    case 'freckles':
      return (
        <g fill={accent} stroke="none" opacity="0.7">
          <circle cx="48" cy={y(58)} r="1.4" />
          <circle cx="52" cy={y(60)} r="1.2" />
          <circle cx="72" cy={y(58)} r="1.4" />
          <circle cx="68" cy={y(60)} r="1.2" />
        </g>
      )
    case 'brow':
      return (
        <g stroke={accent} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.8">
          <path d={`M46 ${y(38)} L 53 ${y(40)}`} />
          <path d={`M74 ${y(38)} L 67 ${y(40)}`} />
        </g>
      )
    case 'none':
    default:
      return null
  }
}

/* --------------------------------------------------------------- sleeping */

function SleepingCat({
  appearance,
  className,
  animate,
  label,
  uid,
}: {
  appearance: CatAppearance
  className?: string | undefined
  animate: boolean
  label: string
  uid: string
}) {
  const { coat, accent, pattern, nose } = appearance
  const clip = `${uid}-curl`

  return (
    <svg
      viewBox="0 0 120 124"
      className={cn('h-auto w-full select-none overflow-visible', className)}
      role="img"
      aria-label={`${label} Asleep.`}
    >
      <defs>
        <clipPath id={clip}>
          <ellipse cx="60" cy="88" rx="38" ry="24" />
        </clipPath>
      </defs>

      <ellipse cx="60" cy="110" rx="36" ry="6" fill={OUTLINE} opacity="0.15" />

      <g
        stroke={OUTLINE}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className={animate ? 'sc-cat-breathe-slow' : undefined}
        style={{ transformOrigin: '60px 100px' }}
      >
        {/* Tail wrapped around the front, the way a curled cat does. */}
        <path
          d="M30 92 C 22 100 34 110 58 106"
          fill="none"
          stroke={coat.shade}
          strokeWidth="9"
          strokeLinecap="round"
        />

        <ellipse cx="60" cy="88" rx="38" ry="24" fill={coat.body} />
        {pattern !== 'solid' && (
          <g clipPath={`url(#${clip})`} stroke="none">
            <ellipse cx="44" cy="80" rx="16" ry="12" fill={accent} opacity="0.6" />
          </g>
        )}
        <ellipse cx="60" cy="88" rx="38" ry="24" fill="none" />

        {/* Head tucked in against the body */}
        <ellipse cx="84" cy="82" rx="18" ry="16" fill={coat.body} />
        <path d="M72 72 L 70 60 L 80 68 Z" fill={coat.shade} />
        <path d="M94 72 L 98 61 L 88 68 Z" fill={coat.shade} />

        {/* Closed eyes: two soft arcs. */}
        <g fill="none" strokeWidth="2">
          <path d="M77 82 Q 80 85 83 82" />
          <path d="M89 82 Q 92 85 95 82" />
        </g>
        <path d="M84.5 87 L 89.5 87 L 87 90 Z" fill={nose} strokeWidth="1.4" />
      </g>
    </svg>
  )
}
