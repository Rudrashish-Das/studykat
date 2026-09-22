import {
  canPlace,
  clampToGrid,
  depthOf,
  depthSort,
  diamondPoints,
  footprintCells,
  footprintFits,
  isInsideGrid,
  ORIGIN_X,
  ORIGIN_Y,
  placementsOverlap,
  rotatedFootprint,
  TILE_H,
  TILE_W,
  tileDiamond,
  toGrid,
  toScreen,
  wallSpotOf,
  type Drawable,
  type Placement,
} from './projection'

describe('projection', () => {
  it('puts the origin tile at the top of the diamond', () => {
    expect(toScreen(0, 0)).toEqual({ x: ORIGIN_X, y: ORIGIN_Y })
  })

  it('moves right and down along +x', () => {
    expect(toScreen(1, 0)).toEqual({ x: ORIGIN_X + TILE_W / 2, y: ORIGIN_Y + TILE_H / 2 })
  })

  it('moves left and down along +y', () => {
    expect(toScreen(0, 1)).toEqual({ x: ORIGIN_X - TILE_W / 2, y: ORIGIN_Y + TILE_H / 2 })
  })

  it('keeps the 2:1 ratio — one step diagonally is a whole tile down', () => {
    expect(toScreen(1, 1)).toEqual({ x: ORIGIN_X, y: ORIGIN_Y + TILE_H })
    expect(TILE_W / TILE_H).toBe(2)
  })

  it('round-trips through toGrid for every cell in the room', () => {
    for (let gx = 0; gx < 10; gx += 1) {
      for (let gy = 0; gy < 10; gy += 1) {
        // Aim at the centre of the tile, which is half a tile below its top
        // corner.
        const screen = toScreen(gx, gy)
        expect(toGrid(screen.x, screen.y + TILE_H / 2)).toEqual({ gx, gy })
      }
    }
  })

  it('maps a point just inside a tile edge to that tile, not its neighbour', () => {
    const centre = toScreen(3, 4)
    expect(toGrid(centre.x, centre.y + 1)).toEqual({ gx: 3, gy: 4 })
    expect(toGrid(centre.x, centre.y + TILE_H - 1)).toEqual({ gx: 3, gy: 4 })
  })

  it('draws a tile as a diamond twice as wide as it is tall', () => {
    const [top, right, bottom, left] = tileDiamond(0, 0)
    expect(right!.x - left!.x).toBe(TILE_W)
    expect(bottom!.y - top!.y).toBe(TILE_H)
    // The side corners sit exactly halfway down.
    expect(right!.y).toBe(top!.y + TILE_H / 2)
  })

  it('emits SVG polygon points', () => {
    expect(diamondPoints(0, 0).split(' ')).toHaveLength(4)
  })
})

describe('grid bounds', () => {
  it('knows what is inside', () => {
    expect(isInsideGrid(0, 0)).toBe(true)
    expect(isInsideGrid(9, 9)).toBe(true)
    expect(isInsideGrid(10, 0)).toBe(false)
    expect(isInsideGrid(-1, 5)).toBe(false)
  })

  it('clamps out-of-range coordinates back onto the floor', () => {
    expect(clampToGrid(-4, 22)).toEqual({ gx: 0, gy: 9 })
    expect(clampToGrid(3.4, 6.6)).toEqual({ gx: 3, gy: 7 })
  })
})

describe('footprints and rotation', () => {
  it('swaps width and height on the odd rotations', () => {
    expect(rotatedFootprint(2, 1, 0)).toEqual({ w: 2, h: 1 })
    expect(rotatedFootprint(2, 1, 1)).toEqual({ w: 1, h: 2 })
    expect(rotatedFootprint(2, 1, 2)).toEqual({ w: 2, h: 1 })
    expect(rotatedFootprint(2, 1, 3)).toEqual({ w: 1, h: 2 })
  })

  it('lists every occupied cell', () => {
    expect(footprintCells(1, 1, 2, 2)).toEqual([
      { gx: 1, gy: 1 },
      { gx: 1, gy: 2 },
      { gx: 2, gy: 1 },
      { gx: 2, gy: 2 },
    ])
  })

  it('rotates the occupied cells too', () => {
    expect(footprintCells(0, 0, 2, 1, 1)).toEqual([
      { gx: 0, gy: 0 },
      { gx: 0, gy: 1 },
    ])
  })

  it('refuses a footprint that hangs off the edge', () => {
    // (8,8) with a 2x2 reaches (9,9), the last cell — that fits.
    expect(footprintFits(8, 8, 2, 2)).toBe(true)
    // (9,9) with a 2x2 would reach (10,10), which does not exist.
    expect(footprintFits(9, 9, 2, 2)).toBe(false)
    expect(footprintFits(9, 9, 1, 1)).toBe(true)
    // Rotating can push an item off the edge that fitted before.
    expect(footprintFits(9, 8, 1, 2, 0)).toBe(true)
    expect(footprintFits(9, 8, 1, 2, 1)).toBe(false)
  })
})

