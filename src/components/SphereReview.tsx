import React from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
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
  /** Match viewfinder size so captured images cover the frame with no gaps */
  viewFinderWidth?: number;
  viewFinderHeight?: number;
}

const FOV_H = 60;
const FOV_V = 45;
// Tiles drawn larger so they overlap (fewer gaps); at center we scale down so it appears viewfinder size
const OVERLAP_FACTOR = 1.35;
// Gentle perspective so tiles look like one surface, not "each stretched its own way"
const PERSPECTIVE = 520;
const CURVE_STRENGTH = 0.38;
const EDGE_SCALE = 0.96;

const SphereReview: React.FC<Props> = ({
  points,
  orientation,
  viewFinderWidth: propVfw,
  viewFinderHeight: propVfh,
}) => {
  const {width, height} = Dimensions.get('window');
  const vfw = propVfw ?? width * 0.8;
  const vfh = propVfh ?? height * 0.7;
  const photoW = vfw * OVERLAP_FACTOR;
  const photoH = vfh * OVERLAP_FACTOR;

  return (
    <View style={styles.container} pointerEvents="none">
      {points.map(point => {
        if (!point.captured || !point.imagePath) return null;

        const {x, y, isVisible, diffYaw, diffPitch} = project3DTo2D(
          {pitch: point.pitch, yaw: point.yaw},
          orientation,
          {width, height, fovH: FOV_H, fovV: FOV_V},
        );

        if (!isVisible) return null;

        const uri = point.imagePath.startsWith('file://')
          ? point.imagePath
          : `file://${point.imagePath}`;

        const angularDist = Math.sqrt(diffYaw * diffYaw + diffPitch * diffPitch);
        const normDist = Math.min(1, angularDist / (FOV_H * 0.6));

        // At center: scale down so tile appears viewfinder size. At edges: full size so tiles overlap (no gaps)
        const sizeScale = 1 / OVERLAP_FACTOR + (1 - 1 / OVERLAP_FACTOR) * normDist;
        const recedeScale = 1 - (1 - EDGE_SCALE) * normDist;
        const scale = sizeScale * recedeScale;

        const rotateY = -diffYaw * CURVE_STRENGTH;
        const rotateX = diffPitch * CURVE_STRENGTH;

        return (
          <Image
            key={`photo-${point.id}`}
            source={{uri}}
            style={[
              styles.photo,
              {
                left: x - photoW / 2,
                top: y - photoH / 2,
                width: photoW,
                height: photoH,
                transform: [
                  {perspective: PERSPECTIVE},
                  {scale},
                  {rotateY: `${rotateY}deg`},
                  {rotateX: `${rotateX}deg`},
                ],
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
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
  },
  photo: {
    position: 'absolute',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});

export default SphereReview;
