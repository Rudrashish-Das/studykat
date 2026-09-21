/**
 * Provisional landing art. Hand-authored SVG that already follows the art
 * recipe from §8 — fixed light from the upper-left (top face lightest, left
 * face mid, right face darkest), 2px warm-dark outline, no pure black, one
 * soft contact shadow per object.
 *
 * Phase 4 replaces the cat here with the real seeded <Cat />, and Phase 5
 * replaces the room with the real isometric renderer. Nothing in this file is
 * load-bearing.
 */
export function LandingScene() {
  return (
    <div className="animate-fade-up [animation-delay:120ms]">
      <svg
        viewBox="0 0 400 300"
        className="mx-auto h-auto w-full max-w-md drop-shadow-[0_24px_40px_rgba(74,59,52,0.18)]"
        role="img"
        aria-label="A small isometric room with a desk, a window, a plant, and a cat sitting on a rug."
      >
        <g
          stroke="#4a3b34"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        >
          {/* Walls — left mid, right darkest */}
          <polygon points="200,90 88,146 88,76 200,20" fill="#eedcc2" />
          <polygon points="200,90 312,146 312,76 200,20" fill="#e3c9a4" />
          {/* Floor — lightest face */}
          <polygon points="200,90 312,146 200,202 88,146" fill="#dcb68d" />

          {/* Window, with a warm afternoon glow */}
          <polygon points="240,58 295,85.5 295,123.5 240,96" fill="#a8c6c3" />
          <polygon points="240,58 295,85.5 295,104.5 240,77" fill="#c9dedb" strokeWidth="1.4" />
          <line x1="267.5" y1="71.75" x2="267.5" y2="109.75" strokeWidth="1.6" />

          {/* Framed picture on the left wall */}
          <polygon points="120,72 165,49.5 165,83.5 120,106" fill="#d9a5a0" />

          {/* Rug */}
          <polygon points="200,118 256,146 200,174 144,146" fill="#ecc7c3" />

          {/* Desk: top / left / right faces. Light is fixed upper-left, so the
              contact shadow falls toward the lower-right. */}
          <ellipse cx="158" cy="166" rx="50" ry="14" fill="#4a3b34" opacity="0.13" stroke="none" />
          <polygon points="150,97 196,120 150,143 104,120" fill="#dcb68d" />
          <polygon points="104,120 150,143 150,169 104,146" fill="#c99a6b" />
          <polygon points="150,143 196,120 196,146 150,169" fill="#a67a4f" />

          {/* Plant, standing on the floor tile rather than over its front edge */}
          <ellipse cx="274" cy="148" rx="16" ry="7" fill="#4a3b34" opacity="0.13" stroke="none" />
          <polygon points="270,125 282,132 270,139 258,132" fill="#dcb68d" />
          <polygon points="258,132 270,139 270,153 258,146" fill="#c99a6b" />
          <polygon points="270,139 282,132 282,146 270,153" fill="#a67a4f" />
          <path d="M270 125 C 260 113 258 101 266 95" stroke="#7f9472" strokeWidth="3" />
          <path d="M270 125 C 278 115 283 105 279 97" stroke="#7f9472" strokeWidth="3" />
          <ellipse cx="265" cy="93" rx="9" ry="6" fill="#a7b89b" transform="rotate(-25 265 93)" />
          <ellipse cx="281" cy="95" rx="8" ry="5.5" fill="#c3d0b9" transform="rotate(20 281 95)" />

          {/* Cat — placeholder shape, replaced by the seeded generator in Phase 4 */}
          <g className="origin-[225px_168px] animate-breathe">
            <ellipse cx="225" cy="172" rx="24" ry="8" fill="#4a3b34" opacity="0.16" stroke="none" />
            <path d="M205 128 L207 108 L221 120 Z" fill="#c99a6b" />
            <path d="M245 128 L243 108 L229 120 Z" fill="#c99a6b" />
            <path
              d="M247 168 C 247 154 238 145 225 145 C 212 145 203 154 203 168 C 203 172 208 174 225 174 C 242 174 247 172 247 168 Z"
              fill="#c99a6b"
            />
            <path d="M247 166 C 258 166 262 156 258 148" stroke="#c99a6b" strokeWidth="7" />
            <circle cx="225" cy="132" r="19" fill="#dcb68d" />
            <circle cx="218" cy="131" r="2.4" fill="#4a3b34" stroke="none" />
            <circle cx="232" cy="131" r="2.4" fill="#4a3b34" stroke="none" />
            <path d="M222.5 138 Q225 140.5 227.5 138" strokeWidth="1.8" />
            <ellipse cx="225" cy="136" rx="2.6" ry="1.8" fill="#d9a5a0" strokeWidth="1.2" />
          </g>
        </g>
      </svg>
    </div>
  )
}
