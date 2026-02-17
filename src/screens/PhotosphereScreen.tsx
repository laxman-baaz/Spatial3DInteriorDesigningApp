import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from 'react-native-vision-camera';
import {orientation as sensorOrientation} from 'react-native-sensors';
import MaskedView from '@react-native-masked-view/masked-view';
import {
  generateSpherePoints,
  projectToScreen,
  isAligned,
  SpherePoint,
} from '../utils/SphereMath';
import SphereOverlay from '../components/SphereOverlay';
import SphereReview from '../components/SphereReview';

const {width, height} = Dimensions.get('window');

// LOW PASS FILTER FACTOR (0.0 - 1.0)
// Lower = Smoother but more laggy. Higher = Responsive but jittery.
// 0.15 is a sweet spot for AR.
const ALPHA = 0.15;

export default function PhotosphereScreen() {
  const device = useCameraDevice('back');
  const format = useCameraFormat(device, [{photoResolution: 'max'}]);
  const {hasPermission, requestPermission} = useCameraPermission();
  const camera = useRef<Camera>(null);

  const [points, setPoints] = useState<SpherePoint[]>([]);

  // We store exact orientation in Ref for animation loop using sensor data
  const currentOri = useRef({pitch: 0, yaw: 0});
  const [renderOri, setRenderOri] = useState({pitch: 0, yaw: 0});

  const [isCapturing, setIsCapturing] = useState(false);
  const initialYawOffset = useRef<number | null>(null);

  useEffect(() => {
    if (!hasPermission) requestPermission();
    setPoints(generateSpherePoints());

    // --- SENSOR FUSION LOGIC ---
    // Option A: QUATERNION (More accurate, avoids gimbal lock)
    const subscription = sensorOrientation.subscribe(({qw, qx, qy, qz}) => {
      // Roll (x-axis rotation) - Not used but good to have
      // const sinr_cosp = 2 * (qw * qx + qy * qz);
      // const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
      // const roll = Math.atan2(sinr_cosp, cosr_cosp);

      // Pitch (y-axis rotation)
      const sinp = 2 * (qw * qy - qz * qx);
      let pitch;
      if (Math.abs(sinp) >= 1)
        pitch =
          Math.sign(sinp) * (Math.PI / 2); // use 90 degrees if out of range
      else pitch = Math.asin(sinp);

      // Yaw (z-axis rotation)
      const siny_cosp = 2 * (qw * qz + qx * qy);
      const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
      const yaw = Math.atan2(siny_cosp, cosy_cosp);

      // ---------------------------------------------------------
      // APPLYING THE VALUES
      // ---------------------------------------------------------

      const rawPitchDeg = pitch * (180 / Math.PI);
      // On Android/Sensors, Pitch often needs to be inverted (-90 to +90) for AR Overlay
      const finalPitch = -rawPitchDeg;

      let rawYaw = yaw * (180 / Math.PI);

      // Normalize Yaw
      if (rawYaw < 0) rawYaw += 360;

      // Initial Offset
      if (initialYawOffset.current === null) {
        initialYawOffset.current = rawYaw;
      }

      // Apply Offset
      let adjustedYaw = rawYaw - (initialYawOffset.current || 0);
      if (adjustedYaw < 0) adjustedYaw += 360;
      if (adjustedYaw >= 360) adjustedYaw -= 360;

      // SMOOTHING YAW (Smart Wrap-Around)
      let diff = adjustedYaw - currentOri.current.yaw;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      let smoothYaw = currentOri.current.yaw + ALPHA * diff;
      if (smoothYaw < 0) smoothYaw += 360;
      if (smoothYaw >= 360) smoothYaw -= 360;

      // SMOOTHING PITCH
      const smoothPitch =
        currentOri.current.pitch +
        ALPHA * (finalPitch - currentOri.current.pitch);

      // Update Refs
      currentOri.current = {pitch: smoothPitch, yaw: smoothYaw};

      // Update State
      setRenderOri({pitch: smoothPitch, yaw: smoothYaw});
    });

    return () => subscription.unsubscribe();
  }, []);

  // We use a separate effect for capture logic to access latest 'points' state
  useEffect(() => {
    if (isCapturing || points.length === 0) return;

    const target = points.find(p => {
      if (p.isCaptured) return false;
      const proj = projectToScreen(
        renderOri.pitch,
        renderOri.yaw,
        p.targetPitch,
        p.targetYaw,
      );
      return isAligned(proj.deltaYaw, proj.deltaPitch, p.targetPitch);
    });

    if (target) {
      capturePhoto(target.id);
    }
  }, [renderOri, points, isCapturing]); // Runs on every frame update (renderOri changes)

  const capturePhoto = async (id: number) => {
    if (!camera.current) return;
    setIsCapturing(true);
    try {
      const photo = await camera.current.takePhoto({enableShutterSound: true});

      console.log(`Captured point ${id}: ${photo.path}`);

      setPoints(prev =>
        prev.map(p =>
          p.id === id
            ? {...p, isCaptured: true, imagePath: `file://${photo.path}`}
            : p,
        ),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsCapturing(false), 500); // 500ms debounce
    }
  };

  const resetPosition = () => {
    initialYawOffset.current = null; // Will reset on next frame
  };

  if (!device || !hasPermission) return <View style={styles.black} />;

  return (
    <View style={styles.container}>
      {/* 1. Camera */}
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        format={format}
      />

      {/* 2. Review Layer (Captured Photos) */}
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <View style={styles.maskWrapper}>
            <View style={styles.maskSolid} />
            <View style={styles.maskHole} />
          </View>
        }>
        {/* Pass the SMOOTHED renderOri */}
        <SphereReview points={points} orientation={renderOri} />
      </MaskedView>

      {/* 3. Dot Overlay */}
      <SphereOverlay points={points} orientation={renderOri} />

      {/* 4. Debug / UI */}
      <View style={styles.ui}>
        <Text style={styles.text}>Pitch: {renderOri.pitch.toFixed(1)}</Text>
        <Text style={styles.text}>Yaw: {renderOri.yaw.toFixed(1)}</Text>
        <TouchableOpacity onPress={resetPosition} style={styles.btn}>
          <Text style={styles.btnText}>Recenter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: 'black'},
  black: {flex: 1, backgroundColor: 'black'},
  maskWrapper: {flex: 1, backgroundColor: 'transparent'},
  maskSolid: {flex: 1, backgroundColor: 'black'},
  maskHole: {
    position: 'absolute',
    top: height / 2 - 120,
    left: width / 2 - 120,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'transparent',
  },
  ui: {position: 'absolute', bottom: 50, left: 20},
  text: {color: '#0f0', fontWeight: 'bold'},
  btn: {marginTop: 10, backgroundColor: '#333', padding: 10},
  btnText: {color: 'white'},
});
