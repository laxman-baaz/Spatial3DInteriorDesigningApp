# Camera Features & Implementation

## Overview

The photo sphere capture feature is now fully implemented! This document explains what was built and how it works.

## What's Been Implemented

### ✅ Core Features

1. **Camera Access**
   - Ultra-wide angle camera support (automatic fallback to wide-angle)
   - High-quality photo capture
   - Real-time camera preview

2. **Device Orientation Tracking**
   - Real-time azimuth (compass direction: 0-360°)
   - Real-time pitch (up/down tilt: -180° to 180°)
   - Real-time roll (left/right rotation: -180° to 180°)
   - Sensor fusion from accelerometer and magnetometer

3. **Guided Photo Capture**
   - 16-position photo sphere pattern (4x4 grid)
   - Visual alignment indicators
   - Target position guidance
   - Alignment scoring system
   - Auto-capture when aligned

4. **User Interface**
   - Progress tracking (X/16 photos)
   - Progress bar visualization
   - Photo grid preview (shows captured photos)
   - Real-time orientation display
   - Alignment feedback (visual + text)

5. **Capture Modes**
   - **Auto Mode**: Automatically captures when aligned (recommended)
   - **Manual Mode**: Tap to capture button control

6. **Session Management**
   - Session ID generation
   - Photo metadata tracking (position, orientation, timestamp)
   - Reset/restart functionality

### ✅ Technical Implementation

#### Components & Files

```
src/
├── screens/
│   └── CameraScreen.tsx              # Main camera UI (280+ lines)
│       - Camera preview with overlay
│       - Alignment indicators
│       - Capture controls
│       - Progress tracking
│
├── hooks/
│   ├── useCameraPermissions.ts       # Permission management
│   │   - Check permission status
│   │   - Request permissions (iOS + Android)
│   │   - Permission UI feedback
│   │
│   ├── useDeviceOrientation.ts       # Real-time sensor data
│   │   - Accelerometer for pitch/roll
│   │   - Magnetometer for azimuth
│   │   - 100ms update interval
│   │
│   └── usePhotoUpload.ts             # Upload functionality (React Query)
│       - Upload progress tracking
│       - Error handling
│       - Success callbacks
│
├── services/
│   └── api.ts                        # Backend API client
│       - Photo upload endpoint
│       - Stitching request endpoint
│       - AI staging endpoint
│       - 3D reconstruction endpoint
│       - Status polling endpoints
│
├── types/
│   └── index.ts                      # TypeScript definitions
│       - CapturedPhoto interface
│       - DeviceOrientation interface
│       - PhotoSphereSession interface
│       - CameraPermissionStatus type
│
└── utils/
    └── photoSphereHelper.ts          # Photo sphere calculations
        - 16-position coordinate system
        - Alignment detection algorithm
        - Angle difference calculation
        - Alignment scoring (0-100)
```

## How the Photo Sphere Capture Works

### 1. Capture Pattern

Photos are captured in a systematic 4x4 grid pattern:

```
Elevation Angles: 60°, 20°, -20°, -60° (top to bottom)
Azimuth Angles: 0°, 90°, 180°, 270° (N, E, S, W)

      NORTH (0°)
         ↑
         |
WEST ←  ⊕  → EAST
(270°)  |  (90°)
         |
         ↓
     SOUTH (180°)

Position 1:  Azimuth 0°,   Pitch 60°  (looking up north)
Position 2:  Azimuth 90°,  Pitch 60°  (looking up east)
...
Position 16: Azimuth 270°, Pitch -60° (looking down west)
```

### 2. Alignment Detection

The app uses a tolerance-based alignment system:

- **Azimuth Tolerance**: ±15° (configurable)
- **Pitch Tolerance**: ±15° (configurable)

When device orientation is within tolerance of target:
- Alignment indicator turns green
- Auto-capture countdown starts (500ms delay)
- Photo is captured automatically (if auto mode enabled)

### 3. Alignment Scoring

Real-time alignment score (0-100%) calculated by:
```typescript
azimuthScore = max(0, 100 - (azimuthDiff / TOLERANCE) * 100)
pitchScore = max(0, 100 - (pitchDiff / TOLERANCE) * 100)
finalScore = min(azimuthScore, pitchScore)
```

Visual feedback bar shows alignment quality.

### 4. Photo Metadata

Each captured photo stores:
```typescript
{
  uri: string;              // File path to photo
  timestamp: number;        // Unix timestamp
  position: number;         // 1-16 sequence number
  orientation: {
    azimuth: number;        // Compass direction
    pitch: number;          // Up/down angle
    roll: number;           // Device rotation
  }
}
```

This metadata is crucial for the stitching algorithm.

## Sensor Calibration

