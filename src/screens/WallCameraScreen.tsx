import React, {useState, useEffect} from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');
/** Camera viewport height - ~70% of screen (not full height) */
const CAMERA_HEIGHT = Math.round(SCREEN_HEIGHT * 0.7);
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/Ionicons';
import useDeviceOrientation from '../hooks/useDeviceOrientation';
import {orientationToDegrees} from '../utils/orientationUtils';
import {useRoomScan, type CapturedImage, type WallId} from '../context/RoomScanContext';
import {stitchPanoramaViaApi} from '../services/stitching/stitchApi';

const PHOTO_TARGET_WIDTH = 4032;
const PHOTO_TARGET_HEIGHT = 3024;

export default function WallCameraScreen({navigation, route}: any) {
  const wallId = route.params?.wallId as WallId | undefined;
  const device = useCameraDevice('back');
  const {setWallImages, setWallStitchedResult, clearWallStitchedResult} = useRoomScan();

  const format = useCameraFormat(device, [
    {photoResolution: {width: PHOTO_TARGET_WIDTH, height: PHOTO_TARGET_HEIGHT}},
    {photoAspectRatio: 4 / 3},
  ]);

  const camera = React.useRef<Camera>(null);
  const {hasPermission, requestPermission} = useCameraPermission();
  const {reset, ...orientation} = useDeviceOrientation();
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [isStitching, setIsStitching] = useState(false);
  const nextIdRef = React.useRef(1);

  useEffect(() => {
    reset();
  }, []);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  const takePhoto = async () => {
    if (!camera.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await camera.current.takePhoto({enableShutterSound: true});
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
    } catch (e) {
      console.error('Capture failed', e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDone = async () => {
    if (!wallId) return;

    setWallImages(wallId, capturedImages);

    if (capturedImages.length === 0) {
      clearWallStitchedResult(wallId);
      navigation.goBack();
      return;
    }

    setIsStitching(true);
    try {
      const images = capturedImages.map(img => ({
        path: img.imagePath,
        pitch: img.pitch,
        yaw: img.yaw,
        roll: img.roll,
      }));

      const result = await stitchPanoramaViaApi(images, {
        outputWidth: 2048,
        forceFull360: false, // partial stitch for this wall only, not 360°
        mode: 'wall',
      });

      if (result.success && result.imageData) {
        setWallStitchedResult(wallId, result.imageData);
      }
    } catch (e) {
      console.error('[WallCamera] Stitch failed:', e);
    } finally {
      setIsStitching(false);
      navigation.goBack();
    }
  };

  if (!wallId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Invalid wall</Text>
      </View>
    );
  }

  if (!device || !hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No Camera / Permission</Text>
      </View>
    );
  }

  const wallLabel = `Wall ${wallId.replace('wall', '')}`;

  return (
    <View style={styles.container}>
      <View style={styles.cameraWrapper}>
        <Camera
          ref={camera}
          style={styles.camera}
          device={device}
          isActive={true}
          photo={true}
          format={format}
        />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Icon name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{wallLabel}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* HUD */}
      <View style={styles.hud}>
        <Text style={styles.hudText}>{capturedImages.length} captured</Text>
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

      {/* Done button */}
      <TouchableOpacity
        style={[styles.doneButton, isStitching && styles.doneButtonDisabled]}
        onPress={handleDone}
        disabled={isStitching}
        activeOpacity={0.8}>
        {isStitching ? (
          <>
            <ActivityIndicator color="#fff" size="small" style={styles.doneSpinner} />
            <Text style={styles.doneButtonText}>Stitching…</Text>
          </>
        ) : (
          <Text style={styles.doneButtonText}>Done</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  cameraWrapper: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: CAMERA_HEIGHT,
    top: (SCREEN_HEIGHT - CAMERA_HEIGHT) / 2,
    left: 0,
    overflow: 'hidden',
  },
  camera: {
    width: '100%',
    height: '100%',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 44,
  },
  hud: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  hudText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  hudHint: {
    color: 'rgba(255,255,255,0.8)',
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
  doneButton: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(98, 0, 238, 0.9)',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  doneButtonDisabled: {
    opacity: 0.8,
  },
  doneSpinner: {
    marginRight: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
