import React, {useState, useEffect} from 'react';
import {View, StyleSheet, Text, Dimensions} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from 'react-native-vision-camera';
import useDeviceOrientation from '../hooks/useDeviceOrientation';
import SphereOverlay from '../components/SphereOverlay';
import SphereReview from '../components/SphereReview';
import MaskedView from '@react-native-masked-view/masked-view';
import {project3DTo2D} from '../utils/projection';
import {TARGET_DOTS} from '../sphereConfig';

const {width, height} = Dimensions.get('window');
const CIRCLE_RADIUS = 120;
const FOV_H = 60;
const FOV_V = 45;
const ALIGN_THRESHOLD_PX = 20;

const PhotosphereScreen = () => {
  const device = useCameraDevice('back');

  // --- 2. SELECT BEST FORMAT (Highest Resolution) ---
  const format = useCameraFormat(device, [{photoResolution: 'max'}]);

  const camera = React.useRef<Camera>(null);
  const {hasPermission, requestPermission} = useCameraPermission();
  const {reset, ...orientation} = useDeviceOrientation();
  const [isCapturing, setIsCapturing] = useState(false);

  // 32-DOT complete sphere coverage (7 rings, 30° vertical spacing)
  // From sphereConfig: Pitch 90° = Horizon, 180° = Zenith, 0° = Nadir
  const generatePoints = (): Array<{
    id: number;
    pitch: number;
    yaw: number;
    captured: boolean;
    imagePath: string | null;
  }> => {
    return TARGET_DOTS.map((dot, index) => ({
      id: index + 1,
      pitch: dot.pitch,
      yaw: dot.yaw,
      captured: false,
      imagePath: null,
    }));
  };

  const [points, setPoints] = useState(generatePoints());

  // Reset orientation on mount to establishing "Zero"
  useEffect(() => {
    reset();
  }, []);

  useEffect(() => {
    checkAlignment();
  }, [orientation, points]);

  const checkAlignment = async () => {
    if (isCapturing) return;

    // Check ALL uncaptured points - capture ANY aligned dot
    const uncapturedPoints = points.filter(p => !p.captured);
    
    if (uncapturedPoints.length === 0) {
      console.log('All dots captured! 🎉');
      return;
    }

    const cx = width / 2;
    const cy = height / 2;
    const projectionParams = { width, height, fovH: FOV_H, fovV: FOV_V };

    for (const point of uncapturedPoints) {
      const {x, y} = project3DTo2D(point, orientation, projectionParams);

      const distFromCenter = Math.sqrt(
        Math.pow(x - cx, 2) + Math.pow(y - cy, 2),
      );

      if (distFromCenter < ALIGN_THRESHOLD_PX) {
        await takePhoto(point.id);
        break; // Capture one at a time
      }
    }
  };

  const takePhoto = async (id: number) => {
    if (camera.current) {
      setIsCapturing(true);
      try {
        const photo = await camera.current.takePhoto({
          enableShutterSound: true,
        });
        console.log(`Captured point ${id}:`, photo.path);

        // Mark as captured
        setPoints(prev =>
          prev.map(p =>
            p.id === id
              ? {...p, captured: true, imagePath: `file://${photo.path}`}
              : p,
          ),
        );
      } catch (e) {
        console.error('Capture failed', e);
      } finally {
        setIsCapturing(false);
      }
    }
  };

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  if (!device || !hasPermission)
    return (
      <View style={styles.container}>
        <Text>No Camera / Permission</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      {/* LAYER 1: Live Camera */}
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        format={format}
      />

      {/* LAYER 2: Masked Overlay (Grey Dimension + Photos) */}
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <View style={styles.maskContainer}>
            {/* Opaque background keeps content visible */}
            <View style={styles.maskBackground} />
            {/* Transparent hole hides content (showing camera behind) */}
            <View style={styles.centerHole} />
          </View>
        }>
        <SphereReview points={points} orientation={orientation} />
      </MaskedView>

      {/* LAYER 3: Target Dots & Guides (same dimensions/FOV as capture) */}
      <SphereOverlay
        orientation={orientation}
        points={points}
        width={width}
        height={height}
        fovH={FOV_H}
        fovV={FOV_V}
        circleRadius={CIRCLE_RADIUS}
        alignThresholdPx={ALIGN_THRESHOLD_PX}
      />

      {/* Progress HUD */}
      <View style={styles.hud}>
        <Text style={styles.hudText}>
          {points.filter(p => p.captured).length} / 32
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  maskContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  maskBackground: {
    flex: 1,
    backgroundColor: 'black', // The mask is opaque (black), so content shows.
  },
  centerHole: {
    position: 'absolute',
    top: height / 2 - CIRCLE_RADIUS,
    left: width / 2 - CIRCLE_RADIUS,
    width: CIRCLE_RADIUS * 2,
    height: CIRCLE_RADIUS * 2,
    borderRadius: CIRCLE_RADIUS,
    backgroundColor: 'transparent', // The mask is transparent, so content is hidden.
  },
  hud: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  hudText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
export default PhotosphereScreen;
