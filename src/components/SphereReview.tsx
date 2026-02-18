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

// Tile dimensions at 50% scale, keeping the camera's 4:3 FOV ratio (H=60°, V=45°)
const TILE_H = height * 0.9;
const TILE_W = TILE_H * (60 / 100); // width : height = fovH : fovV

const SphereReview: React.FC<Props> = ({points, orientation}) => {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* This loop renders all the photos you have already taken.
         They are "pinned" to the sky. 
      */}
      {points.map(point => {
        if (!point.captured || !point.imagePath) return null;

        const {x, y} = project3DTo2D(point, orientation, {
          width,
          height,
          fovH: 60,
          fovV: 45,
        });

        // Keep the tile as long as ANY part of it overlaps the screen
        const left = x - TILE_W / 2;
        const top = y - TILE_H / 2;
        const tileRight = left + TILE_W;
        const tileBottom = top + TILE_H;
        const onScreen =
          tileRight > 0 && left < width && tileBottom > 0 && top < height;
        if (!onScreen) return null;

        return (
          <View
            key={`photo-${point.id}`}
            style={[styles.photoTile, {left, top}]}>
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
    width: TILE_W,
    height: TILE_H,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fff',
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default SphereReview;
