import React, {useState, useEffect} from 'react';
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
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
import {stitchPanoramaViaApi} from '../services/stitching/stitchApi';
import {savePanorama, dataUrlToBase64} from '../services/panoramaStorage';

const {width, height} = Dimensions.get('window');
const VIEWFINDER_WIDTH = width * 0.8;
const VIEWFINDER_HEIGHT = height * 0.7;
const FOV_H = 45; // Portrait narrower horizontal FOV
const FOV_V = 60; // Portrait wider vertical FOV
const ALIGN_THRESHOLD_PX = 20;
/** Must hold the dot aligned for this long (ms) before auto-capture */
const ALIGN_HOLD_MS = 1000;

// High-resolution capture for panorama: 12MP 4:3 (matches FOV 60°×45°)
const PHOTO_TARGET_WIDTH = 4032;
const PHOTO_TARGET_HEIGHT = 3024;

const PhotosphereScreen = () => {
  const device = useCameraDevice('back');

  // Prefer format with photo resolution closest to 12MP 4:3 for better width/height
  const format = useCameraFormat(device, [
    {
      photoResolution: {
        width: PHOTO_TARGET_WIDTH,
        height: PHOTO_TARGET_HEIGHT,
      },
    },
    {photoAspectRatio: 4 / 3},
  ]);

  const camera = React.useRef<Camera>(null);
  const {hasPermission, requestPermission} = useCameraPermission();
  const {reset, ...orientation} = useDeviceOrientation();
  const [isCapturing, setIsCapturing] = useState(false);

  // 27-DOT layout: 3 rings × 9 dots, all aligned yaw (0,40,80…320°)
  // upper pitch=135°  center pitch=90°  lower pitch=45°  — from sphereConfig
  const generatePoints = (): Array<{
    id: number;
    pitch: number;
    yaw: number;
    captured: boolean;
    imagePath: string | null;
    roll: number | null;
  }> => {
    return TARGET_DOTS.map((dot, index) => ({
      id: index + 1,
      pitch: dot.pitch,
      yaw: dot.yaw,
      captured: false,
      imagePath: null,
      roll: null,
    }));
  };

  const [points, setPoints] = useState(generatePoints());
  const [isStitching, setIsStitching] = useState(false);
  const capturedCount = points.filter(p => p.captured).length;
  const totalDots = TARGET_DOTS.length; // 27 (3 rings × 9)
  const allCaptured = capturedCount === totalDots;
  const hasLoggedAllCaptured = React.useRef(false);
  const alignedPointIdRef = React.useRef<number | null>(null);
  const holdTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Reset orientation on mount to establishing "Zero"
  useEffect(() => {
    reset();
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current != null) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    checkAlignment();
  }, [orientation, points]);

  const checkAlignment = () => {
    if (isCapturing) return;

    const uncapturedPoints = points.filter(p => !p.captured);

    if (uncapturedPoints.length === 0) {
      if (!hasLoggedAllCaptured.current) {
        hasLoggedAllCaptured.current = true;
        console.log('All dots captured! 🎉');
      }
      if (holdTimeoutRef.current != null) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
      alignedPointIdRef.current = null;
      return;
    }
    hasLoggedAllCaptured.current = false;

    const cx = width / 2;
    const cy = height / 2;
    const projectionParams = {width, height, fovH: FOV_H, fovV: FOV_V};

    // Find the dot closest to center that is within threshold (actual aim, not first in list)
    let best: {point: (typeof uncapturedPoints)[0]; dist: number} | null = null;
    for (const point of uncapturedPoints) {
      const {x, y} = project3DTo2D(point, orientation, projectionParams);
      const dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
      if (dist < ALIGN_THRESHOLD_PX && (best == null || dist < best.dist)) {
        best = {point, dist};
      }
    }

    if (best == null) {
      if (holdTimeoutRef.current != null) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }
      alignedPointIdRef.current = null;
      return;
    }

    const {point} = best;
    if (alignedPointIdRef.current === point.id) {
      // Still on same dot; timer already running, do nothing
      return;
    }

    // New dot aligned: cancel previous timer and start 2s hold for this dot
    if (holdTimeoutRef.current != null) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    alignedPointIdRef.current = point.id;
    const pointIdToCapture = point.id;
    holdTimeoutRef.current = setTimeout(() => {
      holdTimeoutRef.current = null;
      alignedPointIdRef.current = null;
      takePhoto(pointIdToCapture);
    }, ALIGN_HOLD_MS);
  };

  const takePhoto = async (id: number) => {
    if (camera.current) {
      setIsCapturing(true);
      try {
        const photo = await camera.current.takePhoto({
          enableShutterSound: true,
        });
        console.log(`Captured point ${id}:`, photo.path);

        // Mark as captured, save current physical roll
        setPoints(prev =>
          prev.map(p =>
            p.id === id
              ? {
                  ...p,
                  captured: true,
                  imagePath: `file://${photo.path}`,
                  roll: orientation.roll,
                }
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

  const handleStitch = async () => {
    if (isStitching) return;
    const withPaths = points.filter(p => p.captured && p.imagePath);
    if (withPaths.length === 0) {
      Alert.alert(
        'No images',
        'Capture at least one dot to create a panorama.',
      );
      return;
    }
    console.log(
      '[Photosphere] Stitch: sending',
      withPaths.length,
      'images to API',
    );
    setIsStitching(true);
    try {
      const result = await stitchPanoramaViaApi(
        withPaths.map(p => ({
          path: p.imagePath!,
          pitch: p.pitch,
          yaw: p.yaw,
          roll: p.roll ?? 0,
        })),
        {outputWidth: 4096, forceFull360: true},
      );
      console.log('[Photosphere] Stitch result:', {
        success: result.success,
        panoramaId: result.panoramaId,
        hasImageData: !!result.imageData,
        imageDataLength: result.imageData?.length ?? 0,
        error: result.error,
      });
      if (result.success) {
        const id = result.panoramaId ?? `pano_${Date.now()}`;
        const base64 = result.imageData
          ? dataUrlToBase64(result.imageData)
          : null;
        if (base64) {
          console.log(
            '[Photosphere] Saving panorama locally, id=',
            id,
            'base64Len=',
            base64.length,
          );
          await savePanorama(id, base64);
          console.log('[Photosphere] Panorama saved to storage');
        } else {
          console.log('[Photosphere] No base64 from API - not saving locally');
        }
        const time =
          result.durationMs != null
            ? ` (${Math.round(result.durationMs / 1000)}s)`
            : '';
        Alert.alert(
          'Panorama ready',
          base64
            ? `Saved to Recent Projects & 3D Gallery.${time}`
            : `Stitched successfully.${time}${
                result.panoramaId ? `\nID: ${result.panoramaId}` : ''
              }`,
        );
      } else {
        Alert.alert('Stitching failed', result.error ?? 'Unknown error');
      }
    } catch (e) {
      console.error('[Photosphere] Stitch error:', e);
      Alert.alert(
        'Stitching failed',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setIsStitching(false);
    }
  };

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
        <SphereReview
          points={points}
          orientation={orientation}
          viewFinderWidth={VIEWFINDER_WIDTH}
          viewFinderHeight={VIEWFINDER_HEIGHT}
        />
      </MaskedView>

      {/* LAYER 3: Target Dots & Guides (viewfinder 80% × 70% of screen) */}
      <SphereOverlay
        orientation={orientation}
        points={points}
        width={width}
        height={height}
        fovH={FOV_H}
        fovV={FOV_V}
        viewFinderWidth={VIEWFINDER_WIDTH}
        viewFinderHeight={VIEWFINDER_HEIGHT}
        alignThresholdPx={ALIGN_THRESHOLD_PX}
      />

      {/* Progress HUD */}
      <View style={styles.hud}>
        <Text style={styles.hudText}>
          {capturedCount} / {totalDots}
        </Text>
      </View>

      {/* Create panorama — always visible; uses all captured images (1–27) */}
      <TouchableOpacity
        style={[
          styles.stitchButton,
          (isStitching || capturedCount === 0) && styles.stitchButtonDisabled,
        ]}
        onPress={handleStitch}
        disabled={isStitching || capturedCount === 0}
        activeOpacity={0.8}>
        {isStitching ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.stitchButtonText}>
            Create panorama {capturedCount > 0 ? `(${capturedCount})` : ''}
          </Text>
        )}
      </TouchableOpacity>
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
    top: height / 2 - VIEWFINDER_HEIGHT / 2,
    left: width / 2 - VIEWFINDER_WIDTH / 2,
    width: VIEWFINDER_WIDTH,
    height: VIEWFINDER_HEIGHT,
    borderRadius: 16,
    backgroundColor: 'transparent', // The mask is transparent, so camera shows through.
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
  stitchButton: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 150, 255, 0.9)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    minWidth: 160,
    alignItems: 'center',
  },
  stitchButtonDisabled: {
    opacity: 0.8,
  },
  stitchButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
export default PhotosphereScreen;
