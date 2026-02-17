export const TARGET_DOTS = [
  // --- 1. ZENITH (Top Cap) - 1 Photo ---
  { id: 'top_cap', pitch: 90, yaw: 0, ring: 'top' },

  // --- 2. UPPER RING (Pitch +45°) - 6 Photos ---
  { id: 'u1', pitch: 45, yaw: 0,   ring: 'upper' },
  { id: 'u2', pitch: 45, yaw: 60,  ring: 'upper' },
  { id: 'u3', pitch: 45, yaw: 120, ring: 'upper' },
  { id: 'u4', pitch: 45, yaw: 180, ring: 'upper' },
  { id: 'u5', pitch: 45, yaw: 240, ring: 'upper' },
  { id: 'u6', pitch: 45, yaw: 300, ring: 'upper' },

  // --- 3. CENTER RING (Horizon 0°) - 8 Photos ---
  { id: 'c1', pitch: 0, yaw: 0,   ring: 'center' },
  { id: 'c2', pitch: 0, yaw: 45,  ring: 'center' },
  { id: 'c3', pitch: 0, yaw: 90,  ring: 'center' },
  { id: 'c4', pitch: 0, yaw: 135, ring: 'center' },
  { id: 'c5', pitch: 0, yaw: 180, ring: 'center' },
  { id: 'c6', pitch: 0, yaw: 225, ring: 'center' },
  { id: 'c7', pitch: 0, yaw: 270, ring: 'center' },
  { id: 'c8', pitch: 0, yaw: 315, ring: 'center' },

  // --- 4. LOWER RING (Pitch -45°) - 6 Photos ---
  { id: 'l1', pitch: -45, yaw: 0,   ring: 'lower' },
  { id: 'l2', pitch: -45, yaw: 60,  ring: 'lower' },
  { id: 'l3', pitch: -45, yaw: 120, ring: 'lower' },
  { id: 'l4', pitch: -45, yaw: 180, ring: 'lower' },
  { id: 'l5', pitch: -45, yaw: 240, ring: 'lower' },
  { id: 'l6', pitch: -45, yaw: 300, ring: 'lower' },

  // --- 5. NADIR (Bottom Cap) - 1 Photo ---
  { id: 'btm_cap', pitch: -90, yaw: 0, ring: 'bottom' },
];
