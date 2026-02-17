// 32-DOT COMPLETE SPHERE COVERAGE
// 7 Rings with 30° vertical spacing for seamless coverage
// Coordinate System: Pitch 90° = Horizon (phone upright)

export interface TargetDot {
  id: string;
  pitch: number;
  yaw: number;
  ring: string;
}

export const TARGET_DOTS: TargetDot[] = [
  // --- 1. ZENITH (Top Cap, 90° above horizon) - 1 Photo ---
  { id: 'top', pitch: 180, yaw: 0, ring: 'zenith' },

  // --- 2. RING +60° (Upper Sky) - 5 Photos, every 72° ---
  { id: 'u60_1', pitch: 150, yaw: 0,   ring: 'upper60' },
  { id: 'u60_2', pitch: 150, yaw: 72,  ring: 'upper60' },
  { id: 'u60_3', pitch: 150, yaw: 144, ring: 'upper60' },
  { id: 'u60_4', pitch: 150, yaw: 216, ring: 'upper60' },
  { id: 'u60_5', pitch: 150, yaw: 288, ring: 'upper60' },

  // --- 3. RING +30° (Sky) - 6 Photos, every 60° ---
  { id: 'u30_1', pitch: 120, yaw: 0,   ring: 'upper30' },
  { id: 'u30_2', pitch: 120, yaw: 60,  ring: 'upper30' },
  { id: 'u30_3', pitch: 120, yaw: 120, ring: 'upper30' },
  { id: 'u30_4', pitch: 120, yaw: 180, ring: 'upper30' },
  { id: 'u30_5', pitch: 120, yaw: 240, ring: 'upper30' },
  { id: 'u30_6', pitch: 120, yaw: 300, ring: 'upper30' },

  // --- 4. CENTER RING (Horizon 0°) - 8 Photos, every 45° ---
  { id: 'c1', pitch: 90, yaw: 0,   ring: 'center' },
  { id: 'c2', pitch: 90, yaw: 45,  ring: 'center' },
  { id: 'c3', pitch: 90, yaw: 90,  ring: 'center' },
  { id: 'c4', pitch: 90, yaw: 135, ring: 'center' },
  { id: 'c5', pitch: 90, yaw: 180, ring: 'center' },
  { id: 'c6', pitch: 90, yaw: 225, ring: 'center' },
  { id: 'c7', pitch: 90, yaw: 270, ring: 'center' },
  { id: 'c8', pitch: 90, yaw: 315, ring: 'center' },

  // --- 5. RING -30° (Ground) - 6 Photos, every 60° ---
  { id: 'l30_1', pitch: 60, yaw: 0,   ring: 'lower30' },
  { id: 'l30_2', pitch: 60, yaw: 60,  ring: 'lower30' },
  { id: 'l30_3', pitch: 60, yaw: 120, ring: 'lower30' },
  { id: 'l30_4', pitch: 60, yaw: 180, ring: 'lower30' },
  { id: 'l30_5', pitch: 60, yaw: 240, ring: 'lower30' },
  { id: 'l30_6', pitch: 60, yaw: 300, ring: 'lower30' },

  // --- 6. RING -60° (Lower Ground) - 5 Photos, every 72° ---
  { id: 'l60_1', pitch: 30, yaw: 0,   ring: 'lower60' },
  { id: 'l60_2', pitch: 30, yaw: 72,  ring: 'lower60' },
  { id: 'l60_3', pitch: 30, yaw: 144, ring: 'lower60' },
  { id: 'l60_4', pitch: 30, yaw: 216, ring: 'lower60' },
  { id: 'l60_5', pitch: 30, yaw: 288, ring: 'lower60' },

  // --- 7. NADIR (Bottom Cap, 90° below horizon) - 1 Photo ---
  { id: 'bottom', pitch: 0, yaw: 0, ring: 'nadir' },
];

// Total: 1 + 5 + 6 + 8 + 6 + 5 + 1 = 32 photos
// Vertical spacing: 30° between each ring
// Horizontal spacing: 45-72° depending on ring
// Overlap: 50% vertical, 25-44% horizontal