describe('collision', () => {
  const place = (id: string, gx: number, gy: number, w = 1, h = 1, rotation = 0): Placement => ({
    id,
    gx,
    gy,
    w,
    h,
    rotation,
  })

  it('detects overlapping footprints', () => {
    expect(placementsOverlap(place('a', 0, 0, 2, 2), place('b', 1, 1))).toBe(true)
  })

  it('lets neighbours touch without overlapping', () => {
    expect(placementsOverlap(place('a', 0, 0, 2, 2), place('b', 2, 0))).toBe(false)
    expect(placementsOverlap(place('a', 0, 0, 2, 2), place('b', 0, 2))).toBe(false)
  })

  it('accounts for rotation on both sides', () => {
    // A 2x1 at (0,0) rotated covers (0,0) and (0,1).
    expect(placementsOverlap(place('a', 0, 0, 2, 1, 1), place('b', 0, 1))).toBe(true)
    expect(placementsOverlap(place('a', 0, 0, 2, 1, 0), place('b', 0, 1))).toBe(false)
  })

  it('blocks a placement that collides with existing furniture', () => {
    const existing = [place('desk', 3, 3, 2, 1)]
    expect(canPlace(place('lamp', 3, 3), existing)).toBe(false)
    expect(canPlace(place('lamp', 5, 3), existing)).toBe(true)
  })

  it('lets a dragged item pass over its own cells', () => {
    const existing = [place('desk', 3, 3, 2, 1)]
    expect(canPlace(place('desk', 3, 3, 2, 1), existing)).toBe(false)
    expect(canPlace(place('desk', 3, 3, 2, 1), existing, { ignoreId: 'desk' })).toBe(true)
  })

  it('blocks a placement that leaves the room even when nothing is there', () => {
    expect(canPlace(place('rug', 9, 9, 2, 2), [])).toBe(false)
  })
})

describe('depth sorting', () => {
  const d = (id: string, gx: number, gy: number, layer = 2, zIndex = 0): Drawable => ({
    id,
    gx,
    gy,
    layer,
    zIndex,
  })

  it('draws far tiles before near ones', () => {
    const sorted = depthSort([d('near', 5, 5), d('far', 0, 0), d('mid', 2, 2)])
    expect(sorted.map((x) => x.id)).toEqual(['far', 'mid', 'near'])
  })

  it('treats gx + gy as one depth, so (3,1) and (1,3) tie', () => {
    const sorted = depthSort([d('b', 1, 3), d('a', 3, 1)])
    // Tied on depth and layer, so the stable id tiebreak decides.
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('puts the rug under the furniture on the same tile', () => {
    const sorted = depthSort([d('chair', 4, 4, 2), d('rug', 4, 4, 1)])
    expect(sorted.map((x) => x.id)).toEqual(['rug', 'chair'])
  })

  it('breaks a layer tie on z-index', () => {
    const sorted = depthSort([d('top', 4, 4, 2, 5), d('bottom', 4, 4, 2, 1)])
    expect(sorted.map((x) => x.id)).toEqual(['bottom', 'top'])
  })

  it('is stable, so nothing flickers between renders', () => {
    const items = [d('c', 2, 2), d('a', 2, 2), d('b', 2, 2)]
    expect(depthSort(items).map((x) => x.id)).toEqual(depthSort(items).map((x) => x.id))
    expect(depthSort(items).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate its input', () => {
    const items = [d('c', 5, 5), d('a', 0, 0)]
    const before = items.map((x) => x.id)
    depthSort(items)
    expect(items.map((x) => x.id)).toEqual(before)
  })

  it('sorts the cat correctly against furniture as it walks past', () => {
    const bookcase = d('bookcase', 4, 4)
    // Behind the bookcase.
    expect(depthSort([d('cat', 2, 3), bookcase]).map((x) => x.id)).toEqual(['cat', 'bookcase'])
    // In front of it.
    expect(depthSort([d('cat', 6, 5), bookcase]).map((x) => x.id)).toEqual(['bookcase', 'cat'])
  })

  it('paints wall-mounted things before anything on the floor', () => {
    // A poster further along the wall than a chair is still behind it.
    const sorted = depthSort([d('chair', 1, 0), d('poster', 6, 0, 3)])
    expect(sorted.map((x) => x.id)).toEqual(['poster', 'chair'])
  })
})

describe('wallSpotOf', () => {
  it('keeps a wall tile where it is', () => {
    expect(wallSpotOf(4, 0)).toEqual({ side: 'right', index: 4, gx: 4, gy: 0 })
    expect(wallSpotOf(0, 6)).toEqual({ side: 'left', index: 6, gx: 0, gy: 6 })
  })

  it('gives the back corner to the right-hand wall', () => {
    expect(wallSpotOf(0, 0).side).toBe('right')
  })

  it('snaps a tile out on the floor to the nearer wall, so nothing hangs in mid-air', () => {
    expect(wallSpotOf(7, 2)).toEqual({ side: 'right', index: 7, gx: 7, gy: 0 })
    expect(wallSpotOf(2, 7)).toEqual({ side: 'left', index: 7, gx: 0, gy: 7 })
  })
})

describe('depthOf', () => {
  it('sorts a multi-tile item by its nearest corner', () => {
    expect(depthOf(2, 2, 1, 1)).toBe(4)
    // A 2x2 at (2,2) reaches (3,3).
    expect(depthOf(2, 2, 2, 2)).toBe(6)
  })

  it('accounts for rotation', () => {
    expect(depthOf(0, 0, 3, 1, 0)).toBe(2)
    expect(depthOf(0, 0, 3, 1, 1)).toBe(2)
  })
})
