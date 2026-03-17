import React, {useState} from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useRoomScan, type WallId} from '../context/RoomScanContext';
import {stitchPanoramaViaApi} from '../services/stitching/stitchApi';
import {savePanorama, dataUrlToBase64} from '../services/panoramaStorage';
import PanoramaViewer from '../components/PanoramaViewer';

const WALLS: {id: 'wall1' | 'wall2' | 'wall3' | 'wall4'; label: string}[] = [
  {id: 'wall1', label: 'Wall 1'},
  {id: 'wall2', label: 'Wall 2'},
  {id: 'wall3', label: 'Wall 3'},
  {id: 'wall4', label: 'Wall 4'},
];

/** Yaw offset per wall for 360° room: each wall is 90° apart */
const WALL_YAW_OFFSET: Record<string, number> = {
  wall1: 0,
  wall2: 90,
  wall3: 180,
  wall4: 270,
};

export default function WallScanScreen({navigation}: any) {
  const {wallImages, wallStitchedResults, totalCount} = useRoomScan();
  const [isStitching, setIsStitching] = useState(false);
  const [viewerWall, setViewerWall] = useState<WallId | null>(null);

  const handleCapturePress = (wallId: WallId) => {
    navigation.navigate('WallCamera', {wallId});
  };

  const handleCardPress = (wallId: WallId) => {
    const stitched = wallStitchedResults[wallId];
    if (stitched) {
      setViewerWall(wallId);
    } else {
      handleCapturePress(wallId);
    }
  };

  const handleCreatePanorama = async () => {
    if (isStitching || totalCount === 0) return;

    // Build stitch payload: all images with wall-specific yaw offset
    const allImages: {path: string; pitch: number; yaw: number; roll: number}[] = [];
    for (const wall of WALLS) {
      const offset = WALL_YAW_OFFSET[wall.id];
      for (const img of wallImages[wall.id]) {
        allImages.push({
          path: img.imagePath,
          pitch: img.pitch,
          yaw: (img.yaw + offset) % 360,
          roll: img.roll,
        });
      }
    }

    if (allImages.length === 0) {
      Alert.alert(
        'Capture first',
        'Tap each wall card to capture images. Capture at least a few images per wall for best results.',
      );
      return;
    }

    console.log('[WallScan] Stitch: sending', allImages.length, 'images from all walls');
    setIsStitching(true);
    try {
      const result = await stitchPanoramaViaApi(allImages, {
        outputWidth: 4096,
        forceFull360: true,
      });

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
        navigation.goBack();
      } else {
        Alert.alert('Stitching failed', result.error ?? 'Unknown error');
      }
    } catch (e) {
      console.error('[WallScan] Stitch error:', e);
      Alert.alert(
        'Stitching failed',
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setIsStitching(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Room Scan</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.instruction}>
          Tap each wall to capture. Take 2 or more photos per side for best results.
          Tap a card to view the stitched result, or the camera icon to re-capture.
        </Text>

        <View style={styles.cards}>
          {WALLS.map(wall => {
            const count = wallImages[wall.id].length;
            const stitchedUri = wallStitchedResults[wall.id];
            const hasResult = !!stitchedUri;
            return (
              <TouchableOpacity
                key={wall.id}
                style={styles.card}
                onPress={() => handleCardPress(wall.id)}
                activeOpacity={0.8}>
                <View style={styles.cardPreview}>
                  {hasResult ? (
                    <Image
                      source={{uri: stitchedUri}}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.cardPlaceholder}>
                      <Icon name="cube-outline" size={32} color="#6200ee" />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.cameraIcon}
                    onPress={() => handleCapturePress(wall.id)}
                    hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                    <Icon name="camera" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardLabel}>{wall.label}</Text>
                <Text style={styles.cardCount}>
                  {hasResult
                    ? 'Tap to view'
                    : count > 0
                      ? `${count} image${count === 1 ? '' : 's'}`
                      : 'Tap to capture'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <PanoramaViewer
          visible={viewerWall !== null}
          imageUri={viewerWall ? (wallStitchedResults[viewerWall] ?? '') : ''}
          title={viewerWall ? `Wall ${viewerWall.replace('wall', '')}` : undefined}
          onClose={() => setViewerWall(null)}
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.stitchButton,
            (isStitching || totalCount === 0) && styles.stitchButtonDisabled,
          ]}
          onPress={totalCount > 0 ? handleCreatePanorama : () => Alert.alert(
            'Capture first',
            'Tap each wall card to capture images. Capture at least a few images per wall for best results.',
          )}
          disabled={isStitching}
          activeOpacity={0.8}>
          {isStitching ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Icon name="images" size={20} color="#fff" style={styles.stitchIcon} />
              <Text style={styles.stitchButtonText}>
                Create panorama {totalCount > 0 ? `(${totalCount})` : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 120,
  },
  instruction: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: 'rgba(98, 0, 238, 0.08)',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  cardCount: {
    fontSize: 13,
    color: '#888',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 40,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  stitchButton: {
    flexDirection: 'row',
    backgroundColor: '#6200ee',
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stitchButtonDisabled: {
    opacity: 0.6,
  },
  stitchIcon: {
    marginRight: 8,
  },
  stitchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
