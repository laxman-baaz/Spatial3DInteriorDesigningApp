import {useState, useEffect, useRef} from 'react';
import {
  accelerometer,
  gyroscope,
  setUpdateIntervalForType,
  SensorTypes,
} from 'react-native-sensors';

// Sensitivity for complementary filter
const ALPHA = 0.98;

export interface Orientation {
  pitch: number;
  roll: number;
  yaw: number;
}

export const useDeviceOrientation = () => {
  const [orientation, setOrientation] = useState<Orientation>({
    pitch: 0,
    roll: 0,
    yaw: 0,
  });
  const currentOrientation: {current: Orientation} = useRef<Orientation>({
    pitch: 0,
    roll: 0,
    yaw: 0,
  });
  // Refs for sensor fusion
  const lastAccel = useRef({pitch: 0, roll: 0});
  const lastTimestamp = useRef<number>(0);

  useEffect(() => {
    setUpdateIntervalForType(SensorTypes.accelerometer, 20); // 50Hz
    setUpdateIntervalForType(SensorTypes.gyroscope, 20);

    const subscriptionAccel = accelerometer.subscribe(({x, y, z}) => {
      // Accelerometer logic (Absolute Pitch/Roll)
      // Assuming Portrait Mode:
      // X = Horizontal/Right, Y = Vertical/Up, Z = Depth/Out

      // Pitch: Rotation around X-axis.
      // Flat on table (Z=9.8, Y=0) -> Pitch = 0?
      // Upright (Y=9.8, Z=0) -> Pitch = PI/2 (90 deg).
      const p = Math.atan2(y, z);

      // Roll: Rotation around Y-axis.
      const r = Math.atan2(-x, Math.sqrt(y * y + z * z));

      lastAccel.current = {pitch: p, roll: r};
    });

    const subscriptionGyro = gyroscope.subscribe(({x, y, z, timestamp}) => {
      if (lastTimestamp.current === 0) {
        lastTimestamp.current = timestamp;
        return;
      }

      const dt = (timestamp - lastTimestamp.current) / 1000;
      lastTimestamp.current = timestamp;

      // Android Sensor Coordinates (Portrait Mode Default):
      // X: Horizontal (Right)
      // Y: Vertical (Up)
      // Z: Depth (Out of screen)

      // Pitch: Rotation around X-axis (Looking Up/Down). Correctly uses gyro 'x'.
      // Roll: Rotation around Z-axis (Tilting Left/Right). Should use gyro 'z'.
      // Yaw: Rotation around Y-axis (Turning Left/Right). Should use gyro 'y'.

      const current = currentOrientation.current;

      // Pitch Fusion (Around X)
      const gyroPitchStep = current.pitch + x * dt;
      const fusedPitch =
        ALPHA * gyroPitchStep + (1 - ALPHA) * lastAccel.current.pitch;

      // Roll Fusion (Around Z mechanism - Tilt)
      // Previously using 'y' (which is Yaw rate). Switching to 'z' (Roll rate).
      const gyroRollStep = current.roll + z * dt;
      const fusedRoll =
        ALPHA * gyroRollStep + (1 - ALPHA) * lastAccel.current.roll;

      // Yaw Fusion (Around Y mechanism - Panorama)
      // Previously using 'z' (which is Roll rate). Switching to 'y' (Yaw rate).
      // +Y is CCW (Left Turn).
      // We'll accumulate this.
      const fusedYaw = current.yaw + y * dt;

      currentOrientation.current = {
        pitch: fusedPitch,
        roll: fusedRoll,
        yaw: fusedYaw,
      };

      setOrientation({...currentOrientation.current});
    });

    return () => {
      subscriptionAccel.unsubscribe();
      subscriptionGyro.unsubscribe();
    };
  }, []);

  const reset = () => {
    // Only reset Yaw. Pitch/Roll should be absolute from gravity.
    currentOrientation.current.yaw = 0;
    setOrientation(prev => ({...prev, yaw: 0}));
  };

  return {...orientation, reset};
};

// Compatibility export for CameraScreen
export const useYawRotation = () => {
  const orientation = useDeviceOrientation();
  const [gyroData, setGyroData] = useState({x: 0, y: 0, z: 0});
  const [currentSegment, setCurrentSegment] = useState(0);

  // Subscribe to gyro just for the debug data in CameraScreen
  useEffect(() => {
    const subscription = gyroscope.subscribe(({x, y, z}) => {
      setGyroData({x, y, z});
    });
    return () => subscription.unsubscribe();
  }, []);

  // Calculate segment based on yaw
  useEffect(() => {
    // Yaw is in radians in my new hook?
    // Wait, in my new hook: currentOrientation.current.yaw += z * dt;
    // z is rad/s. dt is s. So yaw is radians.
    // CameraScreen expects degrees or radians?
    // CameraScreen: const targetAngle = index * 22.5; ... let angleDiff = targetAngle - yaw;
    // It seems CameraScreen expects Degrees! "yaw.toFixed(1)°"

    // My new hook produces Radians because raw gyro is rad/s.
    // I should convert my new hook to output degrees or convert here.

    const yawDeg = orientation.yaw * (180 / Math.PI);

    // Normalize to 0-360 for segment calculation
    let positiveYaw = yawDeg;
    while (positiveYaw < 0) positiveYaw += 360;
    while (positiveYaw >= 360) positiveYaw -= 360;

    const segment = Math.floor(positiveYaw / 22.5) % 16;
    setCurrentSegment(segment);
  }, [orientation.yaw]);

  return {
    yaw: orientation.yaw * (180 / Math.PI),
    currentSegment,
    gyroData,
  };
};

export default useDeviceOrientation;
