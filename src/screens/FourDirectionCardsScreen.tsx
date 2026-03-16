import React, {useState, useEffect, useCallback} from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  type Direction,
  DIRECTION_LABELS,
} from '../directionConfig';
import {stitchPanoramaViaApi} from '../services/stitching/stitchApi';
import {savePanorama, dataUrlToBase64} from '../services/panoramaStorage';
import FullScreenImageViewer from '../components/FullScreenImageViewer';

const GAP = 12;
const HEADER_HEIGHT = 56;
const BUTTON_HEIGHT = 56;
const BUTTON_MARGIN = 16;
const PADDING = 16;

const ORDER: Direction[] = ['north', 'east', 'south', 'west'];

export interface CardState {
  status: 'empty' | 'loading' | 'done';
  imageUri?: string;
}

export default function FourDirectionCardsScreen({navigation, route}: any) {
  const insets = useSafeAreaInsets();
  const {width, height: winHeight} = Dimensions.get('window');
  const height = winHeight - insets.top - insets.bottom;
  const available = height - HEADER_HEIGHT - BUTTON_HEIGHT - BUTTON_MARGIN - PADDING * 2;
  const cardHeight = Math.max(100, Math.floor((available - GAP) / 2));
  const cardWidth = (width - GAP - PADDING * 2) / 2;

  const [cards, setCards] = useState<Record<Direction, CardState>>({
    north: {status: 'empty'},
    east: {status: 'empty'},
    south: {status: 'empty'},
    west: {status: 'empty'},
  });
  const [isStitchingFinal, setIsStitchingFinal] = useState(false);
  const [viewerItem, setViewerItem] = useState<{direction: Direction; imageUri: string} | null>(null);

  // Handle return from DirectionCapture with stitched panorama for that wall
  useEffect(() => {
    const {direction, imageUri} = route.params || {};
    if (direction && imageUri && ORDER.includes(direction)) {
      setCards(prev => ({
        ...prev,
        [direction]: {status: 'done', imageUri},
      }));
      navigation.setParams({direction: undefined, imageUri: undefined});
    }
  }, [route.params, navigation]);

  const handleCardPress = useCallback(
    (dir: Direction) => {
      if (cards[dir].status === 'done' && cards[dir].imageUri) {
        setViewerItem({direction: dir, imageUri: cards[dir].imageUri!});
      } else {
        navigation.navigate('DirectionCapture', {direction: dir});
      }
    },
    [navigation, cards]
  );

  const handleRecapture = useCallback(
    (dir: Direction) => {
      navigation.navigate('DirectionCapture', {direction: dir});
    },
    [navigation]
  );

  const directionUris: Record<string, string> = {};
  for (const d of ORDER) {
    if (cards[d].status === 'done' && cards[d].imageUri) {
      directionUris[d] = cards[d].imageUri!;
    }
  }
  const allUris = Object.values(directionUris);
  const canCreate = allUris.length >= 2;

  const handleCreatePanorama = useCallback(async () => {
    if (!canCreate || isStitchingFinal) return;
    if (allUris.length < 2) {
      Alert.alert('Need more', 'Capture at least 2 walls.');
      return;
    }
    setIsStitchingFinal(true);
    try {
      const result = await stitchPanoramaViaApi(
        allUris.map(uri => ({path: uri})),
        {singleWall: true},
      );
      if (result.success && result.imageData) {
        const id = result.panoramaId ?? `pano_${Date.now()}`;
        const base64 = dataUrlToBase64(result.imageData);
        if (base64) {
          await savePanorama(id, base64);
          Alert.alert(
            'Panorama ready',
            'Saved to Recent Projects & 3D Gallery.',
            [
              {text: 'OK'},
              {
                text: 'View 3D',
                onPress: () => {
                  navigation.navigate('MainTabs', {screen: '3D Model'});
                },
              },
            ]
          );
        } else {
          Alert.alert('Panorama ready', 'Stitched successfully.');
        }
      } else {
        Alert.alert('Stitching failed', result.error ?? 'Unknown error');
      }
    } catch (e) {
      Alert.alert(
        'Stitching failed',
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setIsStitchingFinal(false);
    }
  }, [canCreate, isStitchingFinal, allUris, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Capture Walls</Text>
          <Text style={styles.subtitle}>Capture in order: 1 → 2 → 3 → 4</Text>
        </View>
      </View>

      <View style={[styles.scrollContent, {padding: PADDING}]}>
        <View style={styles.grid}>
          {ORDER.map((dir) => (
            <View key={dir} style={[styles.card, {width: cardWidth, height: cardHeight}]}>
              <TouchableOpacity
                style={styles.cardTouchable}
                onPress={() => handleCardPress(dir)}
                activeOpacity={0.8}>
                <View style={[
                  styles.cardInner,
                  cards[dir].status === 'done' ? styles.cardFilled : styles.cardEmpty,
                ]}>
                  {cards[dir].status === 'loading' ? (
                    <ActivityIndicator size="large" color="#6b7280" />
                  ) : cards[dir].status === 'done' && cards[dir].imageUri ? (
                    <Image
                      source={{uri: cards[dir].imageUri}}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Icon name="add-circle-outline" size={48} color="#9ca3af" />
                  )}
                  <View style={[
                    styles.cardLabel,
                    cards[dir].status === 'done' ? styles.cardLabelFilled : styles.cardLabelEmpty,
                  ]}>
                    <Text style={[
                      styles.cardLabelText,
                      cards[dir].status === 'done' ? styles.cardLabelTextFilled : styles.cardLabelTextEmpty,
                    ]}>{DIRECTION_LABELS[dir]}</Text>
                    {cards[dir].status === 'done' ? (
                      <Icon name="checkmark-circle" size={20} color="#22c55e" />
                    ) : cards[dir].status === 'loading' ? (
                      <Text style={[styles.cardSubtext, styles.cardSubtextEmpty]}>Stitching...</Text>
                    ) : (
                      <Text style={[styles.cardSubtext, styles.cardSubtextEmpty]}>Tap to capture</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
              {cards[dir].status === 'done' && (
                <TouchableOpacity
                  style={styles.recaptureBtn}
                  onPress={() => handleRecapture(dir)}
                  activeOpacity={0.8}>
                  <Icon name="camera" size={22} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        <FullScreenImageViewer
          visible={!!viewerItem}
          imageUri={viewerItem?.imageUri ?? ''}
          title={viewerItem ? `${DIRECTION_LABELS[viewerItem.direction]}` : ''}
          onClose={() => setViewerItem(null)}
        />

        <TouchableOpacity
          style={[
            styles.createBtn,
            (!canCreate || isStitchingFinal) && styles.createBtnDisabled,
          ]}
          onPress={handleCreatePanorama}
          disabled={!canCreate || isStitchingFinal}
          activeOpacity={0.8}>
          {isStitchingFinal ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Icon name="images" size={22} color="#fff" />
              <Text style={styles.createBtnText}>Create Panorama</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  scrollContent: {
    flex: 1,
    paddingTop: PADDING,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  card: {
    position: 'relative',
  },
  cardTouchable: {
    flex: 1,
  },
  recaptureBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInner: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardEmpty: {
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cardFilled: {
    backgroundColor: '#1f2937',
  },
  cardLabelEmpty: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  cardLabelFilled: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cardLabelTextEmpty: {
    color: '#374151',
  },
  cardLabelTextFilled: {
    color: '#fff',
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cardLabelText: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtext: {
    fontSize: 12,
  },
  cardSubtextEmpty: {
    color: '#6b7280',
  },
  cardSubtextFilled: {
    color: 'rgba(255,255,255,0.9)',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: BUTTON_MARGIN,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#6200ee',
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
