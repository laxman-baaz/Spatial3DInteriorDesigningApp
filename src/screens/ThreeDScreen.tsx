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
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {loadPanoramas, type PanoramaItem} from '../services/panoramaStorage';

const {width} = Dimensions.get('window');
const HORIZONTAL_PADDING = 20;
const CARD_WIDTH = width - HORIZONTAL_PADDING * 2;
const THUMBNAIL_HEIGHT = CARD_WIDTH * 0.5;

export default function ThreeDScreen() {
  const [models, setModels] = useState<PanoramaItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadPanoramas().then(list => {
        console.log('[3D Gallery] loadPanoramas: got', list.length, 'item(s)');
        setModels(list);
      });
    }, []),
  );

  const renderModelItem = ({item}: {item: PanoramaItem}) => (
    <TouchableOpacity style={styles.modelCard} activeOpacity={0.8}>
      <View style={styles.modelThumbnail}>
        {item.imageUri ? (
          <Image
            source={{uri: item.imageUri}}
            style={styles.modelThumbnailImage}
            resizeMode="cover"
          />
        ) : (
          <Icon name="cube-outline" size={40} color="#6200ee" />
        )}
      </View>
      <View style={styles.modelInfo}>
        <Text style={styles.modelTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.modelDate}>{item.date}</Text>
      </View>
    </TouchableOpacity>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="cube-outline" size={60} color="#ddd" />
      <Text style={styles.emptyText}>No models yet</Text>
      <Text style={styles.emptySubtext}>
        Scans you process will appear here
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>3D Gallery</Text>
        <TouchableOpacity>
          <Icon name="filter-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Models list - full width cards */}
      <FlatList
        data={models}
        renderItem={renderModelItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
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
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  listContent: {
    padding: HORIZONTAL_PADDING,
    paddingBottom: 24,
  },
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
  modelThumbnailImage: {
    width: CARD_WIDTH,
    height: THUMBNAIL_HEIGHT,
  },
  modelInfo: {
    padding: 12,
  },
  modelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  modelDate: {
    fontSize: 12,
    color: '#888',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#888',
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 5,
  },
});
