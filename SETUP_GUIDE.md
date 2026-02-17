# Setup Guide - Photo Sphere Capture App

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and update with your settings:

```bash
cp .env.example .env
```

Edit `.env` and set your backend API URL:
```
API_URL=http://your-backend-url.com/api
```

### 3. Platform-Specific Setup

#### Android Setup

1. **Open Android Studio** and sync Gradle:
```bash
cd android
./gradlew clean
cd ..
```

2. **Enable USB Debugging** on your Android device
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times to enable Developer Mode
   - Go to Settings > Developer Options
   - Enable "USB Debugging"

3. **Connect your device** and verify:
```bash
adb devices
```

4. **Run the app**:
```bash
npm run android
```

#### iOS Setup (macOS only)

1. **Install CocoaPods dependencies**:
```bash
cd ios
pod install
cd ..
```

2. **Open in Xcode** (optional, for troubleshooting):
```bash
open ios/InteriorDesigning3DApp.xcworkspace
```

3. **Connect your iPhone** via cable

4. **Run the app**:
```bash
npm run ios
```

## Testing the Camera

### On Physical Device (Recommended)

The camera and sensors work best on physical devices:

1. **Android**: Connect via USB and run `npm run android`
2. **iOS**: Connect via USB/cable and run `npm run ios`

### Permissions

On first launch, the app will request:
- ✅ Camera access
- ✅ Microphone access (required by vision-camera)
- ✅ Storage access (Android)
- ✅ Motion sensors access (iOS)

**Grant all permissions** for full functionality.

## Understanding the Photo Sphere Capture

### Capture Pattern

The app captures 16 photos in a specific pattern to create a complete sphere:

```
        Top Row (60°)
     [0°]  [90°]  [180°]  [270°]

    Upper Middle (20°)
     [0°]  [90°]  [180°]  [270°]

    Lower Middle (-20°)
     [0°]  [90°]  [180°]  [270°]

      Bottom Row (-60°)
     [0°]  [90°]  [180°]  [270°]
```

### Using the App

1. **Stand in the center** of the room you want to capture
2. **Start with Auto Mode** enabled (robot icon)
3. **Follow the on-screen guidance**:
   - White circle = target position
   - Green circle = aligned and ready
   - Progress bar shows completion
4. **Move your device** to match each target position
5. **Photo captures automatically** when aligned
6. **Complete all 16 positions** for best results

### Tips for Best Results

- 🏠 **Room Setup**: Clear obstructions from the center
- 💡 **Lighting**: Ensure good, even lighting
- 📱 **Device Stability**: Hold device steady when capturing
- 🧭 **Calibration**: Calibrate compass by moving device in figure-8 pattern
- 🔄 **Coverage**: Capture all 16 photos for complete sphere

## Troubleshooting

### Camera Issues

**Problem**: Camera not working or black screen
**Solutions**:
- Grant camera permissions in device settings
- Restart the app
- Check if camera works in other apps
- Try cleaning the build: `npm run android` or `npm run ios` again

**Problem**: "No camera device found"
**Solutions**:
- Ensure you're running on a physical device
- Camera simulators have limited support
- Check device camera hardware

### Sensor Issues

**Problem**: Orientation tracking is inaccurate
**Solutions**:
- Move device away from magnetic sources
- Calibrate compass (figure-8 motion)
- Ensure motion permissions are granted
- Sensors work better on physical devices

### Build Issues

**Android**:
```bash
cd android
./gradlew clean
./gradlew assembleDebug
cd ..
```

**iOS**:
```bash
cd ios
pod deintegrate
pod install
cd ..
```

Then rebuild the app.

### Permission Issues

**Android**: Check app permissions in Settings > Apps > 3D Interior Designing App > Permissions

**iOS**: Check app permissions in Settings > Privacy > Camera/Motion

## Development

### File Structure

```
src/
├── screens/
│   └── CameraScreen.tsx        # Main camera UI
├── hooks/
│   ├── useCameraPermissions.ts # Permission management
│   ├── useDeviceOrientation.ts # Sensor tracking
│   └── usePhotoUpload.ts       # Upload functionality
├── services/
│   └── api.ts                  # Backend API client
├── types/
│   └── index.ts                # TypeScript types
└── utils/
    └── photoSphereHelper.ts    # Photo sphere calculations
```

### Adding New Features

1. **Backend Integration**: Update `src/services/api.ts` with your endpoints
2. **UI Components**: Add new components in `src/components/`
3. **State Management**: Use React Query hooks in `src/hooks/`

### Testing Changes

```bash
# Watch mode for development
npm start

# Run on device
npm run android  # or npm run ios
```

## Next Steps

### Backend Setup

You'll need to set up a backend service to handle:

1. **Photo Upload**: Receive photos from mobile app
2. **S3 Storage**: Store photos in cloud storage
3. **Stitching Queue**: Celery worker for photo stitching
4. **AI Processing**: Integration with NanoBanana and WorldLabs APIs

Example backend endpoints needed:
- `POST /api/photos/upload` - Upload single photo
- `POST /api/photos/stitch` - Request stitching job
- `GET /api/photos/stitch/:jobId` - Check stitching status
- `POST /api/staging/process` - Request AI staging
- `POST /api/reconstruction/process` - Request 3D reconstruction

### Integration Checklist

- [ ] Set up backend API (FastAPI/Node.js)
- [ ] Configure AWS S3 for photo storage
- [ ] Set up PostgreSQL database
- [ ] Configure Redis for job queue
- [ ] Set up Celery worker for stitching
- [ ] Integrate NanoBanana API for staging
- [ ] Integrate WorldLabs API for 3D reconstruction
- [ ] Implement GLTF viewer in mobile app

## Support

For issues or questions:
1. Check the main README.md
2. Review this setup guide
3. Check React Native and Vision Camera documentation
4. Create an issue in the repository

## Resources

- [React Native Vision Camera](https://react-native-vision-camera.com/)
- [React Native Sensors](https://github.com/react-native-sensors/react-native-sensors)
- [React Query](https://tanstack.com/query/latest)
- [React Native Documentation](https://reactnative.dev/)
