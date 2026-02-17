import React, {useState} from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

const {width} = Dimensions.get('window');
const COLUMN_COUNT = 2;
const ITEM_WIDTH = (width - 40 - (COLUMN_COUNT - 1) * 15) / COLUMN_COUNT;

interface ModelItem {
  id: string;
  title: string;
  date: string;
  thumbnail?: any;
}

// Mock data (same as Home but for gallery view)
const MOCK_MODELS: ModelItem[] = [
  {id: '1', title: 'Living Room', date: 'Oct 24, 2023'},
  {id: '2', title: 'Bedroom', date: 'Oct 23, 2023'},
  {id: '3', title: 'Kitchen', date: 'Oct 20, 2023'},
  {id: '4', title: 'Office', date: 'Oct 18, 2023'},
];

export default function ThreeDScreen() {
  const [models, setModels] = useState<ModelItem[]>(MOCK_MODELS);

  const renderModelItem = ({item}: {item: ModelItem}) => (
    <TouchableOpacity style={styles.modelCard} activeOpacity={0.8}>
      <View style={styles.modelThumbnail}>
        <Icon name="cube-outline" size={40} color="#6200ee" />
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

      {/* Models Grid */}
      <FlatList
        data={models}
        renderItem={renderModelItem}
        keyExtractor={item => item.id}
        numColumns={COLUMN_COUNT}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.columnWrapper}
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
  gridContent: {
    padding: 20,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  modelCard: {
    width: ITEM_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modelThumbnail: {
    height: ITEM_WIDTH, // Square thumbnail
    backgroundColor: '#f0f0ff',
    justifyContent: 'center',
    alignItems: 'center',
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
