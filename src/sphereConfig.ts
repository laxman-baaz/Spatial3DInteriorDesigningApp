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
// export const TARGET_DOTS: TargetDot[] = [
//   // --- 1. ZENITH (straight up) - 1 Photo ---
//   { id: 'top', pitch: 180, yaw: 0, ring: 'zenith' },

//   // --- 2. UPPER RING (+45° above horizon) - 6 Photos, every 60° ---
//   { id: 'u1', pitch: 135, yaw: 0,   ring: 'upper' },
//   { id: 'u2', pitch: 135, yaw: 60,  ring: 'upper' },
//   { id: 'u3', pitch: 135, yaw: 120, ring: 'upper' },
//   { id: 'u4', pitch: 135, yaw: 180, ring: 'upper' },
//   { id: 'u5', pitch: 135, yaw: 240, ring: 'upper' },
//   { id: 'u6', pitch: 135, yaw: 300, ring: 'upper' },

//   // --- 3. CENTER RING (Horizon) - 8 Photos, every 45° ---
//   { id: 'c1', pitch: 90, yaw: 0,   ring: 'center' },
//   { id: 'c2', pitch: 90, yaw: 45,  ring: 'center' },
//   { id: 'c3', pitch: 90, yaw: 90,  ring: 'center' },
//   { id: 'c4', pitch: 90, yaw: 135, ring: 'center' },
//   { id: 'c5', pitch: 90, yaw: 180, ring: 'center' },
//   { id: 'c6', pitch: 90, yaw: 225, ring: 'center' },
//   { id: 'c7', pitch: 90, yaw: 270, ring: 'center' },
//   { id: 'c8', pitch: 90, yaw: 315, ring: 'center' },

//   // --- 4. LOWER RING (-45° below horizon) - 6 Photos, every 60° ---
//   { id: 'l1', pitch: 45, yaw: 0,   ring: 'lower' },
//   { id: 'l2', pitch: 45, yaw: 60,  ring: 'lower' },
//   { id: 'l3', pitch: 45, yaw: 120, ring: 'lower' },
//   { id: 'l4', pitch: 45, yaw: 180, ring: 'lower' },
//   { id: 'l5', pitch: 45, yaw: 240, ring: 'lower' },
//   { id: 'l6', pitch: 45, yaw: 300, ring: 'lower' },

//   // --- 5. NADIR (straight down) - 1 Photo ---
//   { id: 'bottom', pitch: 0, yaw: 0, ring: 'nadir' },
// ];

// Total: 1 + 6 + 8 + 6 + 1 = 22 photos
// Vertical spacing: 45° between each ring
// Horizontal spacing: 45° (center) / 60° (upper & lower)

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTED OUT: 32-DOT LAYOUT  (7 rings, 30° vertical spacing)
// Uncomment TARGET_DOTS below and comment the 22-dot array above to switch.
// 1 zenith + 5 upper60 + 6 upper30 + 8 center + 6 lower30 + 5 lower60 + 1 nadir = 32
// ─────────────────────────────────────────────────────────────────────────────

export const TARGET_DOTS: TargetDot[] = [
  // --- ZENITH (Pitch 180°) - 1 Photo ---
  {id: 'top', pitch: 180, yaw: 0, ring: 'zenith'},

  // --- UPPER RING (Pitch 130°, Elev +40°) - 9 Photos, every 40° ---
  {id: 'u1', pitch: 130, yaw: 0, ring: 'upper40'},
  {id: 'u2', pitch: 130, yaw: 40, ring: 'upper40'},
  {id: 'u3', pitch: 130, yaw: 80, ring: 'upper40'},
  {id: 'u4', pitch: 130, yaw: 120, ring: 'upper40'},
  {id: 'u5', pitch: 130, yaw: 160, ring: 'upper40'},
  {id: 'u6', pitch: 130, yaw: 200, ring: 'upper40'},
  {id: 'u7', pitch: 130, yaw: 240, ring: 'upper40'},
  {id: 'u8', pitch: 130, yaw: 280, ring: 'upper40'},
  {id: 'u9', pitch: 130, yaw: 320, ring: 'upper40'},

  // --- CENTER EQUATOR (Pitch 90°, Elev 0°) - 12 Photos, every 30° ---
  {id: 'c1', pitch: 90, yaw: 0, ring: 'center'},
  {id: 'c2', pitch: 90, yaw: 30, ring: 'center'},
  {id: 'c3', pitch: 90, yaw: 60, ring: 'center'},
  {id: 'c4', pitch: 90, yaw: 90, ring: 'center'},
  {id: 'c5', pitch: 90, yaw: 120, ring: 'center'},
  {id: 'c6', pitch: 90, yaw: 150, ring: 'center'},
  {id: 'c7', pitch: 90, yaw: 180, ring: 'center'},
  {id: 'c8', pitch: 90, yaw: 210, ring: 'center'},
  {id: 'c9', pitch: 90, yaw: 240, ring: 'center'},
  {id: 'c10', pitch: 90, yaw: 270, ring: 'center'},
  {id: 'c11', pitch: 90, yaw: 300, ring: 'center'},
  {id: 'c12', pitch: 90, yaw: 330, ring: 'center'},

  // --- LOWER RING (Pitch 50°, Elev -40°) - 9 Photos, every 40° ---
  {id: 'l1', pitch: 50, yaw: 0, ring: 'lower40'},
  {id: 'l2', pitch: 50, yaw: 40, ring: 'lower40'},
  {id: 'l3', pitch: 50, yaw: 80, ring: 'lower40'},
  {id: 'l4', pitch: 50, yaw: 120, ring: 'lower40'},
  {id: 'l5', pitch: 50, yaw: 160, ring: 'lower40'},
  {id: 'l6', pitch: 50, yaw: 200, ring: 'lower40'},
  {id: 'l7', pitch: 50, yaw: 240, ring: 'lower40'},
  {id: 'l8', pitch: 50, yaw: 280, ring: 'lower40'},
  {id: 'l9', pitch: 50, yaw: 320, ring: 'lower40'},

  // --- NADIR (Pitch 0°) - 1 Photo ---
  {id: 'bottom', pitch: 0, yaw: 0, ring: 'nadir'},
];
// Total: 1 + 9 + 12 + 9 + 1 = 32 photos
// Optimized for Portrait orientation (45° H, 60° V)
// Vertical overlapping ~20° to 30°, Horizontal overlapping at least 15°
