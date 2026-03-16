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
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from 'react-native-vision-camera';
import {type Direction, DIRECTION_LABELS} from '../directionConfig';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {stitchPanoramaViaApi} from '../services/stitching/stitchApi';
import {dataUrlToBase64} from '../services/panoramaStorage';

const {width, height} = Dimensions.get('window');
const PHOTO_TARGET_WIDTH = 5032;
const PHOTO_TARGET_HEIGHT = 3024;

const BOTTOM_BAR_HEIGHT = 150;

export default function DirectionCaptureScreen({navigation, route}: any) {
  const direction = (route.params?.direction ?? 'north') as Direction;
  const insets = useSafeAreaInsets();

  const device = useCameraDevice('back');
  const format = useCameraFormat(device, [
    {photoResolution: {width: PHOTO_TARGET_WIDTH, height: PHOTO_TARGET_HEIGHT}},
    {photoAspectRatio: 4 / 3},
  ]);

  const camera = React.useRef<Camera>(null);
  const {hasPermission, requestPermission} = useCameraPermission();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [capturedPaths, setCapturedPaths] = useState<string[]>([]);

  const takePhoto = async () => {
    if (!camera.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await camera.current.takePhoto({enableShutterSound: true});
      setCapturedPaths(prev => [...prev, `file://${photo.path}`]);
    } catch (e) {
      console.error('Capture failed', e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDone = async () => {
    if (capturedPaths.length < 2) {
      Alert.alert(
        'Need more photos',
        'Capture at least 2 overlapping photos of this direction, then tap Done.',
      );
      return;
    }
    if (isStitching) return;

    setIsStitching(true);
    try {
      const result = await stitchPanoramaViaApi(
        capturedPaths.map(path => ({path})),
        {singleWall: true},
      );
      if (result.success && result.imageData) {
        const base64 = dataUrlToBase64(result.imageData);
        if (base64) {
          const baseDir = ReactNativeBlobUtil.fs.dirs.DocumentDir;
          const wallsDir = `${baseDir}/Walls`;
          const exists = await ReactNativeBlobUtil.fs.exists(wallsDir);
          if (!exists) {
            await ReactNativeBlobUtil.fs.mkdir(wallsDir);
          }
          const filename = `wall_${direction}_${Date.now()}.jpg`;
          const path = `${wallsDir}/${filename}`;
          await ReactNativeBlobUtil.fs.writeFile(path, base64, 'base64');
          const imageUri = path.startsWith('file://') ? path : `file://${path}`;
          navigation.navigate('FourDirectionCards', {
            direction,
            imageUri,
          });
          return;
        }
      }
      Alert.alert('Stitching failed', result.error ?? 'Unknown error');
    } catch (e) {
      Alert.alert(
        'Stitching failed',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setIsStitching(false);
    }
  };

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  if (!device || !hasPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No Camera / Permission</Text>
      </View>
    );
  }

  const cameraTop = insets.top + 100;
  const cameraBottom = height - insets.bottom - BOTTOM_BAR_HEIGHT;
  const cameraHeight = cameraBottom - cameraTop;

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={[
          styles.camera,
          {
            top: cameraTop,
            height: cameraHeight,
          },
        ]}
        device={device}
        isActive={true}
        photo={true}
        format={format}
      />

      <View style={[styles.hud, {top: cameraTop + 12}]}>
        <Text style={styles.hudTitle}>{DIRECTION_LABELS[direction]}</Text>
        <Text style={styles.hudText}>
          {capturedPaths.length} photo{capturedPaths.length !== 1 ? 's' : ''}
        </Text>
        <Text style={styles.hudHint}>
          Pan steadily left→right. Take 6–8 shots with ~30% overlap each, then
          Done.
        </Text>
      </View>

      {isStitching && (
        <View style={styles.stitchOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.stitchText}>Stitching...</Text>
        </View>
      )}

      <View style={[styles.bottomBar, {paddingBottom: insets.bottom + 24}]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          disabled={isStitching}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.captureBtn}
          onPress={takePhoto}
          disabled={isCapturing || isStitching}
          activeOpacity={0.8}>
          <View
            style={[styles.captureInner, isCapturing && styles.captureDisabled]}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.doneBtn,
            (capturedPaths.length < 2 || isStitching) && styles.doneBtnDisabled,
          ]}
          onPress={handleDone}
          disabled={capturedPaths.length < 2 || isStitching}
          activeOpacity={0.8}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    maxWidth: width - 48,
  },
  hudTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  hudText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hudHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  stitchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stitchText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 12,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
  },
  backBtnText: {
    color: '#fff',
    fontSize: 16,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  captureDisabled: {
    opacity: 0.5,
  },
  doneBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 150, 255, 0.9)',
    borderRadius: 12,
  },
  doneBtnDisabled: {
    opacity: 0.5,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
});
