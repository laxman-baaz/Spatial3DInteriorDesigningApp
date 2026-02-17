import React from 'react';
import {View, StyleSheet, Dimensions} from 'react-native';
import Svg, {Circle, G, Text as SvgText} from 'react-native-svg';
import {SpherePoint, projectToScreen} from '../utils/SphereMath';

const {width, height} = Dimensions.get('window');

interface Props {
  orientation: {pitch: number; yaw: number};
  points: SpherePoint[];
}

const SphereOverlay: React.FC<Props> = ({orientation, points}) => {
  const cx = width / 2;
  const cy = height / 2;

  // Center target radius matches the capture zone
  const TARGET_RADIUS = 120;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg height="100%" width="100%">
        {/* Static Center Target */}
        <Circle
          cx={cx}
          cy={cy}
          r={TARGET_RADIUS}
          stroke="white"
          strokeWidth="2"
          strokeDasharray="10, 5"
          fill="none"
          opacity={0.5}
        />
        {/* Center Crosshair dot */}
        <Circle cx={cx} cy={cy} r="4" fill="cyan" />

        {/* Floating AR Dots */}
        {points.map(point => {
          if (point.isCaptured) return null;

          // 1. PROJECT
          const {x, y, isVisible} = projectToScreen(
            orientation.pitch,
            orientation.yaw,
            point.targetPitch,
            point.targetYaw,
          );

          // 2. RENDER IF VISIBLE
          if (!isVisible) return null;

          return (
            <G key={point.id}>
              <Circle
                cx={x}
                cy={y}
                r="15"
                fill="rgba(255, 255, 255, 0.6)"
                stroke="white"
                strokeWidth="2"
              />
              <SvgText
                x={x}
                y={y + 4} // Centers vertically roughly
                fill="black"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle">
                {point.id}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
};

export default SphereOverlay;
