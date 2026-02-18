export interface TargetDot {
  id: string;
  pitch: number;
  yaw: number;
  ring: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE: 22-DOT LAYOUT  (5 rings, 45° vertical spacing)
// Coordinate System: Pitch 90° = Horizon (phone upright in portrait mode)
// 1 zenith + 6 upper (135°) + 8 center (90°) + 6 lower (45°) + 1 nadir = 22
// ─────────────────────────────────────────────────────────────────────────────
export const TARGET_DOTS: TargetDot[] = [
  // --- 1. ZENITH (straight up) - 1 Photo ---
  { id: 'top', pitch: 180, yaw: 0, ring: 'zenith' },

  // --- 2. UPPER RING (+45° above horizon) - 6 Photos, every 60° ---
  { id: 'u1', pitch: 135, yaw: 0,   ring: 'upper' },
  { id: 'u2', pitch: 135, yaw: 60,  ring: 'upper' },
  { id: 'u3', pitch: 135, yaw: 120, ring: 'upper' },
  { id: 'u4', pitch: 135, yaw: 180, ring: 'upper' },
  { id: 'u5', pitch: 135, yaw: 240, ring: 'upper' },
  { id: 'u6', pitch: 135, yaw: 300, ring: 'upper' },

  // --- 3. CENTER RING (Horizon) - 8 Photos, every 45° ---
  { id: 'c1', pitch: 90, yaw: 0,   ring: 'center' },
  { id: 'c2', pitch: 90, yaw: 45,  ring: 'center' },
  { id: 'c3', pitch: 90, yaw: 90,  ring: 'center' },
  { id: 'c4', pitch: 90, yaw: 135, ring: 'center' },
  { id: 'c5', pitch: 90, yaw: 180, ring: 'center' },
  { id: 'c6', pitch: 90, yaw: 225, ring: 'center' },
  { id: 'c7', pitch: 90, yaw: 270, ring: 'center' },
  { id: 'c8', pitch: 90, yaw: 315, ring: 'center' },

  // --- 4. LOWER RING (-45° below horizon) - 6 Photos, every 60° ---
  { id: 'l1', pitch: 45, yaw: 0,   ring: 'lower' },
  { id: 'l2', pitch: 45, yaw: 60,  ring: 'lower' },
  { id: 'l3', pitch: 45, yaw: 120, ring: 'lower' },
  { id: 'l4', pitch: 45, yaw: 180, ring: 'lower' },
  { id: 'l5', pitch: 45, yaw: 240, ring: 'lower' },
  { id: 'l6', pitch: 45, yaw: 300, ring: 'lower' },

  // --- 5. NADIR (straight down) - 1 Photo ---
  { id: 'bottom', pitch: 0, yaw: 0, ring: 'nadir' },
];

// Total: 1 + 6 + 8 + 6 + 1 = 22 photos
// Vertical spacing: 45° between each ring
// Horizontal spacing: 45° (center) / 60° (upper & lower)

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTED OUT: 32-DOT LAYOUT  (7 rings, 30° vertical spacing)
// Uncomment TARGET_DOTS below and comment the 22-dot array above to switch.
// 1 zenith + 5 upper60 + 6 upper30 + 8 center + 6 lower30 + 5 lower60 + 1 nadir = 32
// ─────────────────────────────────────────────────────────────────────────────
/*
export const TARGET_DOTS: TargetDot[] = [
  { id: 'top',    pitch: 180, yaw: 0,   ring: 'zenith'  },

  { id: 'u60_1', pitch: 150, yaw: 0,   ring: 'upper60' },
  { id: 'u60_2', pitch: 150, yaw: 72,  ring: 'upper60' },
  { id: 'u60_3', pitch: 150, yaw: 144, ring: 'upper60' },
  { id: 'u60_4', pitch: 150, yaw: 216, ring: 'upper60' },
  { id: 'u60_5', pitch: 150, yaw: 288, ring: 'upper60' },

  { id: 'u30_1', pitch: 120, yaw: 0,   ring: 'upper30' },
  { id: 'u30_2', pitch: 120, yaw: 60,  ring: 'upper30' },
  { id: 'u30_3', pitch: 120, yaw: 120, ring: 'upper30' },
  { id: 'u30_4', pitch: 120, yaw: 180, ring: 'upper30' },
  { id: 'u30_5', pitch: 120, yaw: 240, ring: 'upper30' },
  { id: 'u30_6', pitch: 120, yaw: 300, ring: 'upper30' },

  { id: 'c1', pitch: 90, yaw: 0,   ring: 'center' },
  { id: 'c2', pitch: 90, yaw: 45,  ring: 'center' },
  { id: 'c3', pitch: 90, yaw: 90,  ring: 'center' },
  { id: 'c4', pitch: 90, yaw: 135, ring: 'center' },
  { id: 'c5', pitch: 90, yaw: 180, ring: 'center' },
  { id: 'c6', pitch: 90, yaw: 225, ring: 'center' },
  { id: 'c7', pitch: 90, yaw: 270, ring: 'center' },
  { id: 'c8', pitch: 90, yaw: 315, ring: 'center' },

  { id: 'l30_1', pitch: 60, yaw: 0,   ring: 'lower30' },
  { id: 'l30_2', pitch: 60, yaw: 60,  ring: 'lower30' },
  { id: 'l30_3', pitch: 60, yaw: 120, ring: 'lower30' },
  { id: 'l30_4', pitch: 60, yaw: 180, ring: 'lower30' },
  { id: 'l30_5', pitch: 60, yaw: 240, ring: 'lower30' },
  { id: 'l30_6', pitch: 60, yaw: 300, ring: 'lower30' },

  { id: 'l60_1', pitch: 30, yaw: 0,   ring: 'lower60' },
  { id: 'l60_2', pitch: 30, yaw: 72,  ring: 'lower60' },
  { id: 'l60_3', pitch: 30, yaw: 144, ring: 'lower60' },
  { id: 'l60_4', pitch: 30, yaw: 216, ring: 'lower60' },
  { id: 'l60_5', pitch: 30, yaw: 288, ring: 'lower60' },

  { id: 'bottom', pitch: 0, yaw: 0, ring: 'nadir' },
];
// Total: 1 + 5 + 6 + 8 + 6 + 5 + 1 = 32 photos
// Vertical spacing: 30° between each ring
// Overlap: ~50% vertical, 25-44% horizontal
*/
