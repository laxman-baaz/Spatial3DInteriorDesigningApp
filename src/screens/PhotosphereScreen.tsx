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

const {width, height} = Dimensions.get('window');
const CIRCLE_RADIUS = 120;

const PhotosphereScreen = () => {
  const device = useCameraDevice('back');

  // --- 2. SELECT BEST FORMAT (Highest Resolution) ---
  const format = useCameraFormat(device, [{photoResolution: 'max'}]);

  const camera = React.useRef<Camera>(null);
  const {hasPermission, requestPermission} = useCameraPermission();
  const {reset, ...orientation} = useDeviceOrientation();
  const [isCapturing, setIsCapturing] = useState(false);

  // Target points generation - 22 DOTS for complete sphere coverage
  // Using the SAME coordinate system as working 16-dot version:
  // Pitch 90 = Horizon (phone upright), 135 = Sky, 45 = Ground
  const generatePoints = (): Array<{
    id: number;
    pitch: number;
    yaw: number;
    captured: boolean;
    imagePath: string | null;
  }> => {
    const points: Array<{
      id: number;
      pitch: number;
      yaw: number;
      captured: boolean;
      imagePath: string | null;
    }> = [];
    let id = 1;

    // --- 1. ZENITH (Top/Sky Cap) - 1 dot straight up ---
    points.push({
      id: id++,
      pitch: 180, // Straight up (90° above horizon)
      yaw: 0,
      captured: false,
      imagePath: null,
    });

    // --- 2. UPPER RING (Sky, +45° above horizon) - 6 dots every 60° ---
    for (let i = 0; i < 6; i++) {
      points.push({
        id: id++,
        pitch: 135, // 45° above horizon
        yaw: i * 60,
        captured: false,
        imagePath: null,
      });
    }

    // --- 3. CENTER RING (Horizon, eye level) - 8 dots every 45° ---
    for (let i = 0; i < 8; i++) {
      points.push({
        id: id++,
        pitch: 90, // Horizon (phone upright)
        yaw: i * 45,
        captured: false,
        imagePath: null,
      });
    }

    // --- 4. LOWER RING (Ground, -45° below horizon) - 6 dots every 60° ---
    for (let i = 0; i < 6; i++) {
      points.push({
        id: id++,
        pitch: 45, // 45° below horizon
        yaw: i * 60,
        captured: false,
        imagePath: null,
      });
    }

    // --- 5. NADIR (Bottom/Ground Cap) - 1 dot straight down ---
    points.push({
      id: id++,
      pitch: 0, // Straight down (90° below horizon)
      yaw: 0,
      captured: false,
      imagePath: null,
    });

    return points;
  };

  const [points, setPoints] = useState(generatePoints());

  // Reset orientation on mount to establishing "Zero"
  useEffect(() => {
    reset();
  }, []);

  useEffect(() => {
    checkAlignment();
  }, [orientation]);

  const checkAlignment = async () => {
    if (isCapturing) return;

    // Check ALL uncaptured points - capture ANY aligned dot
    const uncapturedPoints = points.filter(p => !p.captured);
    
    if (uncapturedPoints.length === 0) {
      console.log('All dots captured! 🎉');
      return;
    }

    for (const point of uncapturedPoints) {
      const {x, y} = project3DTo2D(point, orientation, {
        width,
        height,
        fovH: 60,
        fovV: 45,
      });

      const distFromCenter = Math.sqrt(
        Math.pow(x - width / 2, 2) + Math.pow(y - height / 2, 2),
      );

      if (distFromCenter < 20) {
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

      {/* LAYER 3: Target Dots & Guides */}
      <SphereOverlay
        orientation={orientation}
        points={points}
      />

      {/* Progress HUD */}
      <View style={styles.hud}>
        <Text style={styles.hudText}>
          {points.filter(p => p.captured).length} / 22
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
