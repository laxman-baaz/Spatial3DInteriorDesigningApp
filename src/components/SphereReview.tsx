import React from 'react';
import {View, Image, StyleSheet, Dimensions} from 'react-native';
import {project3DTo2D} from '../utils/projection';

interface TargetPoint {
  id: string | number;
  pitch: number;
  yaw: number;
  captured: boolean;
  imagePath?: string | null;
}

interface Props {
  points: TargetPoint[];
  orientation: {pitch: number; yaw: number; roll?: number};
}

const {width, height} = Dimensions.get('window');

// Size of the photo tile on screen (Adjust to match FOV roughly)
// Using larger tiles for better visibility - covering more screen area
// Increased from 300px to match device screen better
const PHOTO_SIZE = width * 0.8; // 80% of screen width

const SphereReview: React.FC<Props> = ({points, orientation}) => {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* This loop renders all the photos you have already taken.
         They are "pinned" to the sky. 
      */}
      {points.map(point => {
        if (!point.captured || !point.imagePath) return null;

        const {x, y, isVisible} = project3DTo2D(point, orientation, {
          width,
          height,
          fovH: 60,
          fovV: 45,
        });

        // Optimization: Don't render if it's way off screen
        if (!isVisible) return null;

        return (
          <View
            key={`photo-${point.id}`}
            style={[
              styles.photoTile,
              {
                left: x - PHOTO_SIZE / 2, // Center the image based on projected x
                top: y - PHOTO_SIZE / 2, // Center y
                transform: [
                  // Optional: Add slight scaling/rotation based on perspective if we had matrices
                  {scale: 1},
                ],
              },
            ]}>
            <Image
              source={{uri: point.imagePath}}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 30, 30, 0.9)', // THE DARK GREY BACKGROUND
  },
  photoTile: {
    position: 'absolute',
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fff',
    backgroundColor: '#000', // Better backing
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default SphereReview;
