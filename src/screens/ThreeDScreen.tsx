import React, {useState, useCallback} from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  loadPanoramas,
  saveStaged,
  type PanoramaItem,
} from '../services/panoramaStorage';
import {stageWithAI} from '../services/nanoBanana/nanoBananaService';

const {width} = Dimensions.get('window');
const HORIZONTAL_PADDING = 20;
const CARD_WIDTH = width - HORIZONTAL_PADDING * 2;
const THUMBNAIL_HEIGHT = CARD_WIDTH * 0.5;

const DEFAULT_PROMPT =
  'Modern interior design with warm lighting, elegant furniture, and natural materials';

// Preset prompt chips – tap to fill the prompt field instantly
const PRESET_PROMPTS = [
  'Modern minimalist living room, neutral tones, natural light',
  'Scandinavian bedroom, white walls, oak floors, soft linen',
  'Luxury hotel suite, marble floors, golden accents, dim mood lighting',
  'Industrial loft, exposed brick, metal beams, Edison bulbs',
  'Cozy bohemian studio, warm earthy palette, lots of plants',
  'Japandi kitchen, clean lines, warm wood, muted ceramics',
];

// Defined OUTSIDE ThreeDScreen so its reference never changes between renders
const EmptyState = () => (
  <View style={styles.emptyState}>
    <Icon name="cube-outline" size={60} color="#ddd" />
    <Text style={styles.emptyText}>No panoramas yet</Text>
    <Text style={styles.emptySubtext}>
      Capture and stitch a photosphere to get started
    </Text>
  </View>
);

