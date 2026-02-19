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
  Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {
  loadPanoramas,
  saveStaged,
  saveWorld3D,
  type PanoramaItem,
  type World3DMeta,
} from '../services/panoramaStorage';
import {stageWithAI} from '../services/nanoBanana/nanoBananaService';
import {reconstructWorld} from '../services/worldLabs/worldLabsService';

const {width} = Dimensions.get('window');
const HORIZONTAL_PADDING = 20;
const CARD_WIDTH = width - HORIZONTAL_PADDING * 2;
const THUMBNAIL_HEIGHT = CARD_WIDTH * 0.5;

// Default: preserve the original panorama and only complete missing areas
const DEFAULT_STAGE_PROMPT =
  'Complete this 360 degree equirectangular panorama by seamlessly filling any missing or incomplete areas. Preserve every captured region exactly as photographed — do not alter colours, furniture, walls, or lighting. Only generate content for the gaps and uncaptured zones so the final image is a seamless, gap-free 360×180 degree panorama.';

// Completion presets — all start with "preserve" to avoid full restyling
const STAGE_PRESETS = [
  // ── Completion / repair (recommended) ──────────────────────────────
  'Complete this 360 degree equirectangular panorama by seamlessly filling any missing or incomplete areas. Preserve every captured region exactly as photographed — do not alter colours, furniture, walls, or lighting. Only generate content for the gaps and uncaptured zones so the final image is a seamless, gap-free 360×180 degree panorama.',
  'Fill in the missing parts of this equirectangular panorama. Keep all captured areas pixel-perfect. Seamlessly blend new content into any dark, black, or incomplete zones to produce a complete 360° interior scene.',
  // ── Light staging (preserves structure, adds polish) ───────────────
  'Lightly enhance this panorama: improve lighting and colour balance only. Do not move or replace any furniture, walls, or existing objects. Keep the room layout exactly as captured.',
  // ── Full redesign presets (changes everything) ─────────────────────
  'Redesign this interior as a modern minimalist living room — neutral tones, natural light, clean lines.',
  'Redesign this interior as a Scandinavian bedroom — white walls, oak floors, soft linen bedding.',
  'Redesign this interior as a luxury hotel suite — marble floors, golden accents, warm mood lighting.',
  'Redesign this interior as an industrial loft — exposed brick, metal beams, Edison bulbs.',
];

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

  // AI Staging state
  const [stagingId,     setStagingId]     = useState<string | null>(null);
  const [stageModal,    setStageModal]     = useState<PanoramaItem | null>(null);
  const [stagePrompt,   setStagePrompt]   = useState(DEFAULT_STAGE_PROMPT);

  // 3D Reconstruction state
  const [reconstructingId, setReconstructingId] = useState<string | null>(null);
  const [worldModal,       setWorldModal]        = useState<PanoramaItem | null>(null);
  const [worldPrompt,      setWorldPrompt]       = useState('');
  const [worldModel,       setWorldModel]        = useState<'Marble 0.1-plus' | 'Marble 0.1-mini'>('Marble 0.1-plus');

  useFocusEffect(
    useCallback(() => {
      loadPanoramas().then(list => {
        console.log('[3D Gallery] loaded', list.length, 'panorama(s)');
        setModels(list);
      });
    }, []),
  );

  // ── AI Staging handlers ───────────────────────────────────────────────────
  const openStageModal = useCallback((item: PanoramaItem) => {
    setStagePrompt(DEFAULT_STAGE_PROMPT);
    setStageModal(item);
  }, []);

  const closeStageModal = useCallback(() => setStageModal(null), []);

  const handleStage = useCallback(async () => {
    if (!stageModal) return;
    const pano = stageModal;
    setStageModal(null);
    setStagingId(pano.id);
    try {
      const {stagedBase64, stagedId} = await stageWithAI(pano.imageUri, stagePrompt);
      console.log(`[3D Gallery] staging done stagedId=${stagedId}`);
      await saveStaged(pano.id, stagedBase64);
      setModels(await loadPanoramas());
      Alert.alert('AI Staging complete', 'Your staged panorama is ready!');
    } catch (e: any) {
      Alert.alert('Staging failed', e?.message ?? 'Check backend and API keys.');
    } finally {
      setStagingId(null);
    }
  }, [stageModal, stagePrompt]);

  // ── 3D Reconstruction handlers ────────────────────────────────────────────
  const openWorldModal = useCallback((item: PanoramaItem) => {
    setWorldPrompt('');
    setWorldModel('Marble 0.1-plus');
    setWorldModal(item);
  }, []);

  const closeWorldModal = useCallback(() => setWorldModal(null), []);

  const handleReconstruct = useCallback(async () => {
    if (!worldModal) return;
    const pano = worldModal;
    setWorldModal(null);
    setReconstructingId(pano.id);

    // Prefer staged image for reconstruction
    const sourceUri = pano.stagedImageUri ?? pano.imageUri;

    console.log(
      `[3D Gallery] reconstruct id=${pano.id} model=${worldModel} src=${sourceUri}`,
    );

    try {
      const result = await reconstructWorld(
        sourceUri,
        pano.title,
        worldPrompt,
        worldModel,
      );

      const meta: World3DMeta = {
        worldId:         result.worldId,
        marbleUrl:       result.marbleUrl,
        thumbnailUrl:    result.thumbnailUrl,
        caption:         result.caption,
        panoUrl:         result.panoUrl,
        spzUrl100k:      result.spzUrl100k,
        spzUrl500k:      result.spzUrl500k,
        spzUrlFull:      result.spzUrlFull,
        colliderMeshUrl: result.colliderMeshUrl,
      };

      await saveWorld3D(pano.id, meta);
      setModels(await loadPanoramas());

      Alert.alert(
        '3D World ready!',
        `Your interactive world is ready in Marble.\n\n${result.caption ?? ''}`,
        [
          {text: 'Open in Marble', onPress: () => Linking.openURL(result.marbleUrl)},
          {text: 'Later', style: 'cancel'},
        ],
      );
    } catch (e: any) {
      console.error('[3D Gallery] reconstruct error:', e);
      Alert.alert(
        '3D Reconstruction failed',
        e?.message ?? 'Check backend and WORLDLABS_API_KEY.',
      );
    } finally {
      setReconstructingId(null);
    }
  }, [worldModal, worldPrompt, worldModel]);

  // ── Card renderer ─────────────────────────────────────────────────────────
  const renderModelItem = useCallback(
    ({item}: {item: PanoramaItem}) => {
      const isStaging       = stagingId       === item.id;
      const isReconstructing = reconstructingId === item.id;
      const displayUri = item.stagedImageUri ?? item.imageUri;
      const world      = item.world3d;

      return (
        <View style={styles.modelCard}>
          {/* Thumbnail */}
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
              <View style={styles.badge}>
                <Text style={styles.badgeText}>AI Staged</Text>
              </View>
            )}
            {world && (
              <View style={[styles.badge, styles.badge3D]}>
                <Icon name="cube" size={10} color="#fff" />
                <Text style={styles.badgeText}> 3D</Text>
              </View>
            )}
          </View>

          {/* Info + action row */}
          <View style={styles.modelInfo}>
            <View style={styles.modelInfoText}>
              <Text style={styles.modelTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.modelDate}>{item.date}</Text>
            </View>

            {/* AI Stage button */}
            {isStaging ? (
              <View style={styles.spinnerRow}>
                <ActivityIndicator size="small" color="#6200ee" />
                <Text style={styles.spinnerText}>Staging…</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openStageModal(item)}
                activeOpacity={0.7}>
                <Icon name="color-wand-outline" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>
                  {item.stagedImageUri ? 'Re-stage' : 'AI Stage'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 3D World row */}
          <View style={styles.worldRow}>
            {isReconstructing ? (
              <View style={styles.spinnerRow}>
                <ActivityIndicator size="small" color="#00897b" />
                <Text style={[styles.spinnerText, {color: '#00897b'}]}>
                  Generating 3D world…
                </Text>
              </View>
            ) : world ? (
              <View style={styles.worldResultRow}>
                <Icon name="checkmark-circle" size={16} color="#00897b" />
                <Text style={styles.worldReadyText} numberOfLines={1}>
                  {world.caption ?? 'World ready'}
                </Text>
                <TouchableOpacity
                  style={styles.marbleBtn}
                  onPress={() => Linking.openURL(world.marbleUrl)}>
                  <Icon name="open-outline" size={13} color="#fff" />
                  <Text style={styles.marbleBtnText}>Open</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.marbleBtn, {backgroundColor: '#555'}]}
                  onPress={() => openWorldModal(item)}>
                  <Icon name="refresh-outline" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.generate3DBtn}
                onPress={() => openWorldModal(item)}
                activeOpacity={0.7}>
                <Icon name="cube-outline" size={14} color="#fff" />
                <Text style={styles.generate3DBtnText}>Generate 3D World</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Asset links (collapsed if no world) */}
          {world && (
            <View style={styles.assetLinks}>
              {world.spzUrl500k && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(world.spzUrl500k!)}>
                  <Text style={styles.assetLink}>SPZ 500k</Text>
                </TouchableOpacity>
              )}
              {world.colliderMeshUrl && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(world.colliderMeshUrl!)}>
                  <Text style={styles.assetLink}>GLB mesh</Text>
                </TouchableOpacity>
              )}
              {world.panoUrl && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(world.panoUrl!)}>
                  <Text style={styles.assetLink}>Pano</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      );
    },
    [stagingId, reconstructingId, openStageModal, openWorldModal],
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

      {/* ── AI Stage Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={!!stageModal}
        transparent
        animationType="slide"
        onRequestClose={closeStageModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Icon name="color-wand-outline" size={22} color="#6200ee" />
              <Text style={styles.modalTitle}>AI Interior Staging</Text>
              <TouchableOpacity onPress={closeStageModal}>
                <Icon name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Quick presets</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsContent}>
              {STAGE_PRESETS.map((p, i) => {
                const isCompletion = i <= 1;
                const isActive = stagePrompt === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.chip,
                      isCompletion && styles.chipCompletion,
                      isActive && (isCompletion ? styles.chipCompletionActive : styles.chipActive),
                    ]}
                    onPress={() => setStagePrompt(p)}>
                    <Text
                      style={[
                        styles.chipText,
                        isCompletion && styles.chipTextCompletion,
                        isActive && styles.chipTextActive,
                      ]}
                      numberOfLines={1}>
                      {isCompletion ? '✦ ' : ''}{p.slice(0, 40)}…
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={[styles.modalLabel, {marginTop: 14}]}>
              Or enter a custom prompt
            </Text>
            <TextInput
              style={styles.promptInput}
              value={stagePrompt}
              onChangeText={setStagePrompt}
              multiline
              numberOfLines={4}
              placeholder="Describe the interior style…"
              placeholderTextColor="#aaa"
            />
            <Text style={styles.modalHint}>
              Use a <Text style={{fontWeight:'700', color:'#6200ee'}}>Completion</Text> preset to fill missing areas while keeping your photos unchanged.{'\n'}
              Use a <Text style={{fontWeight:'700', color:'#c62828'}}>Redesign</Text> preset to fully replace the interior style.
            </Text>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                !stagePrompt.trim() && styles.submitBtnDisabled,
              ]}
              onPress={handleStage}
              disabled={!stagePrompt.trim()}>
              <Icon name="sparkles-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Stage with NanoBanana AI</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 3D Reconstruction Modal ────────────────────────────────────── */}
      <Modal
        visible={!!worldModal}
        transparent
        animationType="slide"
        onRequestClose={closeWorldModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Icon name="cube-outline" size={22} color="#00897b" />
              <Text style={[styles.modalTitle, {color: '#00897b'}]}>
                Generate 3D World
              </Text>
              <TouchableOpacity onPress={closeWorldModal}>
                <Icon name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Model picker */}
            <Text style={styles.modalLabel}>Quality / Speed</Text>
            <View style={styles.modelPickerRow}>
              {(['Marble 0.1-plus', 'Marble 0.1-mini'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.modelChip,
                    worldModel === m && styles.modelChipActive,
                  ]}
                  onPress={() => setWorldModel(m)}>
                  <Icon
                    name={m === 'Marble 0.1-plus' ? 'diamond-outline' : 'flash-outline'}
                    size={14}
                    color={worldModel === m ? '#fff' : '#00897b'}
                  />
                  <Text
                    style={[
                      styles.modelChipText,
                      worldModel === m && styles.modelChipTextActive,
                    ]}>
                    {m === 'Marble 0.1-plus' ? 'Plus (~5 min)' : 'Mini (~45s)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Optional text hint */}
            <Text style={[styles.modalLabel, {marginTop: 14}]}>
              Optional scene description
            </Text>
            <TextInput
              style={[styles.promptInput, {minHeight: 60}]}
              value={worldPrompt}
              onChangeText={setWorldPrompt}
              placeholder="e.g. modern living room with oak floors"
              placeholderTextColor="#aaa"
            />

            <Text style={styles.modalHint}>
              WorldLabs Marble outputs SPZ (3D Gaussian Splat) + GLB mesh.{'\n'}
              View the navigable world at marble.worldlabs.ai.
            </Text>

            <TouchableOpacity
              style={[styles.submitBtn, {backgroundColor: '#00897b'}]}
              onPress={handleReconstruct}>
              <Icon name="cube-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Generate 3D World</Text>
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

  // Card
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

  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6200ee',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badge3D: {backgroundColor: '#00897b', right: 10, top: 38},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},

  modelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  modelInfoText: {flex: 1},
  modelTitle: {fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 2},
  modelDate:  {fontSize: 12, color: '#888'},

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6200ee',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 4,
  },
  actionBtnText: {color: '#fff', fontWeight: '600', fontSize: 12},

  spinnerRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  spinnerText: {fontSize: 12, color: '#6200ee', fontWeight: '500'},

  // 3D world row
  worldRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  generate3DBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00897b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    gap: 5,
  },
  generate3DBtnText: {color: '#fff', fontWeight: '600', fontSize: 13},

  worldResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  worldReadyText: {flex: 1, fontSize: 12, color: '#333'},
  marbleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00897b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 3,
  },
  marbleBtnText: {color: '#fff', fontSize: 11, fontWeight: '600'},

  assetLinks: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  assetLink: {
    fontSize: 11,
    color: '#00897b',
    textDecorationLine: 'underline',
  },

  // Empty state
  emptyState: {alignItems: 'center', justifyContent: 'center', paddingTop: 100},
  emptyText: {fontSize: 18, fontWeight: '600', color: '#888', marginTop: 20},
  emptySubtext: {fontSize: 14, color: '#aaa', marginTop: 5, textAlign: 'center'},

  // Modal shared
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
  chipCompletion: {borderColor: '#00897b', backgroundColor: '#e0f2f1'},
  chipCompletionActive: {borderColor: '#00897b', backgroundColor: '#00897b'},
  chipText: {fontSize: 12, color: '#555'},
  chipTextCompletion: {color: '#00897b', fontWeight: '600'},
  chipTextActive: {color: '#fff', fontWeight: '700'},

  modelPickerRow: {flexDirection: 'row', gap: 10, marginBottom: 4},
  modelChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#00897b',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#fff',
  },
  modelChipActive: {backgroundColor: '#00897b'},
  modelChipText: {fontSize: 13, color: '#00897b', fontWeight: '600'},
  modelChipTextActive: {color: '#fff'},

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
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6200ee',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  submitBtnDisabled: {backgroundColor: '#ccc'},
  submitBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
});
