import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Circle, G, Path, Text as SvgText} from 'react-native-svg';
import Animated, {useAnimatedProps} from 'react-native-reanimated';
import {project3DTo2D} from '../utils/projection';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

interface TargetPoint {
  id: number;
  pitch: number; // in degrees
  yaw: number; // in degrees
  captured: boolean;
}

interface Props {
  orientation: {pitch: number; yaw: number; roll: number};
  points: TargetPoint[];
  fovH?: number; // approx 60 degrees for most phones
  fovV?: number; // approx 45 degrees
  currentTargetId?: number;
}

const SphereOverlay: React.FC<Props> = ({
  orientation,
  points,
  fovH = 60,
  fovV = 45,
  currentTargetId = 1,
}) => {
  // Screen dimensions - using hardcoded for now, but should use hook
  const width = 360;
  const height = 640;
  const cx = width / 2;
  const cy = height / 2;
  const r = 120; // Radius of the cutout

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg height="100%" width="100%" viewBox={`0 0 ${width} ${height}`}>
        {/* Viewfinder Border */}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="white"
          strokeWidth="2"
          fill="none"
          opacity={0.8}
        />

        {points.map(point => {
          // Only show Current Active Target
          if (point.id !== currentTargetId) return null;

          const {x, y, isVisible} = project3DTo2D(point, orientation, {
            width,
            height,
            fovH,
            fovV,
          });

          if (!isVisible) return null;

          // Calculate distance from center for alignment check
          const distFromCenter = Math.sqrt(
            Math.pow(x - cx, 2) + Math.pow(y - cy, 2),
          );
          const isAligned = distFromCenter < 30; // 30px threshold

          return (
            <G key={`dot-${point.id}`} x={x} y={y}>
              <Circle
                r={isAligned ? '20' : '10'}
                fill={isAligned ? 'rgba(255, 255, 255, 0.8)' : 'white'}
                stroke="black"
                strokeWidth="1"
                opacity={0.9}
              />
              {isAligned && (
                <Circle
                  r="25"
                  stroke="white"
                  strokeWidth="2"
                  fill="none"
                  opacity={0.5}
                />
              )}
            </G>
          );
        })}

        {/* Center Guide (Reticle) */}
        <Circle cx={cx} cy={cy} r="4" fill="cyan" />
      </Svg>
    </View>
  );
};

export default SphereOverlay;
