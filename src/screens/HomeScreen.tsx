import React, {useState} from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Dimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

interface ScanItem {
  id: string;
  title: string;
  date: string;
}

const MOCK_SCANS: ScanItem[] = [
  {id: '1', title: 'Living Room', date: 'Oct 24, 2023'},
  {id: '2', title: 'Bedroom', date: 'Oct 23, 2023'},
  {id: '3', title: 'Kitchen', date: 'Oct 20, 2023'},
];

const {width} = Dimensions.get('window');

export default function HomeScreen({navigation}: any) {
  const [scans, setScans] = useState<ScanItem[]>(MOCK_SCANS);

  const renderScanItem = ({item}: {item: ScanItem}) => (
    <TouchableOpacity style={styles.scanItem}>
      <View style={styles.scanThumbnail}>
        <Icon name="image-outline" size={24} color="#888" />
      </View>
      <View style={styles.scanInfo}>
        <Text style={styles.scanTitle}>{item.title}</Text>
        <Text style={styles.scanDate}>{item.date}</Text>
      </View>
      <Icon name="chevron-forward" size={20} color="#ccc" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.headerTitle}>Designer</Text>
        </View>
        <TouchableOpacity style={styles.profileButton}>
          <Icon name="person" size={20} color="#333" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Main Action - New Scan */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.newScanCard}
            onPress={() => navigation.navigate('Photosphere')}
            activeOpacity={0.9}>
            <View style={styles.newScanContent}>
              <View style={styles.iconContainer}>
                <Icon name="camera" size={32} color="#fff" />
              </View>
              <View>
                <Text style={styles.newScanTitle}>New 3D Scan</Text>
                <Text style={styles.newScanSubtitle}>
                  Capture a room to start designing
                </Text>
              </View>
            </View>
            <Icon name="arrow-forward-circle" size={32} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Recent Scans Section */}
        <View style={styles.recentsContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Projects</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={scans}
            renderItem={renderScanItem}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No recent scans</Text>
              </View>
            }
          />
        </View>
      </View>
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
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
  },
  greeting: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  actionContainer: {
    marginTop: 24,
    marginBottom: 32,
  },
  newScanCard: {
    backgroundColor: '#6200ee',
    borderRadius: 24,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#6200ee',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    height: 120,
  },
  newScanContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newScanTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  newScanSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  recentsContainer: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  seeAllText: {
    fontSize: 14,
    color: '#6200ee',
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 20,
  },
  scanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  scanThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  scanInfo: {
    flex: 1,
  },
  scanTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  scanDate: {
    fontSize: 12,
    color: '#888',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#888',
  },
});
