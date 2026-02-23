/**
 * Full-screen 360° panorama viewer for equirectangular images.
 * Uses a pannable Image (no WebGL) so it works reliably with file:// URIs.
 * Drag to look around the panorama.
 */
import React, {useRef, useState, useEffect} from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  PanResponder,
  Dimensions,
  Image,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');
// Equirect image display size: 360° width, 180° height (2:1)
const IMG_WIDTH = Math.max(SCREEN_WIDTH, SCREEN_HEIGHT) * 2;
const IMG_HEIGHT = Math.max(SCREEN_WIDTH, SCREEN_HEIGHT);

interface PanoramaViewerProps {
  visible: boolean;
  imageUri: string;
  title?: string;
  onClose: () => void;
}

export default function PanoramaViewer({
  visible,
  imageUri,
  title,
  onClose,
}: PanoramaViewerProps) {
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastDrag = useRef({x: 0, y: 0});

  useEffect(() => {
    if (visible && imageUri) {
      setImageLoaded(false);
      setLoadError(false);
    }
  }, [visible, imageUri]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gestureState) => {
        lastDrag.current = {x: gestureState.dx, y: gestureState.dy};
      },
      onPanResponderMove: (_, gestureState) => {
        const dx = gestureState.dx - lastDrag.current.x;
        const dy = gestureState.dy - lastDrag.current.y;
        lastDrag.current = {x: gestureState.dx, y: gestureState.dy};
        const degPerPxH = 360 / IMG_WIDTH;
        const degPerPxV = 180 / IMG_HEIGHT;
        setYaw(prev => prev - dx * degPerPxH);
        setPitch(prev =>
          Math.max(-85, Math.min(85, prev + dy * degPerPxV)),
        );
      },
      onPanResponderRelease: () => {
        lastDrag.current = {x: 0, y: 0};
      },
    }),
  ).current;

  const yawNorm = ((yaw % 360) + 360) % 360;
  const translateX = SCREEN_WIDTH / 2 - (yawNorm / 360) * IMG_WIDTH;
  const translateY =
    SCREEN_HEIGHT / 2 - ((90 - pitch) / 180) * IMG_HEIGHT;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Icon name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <View style={styles.closeBtn} />
        </View>

        {loadError ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackText}>Could not load panorama</Text>
            <TouchableOpacity style={styles.fallbackBtn} onPress={onClose}>
              <Text style={styles.fallbackBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View
              style={styles.panArea}
              {...panResponder.panHandlers}
              collapsable={false}>
              <Image
                source={{uri: imageUri}}
                style={[
                  styles.panoImage,
                  {
                    width: IMG_WIDTH,
                    height: IMG_HEIGHT,
                    transform: [{translateX}, {translateY}],
                  },
                ]}
                resizeMode="cover"
                onLoad={() => setImageLoaded(true)}
                onError={() => setLoadError(true)}
              />
            </View>
            {!imageLoaded && imageUri ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>Loading panorama…</Text>
              </View>
            ) : (
              <Text style={styles.hint}>Drag to look around</Text>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

/**
 * Fallback: full-screen scrollable panorama image when GL is not used or fails.
 */
export function PanoramaViewerFallback({
  visible,
  imageUri,
  title,
  onClose,
}: PanoramaViewerProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Icon name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <View style={styles.closeBtn} />
        </View>
        <ScrollView
          style={StyleSheet.absoluteFill}
          contentContainerStyle={styles.scrollContent}
          horizontal
          showsHorizontalScrollIndicator={false}>
          <Image
            source={{uri: imageUri}}
            style={styles.fallbackImage}
            resizeMode="contain"
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
  },
  panArea: {
    flex: 1,
    overflow: 'hidden',
  },
  panoImage: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  hint: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  fallbackText: {
    color: '#fff',
    fontSize: 16,
  },
  fallbackBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6200ee',
    borderRadius: 12,
  },
  fallbackBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackImage: {
    width: SCREEN_WIDTH * 2,
    height: SCREEN_HEIGHT,
  },
});
