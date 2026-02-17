import { Dimensions } from 'react-native';

interface Point3D {
  pitch: number; // In DEGREES
  yaw: number;   // In DEGREES
}

interface SensorData {
  pitch: number; // In RADIANS
  yaw: number;   // In RADIANS
}

interface ProjectionParams {
  width: number;
  height: number;
  fovH: number;
  fovV: number;
}

export const project3DTo2D = (
  target: Point3D,
  current: SensorData,
  params: ProjectionParams
) => {
  const { width, height, fovH, fovV } = params;

  // 1. Convert Sensor Radians to Degrees
  const currentPitchDeg = current.pitch * (180 / Math.PI);
  const currentYawDeg = current.yaw * (180 / Math.PI);

  // 2. Calculate Difference
  let diffYaw = target.yaw - currentYawDeg;
  let diffPitch = target.pitch - currentPitchDeg;

  // 3. Handle Wrap-Around (Shortest Path)
  // e.g. If target is 350° and current is 10°, diff is 340° (Wrong). Should be -20°.
  if (diffYaw > 180) diffYaw -= 360;
  if (diffYaw < -180) diffYaw += 360;

  // 4. Check Visibility (Is it inside the camera view?)
  // We check if it fits within the Field of View
  const isVisible = 
    Math.abs(diffYaw) < (fovH / 1.5) && 
    Math.abs(diffPitch) < (fovV / 1.5);

  // 5. Project to Screen Coordinates
  // Note: -diffPitch because pitch up is usually negative Y in screen coords
  const x = (width / 2) + (diffYaw * (width / fovH));
  const y = (height / 2) - (diffPitch * (height / fovV));

  return { x, y, isVisible };
};
