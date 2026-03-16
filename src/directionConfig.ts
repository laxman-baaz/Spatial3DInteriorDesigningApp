/**
 * 6 dots per direction for North, East, South, West capture.
 * Each direction covers ~90° sector. Dots are arranged in 2 rows × 3 columns
 * (upper + lower ring) within that sector for good overlap.
 */
export type Direction = 'north' | 'east' | 'south' | 'west';

export interface DirectionDot {
  id: string;
  pitch: number;
  yaw: number;
  ring: string;
}

// Yaw center per direction (degrees)
const DIRECTION_YAW: Record<Direction, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

// 6 dots per direction: 3 upper (pitch 120°), 3 lower (pitch 60°)
// Yaw spread: center ± 25° to stay within ~90° sector
function dotsForDirection(dir: Direction): DirectionDot[] {
  const centerYaw = DIRECTION_YAW[dir];
  const yawOffsets = [-25, 0, 25]; // 3 yaws: left, center, right
  const dots: DirectionDot[] = [];
  let i = 0;
  for (const pitch of [120, 60]) {
    for (const offset of yawOffsets) {
      const yaw = (centerYaw + offset + 360) % 360;
      dots.push({
        id: `${dir}_${i}`,
        pitch,
        yaw,
        ring: pitch > 90 ? 'upper' : 'lower',
      });
      i++;
    }
  }
  return dots;
}

export const DIRECTION_DOTS: Record<Direction, DirectionDot[]> = {
  north: dotsForDirection('north'),
  east: dotsForDirection('east'),
  south: dotsForDirection('south'),
  west: dotsForDirection('west'),
};

/** User-facing labels: capture in order (1→2→3→4, turn right each time) */
export const DIRECTION_LABELS: Record<Direction, string> = {
  north: 'Wall 1',
  east: 'Wall 2',
  south: 'Wall 3',
  west: 'Wall 4',
};

/** Adjacent pairs: North-East, East-South, South-West, West-North */
export const ADJACENT_PAIRS: [Direction, Direction][] = [
  ['north', 'east'],
  ['east', 'south'],
  ['south', 'west'],
  ['west', 'north'],
];

export function areAdjacent(a: Direction, b: Direction): boolean {
  return ADJACENT_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

export function canGenerateFinal(
  cards: Record<Direction, {imageUri?: string}>,
): boolean {
  const completed = (Object.keys(cards) as Direction[]).filter(
    d => cards[d]?.imageUri,
  );
  if (completed.length >= 4) return true;
  if (completed.length >= 2) {
    return completed.some((a, i) =>
      completed.slice(i + 1).some(b => areAdjacent(a, b)),
    );
  }
  return false;
}
