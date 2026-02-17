# 3D Interior Designing App - Photo Sphere Capture

A React Native mobile application that captures 360° photo spheres using ultra-wide camera and device sensors, for AI-powered 3D interior reconstruction.

## Features

- 📷 **Ultra-Wide Camera Access**: Automatically uses ultra-wide lens if available
- 🧭 **Device Orientation Tracking**: Real-time azimuth, pitch, and roll detection
- 🎯 **Guided Photo Capture**: Visual guides help align device for optimal photo sphere coverage
- 🤖 **Auto-Capture Mode**: Automatically captures photos when device is properly aligned
- 📊 **Progress Tracking**: Visual feedback showing capture progress (16 photos)
- 🔄 **Session Management**: Reset and restart capture sessions

## Architecture

```
Mobile [React Native App]
    ↓
Capture 16 Ultra-wide Photos
  - react-native-vision-camera
  - react-native-sensors
  - axios
  - @tanstack/react-query
    ↓
Upload to Backend (FastAPI / Node)
  - PostgreSQL
  - Redis
  - AWS S3
    ↓
[Stitching Service]
 - Python
  - OpenCV
  - Celery
    ↓
360° Equirectangular Panorama
    ↓
[AI Staging Engine]
  - NanoBanana API
    ↓
New Staged 360° Image
    ↓
[3D Reconstruction Engine]
  - WorldLabs API
    ↓
GLTF / 3D Scene Output
    ↓
[Storage]
  - S3 + CloudFront
    ↓
Mobile Viewer
  - react-three-fiber
  - GLTFLoader
  - Expo GL
```

## Prerequisites

- Node.js >= 18
- React Native development environment set up
  - For Android: Android Studio with SDK
  - For iOS: Xcode (macOS only)
- Physical device recommended (sensors work better on real devices)

## Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd InteriorDesigning3DApp
```

2. **Install dependencies**
```bash
npm install
```

3. **iOS Setup** (macOS only)
```bash
cd ios
pod install
cd ..
```

4. **Run the app**

For Android:
```bash
npm run android
```

For iOS:
```bash
npm run ios
```

## Photo Sphere Capture Guide

The app captures 16 photos in a systematic pattern to create a complete 360° sphere:

### Capture Pattern
- **4 rows** at different elevation angles: 60°, 20°, -20°, -60°
- **4 columns** at different azimuth angles: 0°, 90°, 180°, 270°

### How to Capture

1. **Auto Mode (Recommended)**:
   - The app automatically captures photos when you align your device
   - Follow the on-screen guidance to move your device
   - Green indicator shows when aligned
   - Photo is captured automatically after 0.5s of stable alignment

2. **Manual Mode**:
   - Tap "Manual" button to switch modes
   - Align device with target position
   - Tap capture button to take photo

3. **Best Practices**:
   - Stand in the center of the room
   - Keep steady when capturing
   - Ensure good lighting
   - Capture all 16 positions for best results

## Project Structure

```
InteriorDesigning3DApp/
├── src/
│   ├── screens/
│   │   └── CameraScreen.tsx       # Main camera interface
│   ├── hooks/
│   │   ├── useCameraPermissions.ts # Camera permission management
│   │   └── useDeviceOrientation.ts # Sensor-based orientation tracking
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   └── utils/
│       └── photoSphereHelper.ts    # Photo sphere calculation utilities
├── android/                         # Android native code
├── ios/                            # iOS native code
└── App.tsx                         # App entry point
```

## Key Dependencies

- **react-native-vision-camera**: High-performance camera library with ultra-wide support
- **react-native-sensors**: Access to device accelerometer, gyroscope, and magnetometer
- **@tanstack/react-query**: Powerful data fetching and state management
- **axios**: HTTP client for API communication

## Permissions

### Android
- `CAMERA`: Capture photos
- `RECORD_AUDIO`: Required by vision-camera (not used for audio)
- `WRITE_EXTERNAL_STORAGE`: Save photos
- `READ_EXTERNAL_STORAGE`: Access saved photos

### iOS
- `NSCameraUsageDescription`: Capture photos
- `NSMicrophoneUsageDescription`: Required by vision-camera
- `NSMotionUsageDescription`: Track device orientation
- `NSPhotoLibraryUsageDescription`: Access photo library
- `NSPhotoLibraryAddUsageDescription`: Save photos

## Next Steps

1. **Backend Integration**: Connect to FastAPI/Node backend for photo upload
2. **Photo Stitching**: Implement or integrate with stitching service
3. **AI Staging**: Integration with NanoBanana API
4. **3D Reconstruction**: Integration with WorldLabs API
5. **3D Viewer**: Implement GLTF viewer with react-three-fiber

## Troubleshooting

### Camera not working
- Ensure permissions are granted in device settings
- Restart the app after granting permissions
- Try on a physical device (simulator has limited camera support)

### Sensor data inaccurate
- Calibrate device compass (figure-8 motion)
- Sensors work better on physical devices
- Ensure device is not near magnetic interference

### Build errors
- Run `npm install` again
- For iOS: `cd ios && pod install && cd ..`
- Clean build: 
  - Android: `cd android && ./gradlew clean && cd ..`
  - iOS: Clean build folder in Xcode

## Contributing

Contributions are welcome! Please follow the existing code style and add tests for new features.

## License

[Add your license here]