### Magnetometer (Compass)
To improve accuracy, users should calibrate by:
1. Moving device in figure-8 pattern
2. Rotating device in all directions
3. Away from magnetic interference (speakers, magnets, metal)

### Accelerometer
Automatically calibrates. Works best when:
- Device is hand-held (not mounted)
- No excessive shaking
- User moves smoothly between positions

## Usage Guide

### For End Users

1. **Start the App**
   - Grant camera and motion permissions when prompted
   - Camera preview appears automatically

2. **Position Yourself**
   - Stand in the center of the room
   - Hold device at eye level
   - Ensure 360° visibility around you

3. **Capture Photos**
   - **Auto Mode** (default):
     - Move device to match on-screen target
     - White circle shows target position
     - When aligned, circle turns green
     - Photo captures automatically after 0.5s
   - **Manual Mode**:
     - Toggle "Manual" button
     - Align device
     - Tap capture button

4. **Complete the Sphere**
   - Capture all 16 positions
   - Progress bar shows completion
   - Grid preview shows captured photos
   - Alert appears when complete

5. **Review or Reset**
   - Review: Check photo count and grid
   - Reset: Tap "Reset" to start over

### For Developers

#### Testing Camera Features

```bash
# Run on Android device
npm run android

# Run on iOS device
npm run ios

# View logs
# Android
adb logcat | grep "ReactNative"

# iOS
# Use Xcode console
```

#### Customizing Capture Pattern

Edit `src/utils/photoSphereHelper.ts`:

```typescript
// Change number of photos
export const PHOTO_SPHERE_POSITIONS = [
  { row: 0, col: 0, targetAzimuth: 0, targetPitch: 60 },
  // Add or remove positions
];

// Change tolerance
export const TOLERANCE_AZIMUTH = 20; // degrees
export const TOLERANCE_PITCH = 20;   // degrees
```

#### Customizing UI

Edit `src/screens/CameraScreen.tsx`:

```typescript
// Change auto-capture delay
setTimeout(() => {
  capturePhoto();
}, 1000); // Change from 500ms to 1000ms

// Change alignment indicator size
alignmentIndicator: {
  width: 250, // Change from 200
  height: 250,
}
```

## Performance Considerations

### Sensor Update Rate
- Current: 100ms (10 Hz)
- Can be adjusted in `useDeviceOrientation.ts`
- Lower interval = more responsive, higher battery usage

### Photo Quality
- Current: `qualityPrioritization: 'quality'`
- Alternatives: `'balanced'`, `'speed'`
- Higher quality = larger files, slower capture

### Memory Management
- Photos stored as file paths (not in memory)
- Up to 16 photos per session
- Reset session to free up storage

## Next Steps

### Backend Integration

1. **Set Backend URL**
   ```
   # .env file
   API_URL=http://your-backend.com/api
   ```

2. **Upload Photos After Capture**
   ```typescript
   import { usePhotoUpload } from './hooks/usePhotoUpload';
   
   const { upload, isUploading } = usePhotoUpload();
   
   // After capturing all photos
   upload({
     photos: capturedPhotos,
     sessionId: sessionId,
     onProgress: (progress) => {
       console.log(`${progress.percentage}% complete`);
     }
   });
   ```

3. **Request Stitching**
   ```typescript
   import { requestStitching } from './services/api';
   
   const result = await requestStitching(sessionId);
   console.log('Job ID:', result.jobId);
   ```

### Features to Add

- [ ] Upload progress UI
- [ ] Preview captured photos (thumbnail grid)
- [ ] Delete individual photos
- [ ] Save session to local storage
- [ ] Resume interrupted sessions
- [ ] Multiple room sessions
- [ ] Photo quality settings
- [ ] Compass calibration wizard
- [ ] Tutorial/onboarding flow
- [ ] Offline mode with sync

## Troubleshooting

### Camera Issues
**Problem**: Black screen or no camera
**Solution**: 
- Check permissions granted
- Restart app
- Test on physical device (not simulator)

### Sensor Issues
**Problem**: Orientation not updating
**Solution**:
- Check motion permissions (iOS)
- Calibrate magnetometer (figure-8)
- Move away from magnetic sources

### Alignment Issues
**Problem**: Difficult to align with target
**Solution**:
- Increase tolerance values
- Add visual grid guides
- Implement snap-to-target feature

## Resources

- **React Native Vision Camera**: https://react-native-vision-camera.com/
- **React Native Sensors**: https://github.com/react-native-sensors/react-native-sensors
- **Photo Sphere Stitching**: OpenCV documentation
- **3D Reconstruction**: WorldLabs API docs

## Support

Questions or issues? Check:
1. README.md - Project overview
2. SETUP_GUIDE.md - Installation & setup
3. This file - Feature documentation
4. GitHub issues - Known problems