export default function ThreeDScreen() {
  const [models, setModels] = useState<PanoramaItem[]>([]);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [modalPanorama, setModalPanorama] = useState<PanoramaItem | null>(null);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  useFocusEffect(
    useCallback(() => {
      loadPanoramas().then(list => {
        console.log('[3D Gallery] loadPanoramas: got', list.length, 'item(s)');
        setModels(list);
      });
    }, []),
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleOpenStageModal = useCallback((item: PanoramaItem) => {
    setPrompt(DEFAULT_PROMPT);
    setModalPanorama(item);
  }, []);

  const handleCloseModal = useCallback(() => setModalPanorama(null), []);

  const handleStage = useCallback(async () => {
    if (!modalPanorama) return;
    const pano = modalPanorama;
    setModalPanorama(null);
    setStagingId(pano.id);
    console.log(`[3D Gallery] staging id=${pano.id} prompt="${prompt}"`);

    try {
      const {stagedBase64, stagedId} = await stageWithAI(pano.imageUri, prompt);
      console.log(`[3D Gallery] staging done stagedId=${stagedId}`);
      await saveStaged(pano.id, stagedBase64);
      const updated = await loadPanoramas();
      setModels(updated);
      Alert.alert('AI Staging complete', 'Your staged panorama is ready!');
    } catch (e: any) {
      console.error('[3D Gallery] staging error:', e);
      Alert.alert(
        'Staging failed',
        e?.message ?? 'Unknown error. Check the backend is running and API keys are set.',
      );
    } finally {
      setStagingId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalPanorama, prompt]);

  // ── Card renderer ─────────────────────────────────────────────────────────
  const renderModelItem = useCallback(
    ({item}: {item: PanoramaItem}) => {
      const isStaging = stagingId === item.id;
      const displayUri = item.stagedImageUri ?? item.imageUri;

      return (
        <View style={styles.modelCard}>
          <View style={styles.modelThumbnail}>
            {displayUri ? (
              <Image
                source={{uri: displayUri}}
                style={styles.modelThumbnailImage}
                resizeMode="cover"
              />
            ) : (
              <Icon name="cube-outline" size={40} color="#6200ee" />
            )}
            {item.stagedImageUri && (
              <View style={styles.stagedBadge}>
                <Text style={styles.stagedBadgeText}>AI Staged</Text>
              </View>
            )}
          </View>

          <View style={styles.modelInfo}>
            <View style={styles.modelInfoText}>
              <Text style={styles.modelTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.modelDate}>{item.date}</Text>
            </View>

            {isStaging ? (
              <View style={styles.stagingIndicator}>
                <ActivityIndicator size="small" color="#6200ee" />
                <Text style={styles.stagingText}>Staging…</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.stageButton}
                onPress={() => handleOpenStageModal(item)}
                activeOpacity={0.7}>
                <Icon name="color-wand-outline" size={16} color="#fff" />
                <Text style={styles.stageButtonText}>
                  {item.stagedImageUri ? 'Re-stage' : 'AI Stage'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {item.stagedImageUri && (
            <TouchableOpacity
              style={styles.viewOriginalBtn}
              onPress={() =>
                Alert.alert(
                  'Image info',
                  `Original: ${item.imageUri}\n\nStaged: ${item.stagedImageUri}`,
                )
              }>
              <Text style={styles.viewOriginalText}>View file paths</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    },
    [stagingId, handleOpenStageModal],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>3D Gallery</Text>
        <TouchableOpacity>
          <Icon name="filter-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={models}
        renderItem={renderModelItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Stage modal – inlined so it's never remounted on re-render ── */}
      <Modal
        visible={!!modalPanorama}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Icon name="color-wand-outline" size={22} color="#6200ee" />
              <Text style={styles.modalTitle}>AI Interior Staging</Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <Icon name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Preset chips */}
            <Text style={styles.modalLabel}>Quick presets</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsContent}>
              {PRESET_PROMPTS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.chip,
                    prompt === p && styles.chipActive,
                  ]}
                  onPress={() => setPrompt(p)}>
                  <Text
                    style={[
                      styles.chipText,
                      prompt === p && styles.chipTextActive,
                    ]}
                    numberOfLines={1}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Custom prompt input */}
            <Text style={[styles.modalLabel, {marginTop: 14}]}>
              Or enter a custom prompt
            </Text>
            <TextInput
              style={styles.promptInput}
              value={prompt}
              onChangeText={setPrompt}
              multiline
              numberOfLines={4}
              placeholder="Describe the interior style…"
              placeholderTextColor="#aaa"
            />

            <Text style={styles.modalHint}>
              Tip: be specific — room type, style, colours, lighting, materials
            </Text>

            <TouchableOpacity
              style={[
                styles.submitButton,
                !prompt.trim() && styles.submitButtonDisabled,
              ]}
              onPress={handleStage}
              disabled={!prompt.trim()}>
              <Icon name="sparkles-outline" size={18} color="#fff" />
              <Text style={styles.submitButtonText}>
                Stage with NanoBanana AI
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f8f9fa'},

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {fontSize: 28, fontWeight: 'bold', color: '#333'},

  listContent: {padding: HORIZONTAL_PADDING, paddingBottom: 24},

  modelCard: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  modelThumbnail: {
    width: CARD_WIDTH,
    height: THUMBNAIL_HEIGHT,
    backgroundColor: '#f0f0ff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  modelThumbnailImage: {width: CARD_WIDTH, height: THUMBNAIL_HEIGHT},

  stagedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#6200ee',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stagedBadgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},

  modelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  modelInfoText: {flex: 1},
  modelTitle: {fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 2},
  modelDate: {fontSize: 12, color: '#888'},

  stageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6200ee',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 5,
  },
  stageButtonText: {color: '#fff', fontWeight: '600', fontSize: 13},

  stagingIndicator: {flexDirection: 'row', alignItems: 'center', gap: 6},
  stagingText: {fontSize: 13, color: '#6200ee', fontWeight: '500'},

  viewOriginalBtn: {paddingHorizontal: 12, paddingBottom: 10},
  viewOriginalText: {fontSize: 11, color: '#999', textDecorationLine: 'underline'},

  emptyState: {alignItems: 'center', justifyContent: 'center', paddingTop: 100},
  emptyText: {fontSize: 18, fontWeight: '600', color: '#888', marginTop: 20},
  emptySubtext: {fontSize: 14, color: '#aaa', marginTop: 5, textAlign: 'center'},

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  modalTitle: {flex: 1, fontSize: 18, fontWeight: '700', color: '#333'},
  modalLabel: {fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8},

  chipsScroll: {marginBottom: 4},
  chipsContent: {gap: 8, paddingRight: 8},
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f9f9f9',
    maxWidth: 220,
  },
  chipActive: {borderColor: '#6200ee', backgroundColor: '#f0e6ff'},
  chipText: {fontSize: 12, color: '#555'},
  chipTextActive: {color: '#6200ee', fontWeight: '600'},

  promptInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 90,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
  modalHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6200ee',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  submitButtonDisabled: {backgroundColor: '#ccc'},
  submitButtonText: {color: '#fff', fontSize: 16, fontWeight: '700'},
});
