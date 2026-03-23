export interface TargetDot {
  id: string;
  pitch: number;
  yaw: number;
  ring: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE: 24-DOT LAYOUT  (3 rings × 8 dots — all aligned yaw)
// Coordinate System: Pitch 90° = Horizon, 180° = Zenith, 0° = Nadir
//
// All three rings share identical yaw positions: 0, 45, 90 … 315°
// → Every vertical column of 3 images has the SAME horizontal seams.
// → 360° / 8 = 45° spacing per dot.
//
//   UPPER ring  — pitch 135° (+45° above horizon)  — 8 shots every 45°
//   CENTER ring — pitch 90°  (horizon)              — 8 shots every 45°
//   LOWER ring  — pitch 45°  (-45° below horizon)   — 8 shots every 45°
//
// FOV: FOV_H=60° (alignment) → horizontal overlap per column seam
// Vertical: 3 rings × 45° spacing with FOV_V=75° → overlap between rings for column stitch
// ─────────────────────────────────────────────────────────────────────────────

const NUM_COLS = 8;
const YAW_STEP = 360 / NUM_COLS; // 45°
const YAWS = Array.from({length: NUM_COLS}, (_, i) => i * YAW_STEP);
// [0, 45, 90, 135, 180, 225, 270, 315]

export const TARGET_DOTS: TargetDot[] = [
  // --- UPPER RING (Pitch 135°, +45° above horizon) ---
  ...YAWS.map((yaw, i) => ({
    id: `u${i + 1}`,
    pitch: 135,
    yaw,
    ring: 'upper',
  })),

  // --- CENTER RING (Pitch 90°, horizon) ---
  ...YAWS.map((yaw, i) => ({
    id: `c${i + 1}`,
    pitch: 90,
    yaw,
    ring: 'center',
  })),

  // --- LOWER RING (Pitch 45°, -45° below horizon) ---
  ...YAWS.map((yaw, i) => ({
    id: `l${i + 1}`,
    pitch: 45,
    yaw,
    ring: 'lower',
  })),
];

// Total: 8 + 8 + 8 = 24 photos
// All rings share yaw: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
// Horizontal spacing: 45°
// Vertical coverage: pitch 45° … 135° (±45° from horizon, FOV_V=75° bridges the gaps)
