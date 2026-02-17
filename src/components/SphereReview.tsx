import React from 'react';
import {View, Image, StyleSheet, Dimensions} from 'react-native';
import {SpherePoint, projectToScreen} from '../utils/SphereMath';

const {width, height} = Dimensions.get('window');

interface Props {
  orientation: {pitch: number; yaw: number};
  points: SpherePoint[];
}

const SphereReview: React.FC<Props> = ({orientation, points}) => {
  // Size of the photo tile.
  // Should ideally overlap to form a continuous image.
  // Using 300 to cover the 240 masked hole + some overlap.
  const TILE_SIZE = 300;
  const HALF_TILE = TILE_SIZE / 2;

  return (
    <View style={StyleSheet.absoluteFill}>
      {points.map(point => {
        // Only show captured points
        if (!point.isCaptured || !point.imagePath) return null;

        // 1. PROJECT
        const {x, y, isVisible} = projectToScreen(
          orientation.pitch,
          orientation.yaw,
          point.targetPitch,
          point.targetYaw,
        );

        // 2. RENDER IF VISIBLE
        // Ensure "isVisible" logic in SphereMath is generous enough for review
        if (!isVisible) return null;

        return (
          <Image
            key={point.id}
            source={{uri: point.imagePath}}
            style={[
              styles.tile,
              {
                width: TILE_SIZE,
                height: TILE_SIZE,
                left: x - HALF_TILE,
                top: y - HALF_TILE,
              },
            ]}
            resizeMode="cover"
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});

export default SphereReview;
