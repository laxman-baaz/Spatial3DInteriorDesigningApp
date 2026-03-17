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
import SphereReview from '../components/SphereReview';
import MaskedView from '@react-native-masked-view/masked-view';
import {stitchPanoramaViaApi} from '../services/stitching/stitchApi';
import {savePanorama, dataUrlToBase64} from '../services/panoramaStorage';

const {width, height} = Dimensions.get('window');
const VIEWFINDER_WIDTH = width * 0.8;
const VIEWFINDER_HEIGHT = height * 0.7;

// High-resolution capture for panorama: 12MP 4:3
const PHOTO_TARGET_WIDTH = 4032;
const PHOTO_TARGET_HEIGHT = 3024;

/** Convert sensor radians to stitcher degrees. App: pitch 0=nadir, 90=horizon, 180=zenith; yaw 0..360 */
function orientationToDegrees(pitchRad: number, yawRad: number, rollRad: number) {
  const pitchDeg = (pitchRad * 180) / Math.PI;
  const yawDeg = ((yawRad * 180) / Math.PI + 360) % 360;
  const rollDeg = (rollRad * 180) / Math.PI;
  return {pitchDeg, yawDeg, rollDeg};
}

interface CapturedImage {
  id: number;
  imagePath: string;
  pitch: number;
  yaw: number;
  roll: number;
}

const PhotosphereScreen = () => {
  const device = useCameraDevice('back');

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
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [isStitching, setIsStitching] = useState(false);
  const nextIdRef = React.useRef(1);

  // Reset yaw on mount so 0° = where user started
  useEffect(() => {
    reset();
  }, []);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission]);

  const takePhoto = async () => {
    if (!camera.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await camera.current.takePhoto({
        enableShutterSound: true,
      });

      const {pitchDeg, yawDeg, rollDeg} = orientationToDegrees(
        orientation.pitch,
        orientation.yaw,
        orientation.roll,
      );

      const id = nextIdRef.current++;
      setCapturedImages(prev => [
        ...prev,
        {
          id,
          imagePath: `file://${photo.path}`,
          pitch: pitchDeg,
          yaw: yawDeg,
          roll: rollDeg,
        },
      ]);

      console.log(
        `[Photosphere] Captured #${id} pitch=${pitchDeg.toFixed(1)}° yaw=${yawDeg.toFixed(1)}° roll=${rollDeg.toFixed(1)}°`,
      );
    } catch (e) {
      console.error('Capture failed', e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleStitchHint = () => {
    Alert.alert(
      'Capture first',
      'Pan around and tap the capture button to take photos. Capture 6+ images of a wall for best results.',
    );
  };

  const handleStitchWithImages = async () => {
    if (isStitching || capturedImages.length === 0) return;

    console.log('[Photosphere] Stitch: sending', capturedImages.length, 'images to API');
    setIsStitching(true);
    try {
      const result = await stitchPanoramaViaApi(
        capturedImages.map(img => ({
          path: img.imagePath,
          pitch: img.pitch,
          yaw: img.yaw,
          roll: img.roll,
        })),
        {outputWidth: 4096, forceFull360: false},
      );

      if (result.success) {
        const id = result.panoramaId ?? `pano_${Date.now()}`;
        const base64 = result.imageData
          ? dataUrlToBase64(result.imageData)
          : null;
        if (base64) {
          await savePanorama(id, base64);
        }
        const time =
          result.durationMs != null
            ? ` (${Math.round(result.durationMs / 1000)}s)`
            : '';
        Alert.alert(
          'Panorama ready',
          base64
            ? `Saved to Recent Projects & 3D Gallery.${time}`
            : `Stitched successfully.${time}`,
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

  // Map captured images to SphereReview format (pitch, yaw, captured, imagePath)
  const reviewPoints = capturedImages.map(img => ({
    id: img.id,
    pitch: img.pitch,
    yaw: img.yaw,
    captured: true,
    imagePath: img.imagePath,
  }));

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        format={format}
      />

      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <View style={styles.maskContainer}>
            <View style={styles.maskBackground} />
            <View style={styles.centerHole} />
          </View>
        }>
        <SphereReview
          points={reviewPoints}
          orientation={orientation}
          viewFinderWidth={VIEWFINDER_WIDTH}
          viewFinderHeight={VIEWFINDER_HEIGHT}
        />
      </MaskedView>

      {/* HUD */}
      <View style={styles.hud}>
        <Text style={styles.hudText}>
          {capturedImages.length} captured
        </Text>
        <Text style={styles.hudHint}>Pan & tap to capture</Text>
      </View>

      {/* Capture button */}
      <TouchableOpacity
        style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
        onPress={takePhoto}
        disabled={isCapturing}
        activeOpacity={0.8}>
        {isCapturing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <View style={styles.captureButtonInner} />
        )}
      </TouchableOpacity>

      {/* Stitch button */}
      <TouchableOpacity
        style={[
          styles.stitchButton,
          (isStitching || capturedImages.length === 0) && styles.stitchButtonDisabled,
        ]}
        onPress={capturedImages.length > 0 ? handleStitchWithImages : handleStitchHint}
        disabled={isStitching}
        activeOpacity={0.8}>
        {isStitching ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.stitchButtonText}>
            Create panorama {capturedImages.length > 0 ? `(${capturedImages.length})` : ''}
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
    backgroundColor: 'black',
  },
  centerHole: {
    position: 'absolute',
    top: height / 2 - VIEWFINDER_HEIGHT / 2,
    left: width / 2 - VIEWFINDER_WIDTH / 2,
    width: VIEWFINDER_WIDTH,
    height: VIEWFINDER_HEIGHT,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hud: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  hudText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hudHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 4,
  },
  captureButton: {
    position: 'absolute',
    bottom: 140,
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'white',
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
    opacity: 0.6,
  },
  stitchButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
export default PhotosphereScreen;
