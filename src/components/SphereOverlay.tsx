import React from 'react';
import {Dimensions, StyleSheet, View} from 'react-native';
import Svg, {Circle, G, Rect} from 'react-native-svg';
import {project3DTo2D} from '../utils/projection';

interface TargetPoint {
  id: number;
  pitch: number; // in degrees
  yaw: number; // in degrees
  captured: boolean;
}

const FOV_H = 60;
const FOV_V = 45;

interface Props {
  orientation: {pitch: number; yaw: number; roll: number};
  points: TargetPoint[];
  width?: number;
  height?: number;
  fovH?: number;
  fovV?: number;
  /** Viewfinder size: width and height (e.g. 80% and 70% of screen). */
  viewFinderWidth?: number;
  viewFinderHeight?: number;
  /** Px distance from center to show "aligned" (green). Should match capture threshold. */
  alignThresholdPx?: number;
}

const SphereOverlay: React.FC<Props> = ({
  orientation,
  points,
  width: propWidth,
  height: propHeight,
  fovH = FOV_H,
  fovV = FOV_V,
  viewFinderWidth: propVfw,
  viewFinderHeight: propVfh,
  alignThresholdPx = 20,
}) => {
  const {width: dimWidth, height: dimHeight} = Dimensions.get('window');
  const width = propWidth ?? dimWidth;
  const height = propHeight ?? dimHeight;
  const cx = width / 2;
  const cy = height / 2;
  const vfw = propVfw ?? width * 0.8;
  const vfh = propVfh ?? height * 0.7;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg height="100%" width="100%" viewBox={`0 0 ${width} ${height}`}>
        {/* Viewfinder Border (dynamic width × height, centered) */}
        <Rect
          x={cx - vfw / 2}
          y={cy - vfh / 2}
          width={vfw}
          height={vfh}
          rx="16"
          ry="16"
          stroke="white"
          strokeWidth="2"
          fill="none"
          opacity={0.8}
        />

        {points.map(point => {
          // Skip captured dots
          if (point.captured) return null;

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
          const isAligned = distFromCenter < alignThresholdPx;

          return (
            <G key={`dot-${point.id}`} x={x} y={y}>
              <Circle
                r={isAligned ? '20' : '15'}
                fill="#00FF00"
                stroke="black"
                strokeWidth="1"
                opacity={0.8}
              />
              {isAligned && (
                <Circle
                  r="25"
                  stroke="#00FF00"
                  strokeWidth="3"
                  fill="none"
                  opacity={0.6}
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
