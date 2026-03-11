export interface TargetDot {
  id: string;
  pitch: number;
  yaw: number;
  ring: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE: 27-DOT LAYOUT  (3 rings × 9 dots — all aligned yaw)
// Coordinate System: Pitch 90° = Horizon, 180° = Zenith, 0° = Nadir
//
// All three rings share identical yaw positions: 0, 40, 80 … 320°
// → Every vertical column of 3 images has the SAME horizontal seams.
// → 360° / 9 = 40° spacing — 5° tighter than the 8-dot layout.
//
//   UPPER ring  — pitch 135° (+45° above horizon)  — 9 shots every 40°
//   CENTER ring — pitch 90°  (horizon)             — 9 shots every 40°
//   LOWER ring  — pitch 45°  (-45° below horizon)  — 9 shots every 40°
//
// FOV: FOV_H=45° (alignment), stitcher uses 60° → gives 20° horizontal overlap per seam
// Vertical: 3 rings × 45° spacing with FOV_V=60° → 15° overlap between rings
// ─────────────────────────────────────────────────────────────────────────────

const NUM_COLS = 9;
const YAW_STEP = 360 / NUM_COLS; // 40°
const YAWS = Array.from({length: NUM_COLS}, (_, i) => i * YAW_STEP);
// [0, 40, 80, 120, 160, 200, 240, 280, 320]

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

// Total: 9 + 9 + 9 = 27 photos
// All rings share yaw: 0°, 40°, 80°, 120°, 160°, 200°, 240°, 280°, 320°
// Horizontal spacing: 40° (vs 45° for 8-dot layout → more overlap, smoother stitching)
// Vertical coverage: pitch 45° … 135° (±45° from horizon, FOV_V=60° bridges the gaps)
