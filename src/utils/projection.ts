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

  // 2. Normalise current yaw to 0..360 so multi-rotation accumulation doesn't break wrapping
  const normCurrentYaw = ((currentYawDeg % 360) + 360) % 360;
  const normTargetYaw  = ((target.yaw      % 360) + 360) % 360;

  // 3. Calculate Difference – shortest path on the circle
  let diffYaw   = normCurrentYaw - normTargetYaw;
  let diffPitch = target.pitch - currentPitchDeg;

  // Wrap yaw to (-180, 180] so the dot always takes the shortest route
  if (diffYaw >  180) diffYaw -= 360;
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
