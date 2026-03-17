/** Convert sensor radians to stitcher degrees. App: pitch 0=nadir, 90=horizon, 180=zenith; yaw 0..360 */
export function orientationToDegrees(
  pitchRad: number,
  yawRad: number,
  rollRad: number,
) {
  const pitchDeg = (pitchRad * 180) / Math.PI;
  const yawDeg = ((yawRad * 180) / Math.PI + 360) % 360;
  const rollDeg = (rollRad * 180) / Math.PI;
  return {pitchDeg, yawDeg, rollDeg};
}
