import {Dimensions} from 'react-native';

const {width, height} = Dimensions.get('window');

// Field of View (Standard Phone Camera - approx 70-75 for modern phones)
const FOV = 70;
const PX_PER_DEG = width / FOV;

export interface SpherePoint {
  id: number;
  targetPitch: number;
  targetYaw: number;
  isCaptured: boolean;
  imagePath: string | null;
}

/**
 * GENERATE THE 22-DOT CONSTELLATION
 */
export const generateSpherePoints = (): SpherePoint[] => {
  const points: SpherePoint[] = [];
  let id = 0;

  // Helper to add points
  const add = (pitch: number, yaw: number) => {
    points.push({
      id: id++,
      targetPitch: pitch,
      targetYaw: yaw,
      isCaptured: false,
      imagePath: null,
    });
  };

  // 1. ZENITH (Top)
  add(90, 0);

  // 2. UPPER RING (+45°)
  for (let i = 0; i < 6; i++) add(45, i * 60);

  // 3. CENTER RING (0°)
  for (let i = 0; i < 8; i++) add(0, i * 45);

  // 4. LOWER RING (-45°)
  for (let i = 0; i < 6; i++) add(-45, i * 60);

  // 5. NADIR (Bottom)
  add(-90, 0);

  return points;
};

/**
 * CORE MATH: Project 3D World Angle to 2D Screen Pixel
 */
export const projectToScreen = (
  currentPitch: number,
  currentYaw: number,
  targetPitch: number,
  targetYaw: number,
) => {
  // 1. Calculate the Difference (Target - Current)
  // If Target is 0 and I look 10deg Right (+10), Diff is -10.
  // -10 mapped to pixels moves the dot Left. This is correct for AR.
  let deltaYaw = targetYaw - currentYaw;
  let deltaPitch = targetPitch - currentPitch;

  // 2. Handle 360 Wrap-around (The "Shortest Path")
  if (deltaYaw > 180) deltaYaw -= 360;
  if (deltaYaw < -180) deltaYaw += 360;

  // 3. Convert to Screen Coordinates
  // X: Center + (DegreeDiff * PixelsPerDegree)
  const x = width / 2 + deltaYaw * PX_PER_DEG;

  // Y: Center - (DegreeDiff * PixelsPerDegree)
  // Subtract because Positive Pitch (Up) means lower Y pixel value
  const y = height / 2 - deltaPitch * PX_PER_DEG;

  // 4. Visibility Check
  // We allow a wider range (FOV * 1.5) so dots don't pop out instantly at the edge
  // Using 0.8 as per requested code snippet, but keeping in mind it might need tuning
  const isVisible =
    Math.abs(deltaYaw) < FOV * 0.8 && Math.abs(deltaPitch) < FOV * 0.8;

  return {x, y, isVisible, deltaYaw, deltaPitch};
};

/**
 * TRIGGER LOGIC
 */
export const isAligned = (
  deltaYaw: number,
  deltaPitch: number,
  targetPitch: number,
) => {
  const THRESHOLD = 4; // Degrees

  // Special case for Top/Bottom (Gimbal Lock)
  // When looking straight up, Yaw swings wildly. We ignore Yaw alignment at poles.
  if (Math.abs(targetPitch) > 80) {
    return Math.abs(deltaPitch) < THRESHOLD;
  }

  return Math.abs(deltaPitch) < THRESHOLD && Math.abs(deltaYaw) < THRESHOLD;
};
