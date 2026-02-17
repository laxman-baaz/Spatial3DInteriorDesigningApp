# Advanced Photo Sphere Capture System

## Overview

The app now features a **professional-grade 3D photo sphere capture system** with real-time photo preview and intuitive alignment guidance.

## Architecture

### Layer System (4 Layers)

```
┌─────────────────────────────────┐
│  LAYER 4: UI Overlay            │ ← Progress, Instructions
├─────────────────────────────────┤
│  LAYER 3: SphereOverlay         │ ← Dots, Center Circle
├─────────────────────────────────┤
│  LAYER 2: MaskedView            │ ← Dark grey + Captured photos
│  ┌─────────────────────────┐   │
│  │ SphereReview            │   │
│  │  - Captured photos      │   │
│  │  - Pinned in 3D space   │   │
│  │  - Dark background      │   │
│  └─────────────────────────┘   │
│     with Center Cutout          │
├─────────────────────────────────┤
│  LAYER 1: Camera Feed           │ ← Live camera (visible in center)
└─────────────────────────────────┘
```

## Components

### 1. **PhotosphereScreen** (Main)
- Manages camera, sensors, and capture state
- Coordinates all 4 layers
- Handles auto-capture logic

### 2. **SphereReview** (Layer 2)
- Shows captured photos pinned to their 3D positions
- Dark grey background (90% opacity)
- Photos move as device rotates (like Google Street View)
- 4:3 aspect ratio tiles

### 3. **SphereOverlay** (Layer 3)
- Renders 22 target dots using SVG
- Shows center alignment circle
- Dots change color based on state:
  - White (12px): Uncaptured
  - Blue (18px + ring): Aligned with center
  - Green (14px): Captured

### 4. **MaskedView Setup**
- Creates circular cutout in center (240px diameter)
- Shows live camera through the cutout
- Everything else shows captured photos + dark overlay

## 3D Projection System

### `projection.ts`

Converts 3D sphere coordinates (pitch, yaw) to 2D screen positions.

**Key Features:**
- Handles 0°/360° wraparound correctly
- Accounts for device orientation
- Calculates visibility within FOV
- Simple rectilinear projection

**Formula:**
```typescript
yawDiff = orientation.yaw - target.yaw
pitchDiff = target.pitch - orientation.pitch

screenX = (yawDiff / fovH) * width + width/2
screenY = (-pitchDiff / fovV) * height + height/2
```

## Sensor Fusion

### Smoothing (Exponential Moving Average)
```typescript
alpha = 0.15
smoothedPitch = prevPitch + alpha * (newPitch - prevPitch)
smoothedYaw = prevYaw + alpha * (newYaw - prevYaw)
```

**Benefits:**
- Eliminates sensor jitter
- Stable dot positioning
- Smooth photo rendering
- No bouncing artifacts

## Capture Flow

### 1. **Initial State**
```
Camera active → Sensors tracking → 22 white dots visible
Center circle shows aim point
```

### 2. **User Rotates Device**
```
Device rotates → Orientation updates → Dots move in 3D space
Captured photos appear and move with rotation
```

### 3. **Alignment Detection**
```
For each uncaptured dot:
  1. Project to 2D screen position
  2. Calculate distance from center
  3. If distance < 30px → Dot turns BLUE
  4. Auto-capture triggered
```

### 4. **Capture**
```
Photo taken → Saved with position
Dot turns GREEN → Photo appears in 3D space
Next dot alignment check continues
```

### 5. **Completion**
```
All 22 dots captured → Alert shown
Full 360° photo sphere ready for stitching
```

## 22-Dot Layout

### Distribution
```
      🔵 1 (Top, 85°)
   🔵🔵🔵🔵🔵🔵 6 (Upper, 45°)
🔵🔵🔵🔵🔵🔵🔵🔵 8 (Center, 0°)
   🔵🔵🔵🔵🔵🔵 6 (Lower, -45°)
      🔵 1 (Bottom, -85°)
```

### Coverage
- **Horizontal**: 45°-60° spacing = 50-62% overlap ✅
- **Vertical**: 40-45° spacing = 50-55% overlap ✅
- **OpenCV Requirement**: 30% minimum ✅

## User Experience

### What User Sees

1. **Live Camera** in center circle (240px)
2. **Dark grey background** everywhere else
3. **White dots** floating in 3D space showing targets
4. **Captured photos** appearing as they rotate back to them
5. **Blue dot** when aligned (ready to capture)
6. **Green dots** showing progress

### UX Benefits

✅ **See what you've captured** - Photos appear in real-time
✅ **Understand position** - Dots show where to aim next
✅ **Capture any order** - Flexible, non-linear capture
✅ **Visual feedback** - Clear color-coded states
✅ **Smooth movement** - No jitter or bouncing
✅ **Professional feel** - Like Google Street View

## Technical Details

### Camera Settings
```typescript
format: 'max' // Highest resolution
qualityPrioritization: 'quality'
flash: 'off'
enableShutterSound: true
```

### FOV Settings
```typescript
fovH: 120° // Ultra-wide horizontal
fovV: 90°  // 4:3 aspect ratio vertical
```

### Alignment Threshold
```typescript
centerDistance < 30px // Triggers capture
```

### Capture Cooldown
```typescript
1000ms // Between captures
```

### Sensor Rate
```typescript
16ms // ~60 FPS
```

## File Structure

```
src/
├── screens/
│   └── PhotosphereScreen.tsx      # Main orchestrator
├── components/
│   ├── SphereOverlay.tsx          # Dots & guides (SVG)
│   └── SphereReview.tsx           # Captured photos display
├── utils/
│   ├── SphereUtils.ts             # 22-dot grid + alignment
│   └── projection.ts              # 3D→2D projection math
└── hooks/
    └── (sensor hooks)
```

## Key Differences from Old Version

| Feature | Old | New |
|---------|-----|-----|
| Photo visibility | Hidden until done | Visible immediately |
| Background | Camera everywhere | Dark grey with cutout |
| Dot stability | Bouncing | Smooth & stable |
| Capture order | Any | Any (more flexible) |
| Visual feedback | Basic dots | Photos + dots in 3D |
| User orientation | Confusing | Clear & intuitive |

## Performance

- **Smooth 60 FPS** rendering
- **Minimal re-renders** with smoothing
- **Efficient projection** calculations
- **SVG dots** for crisp rendering
- **Lazy photo loading** (only visible photos)

## Next Steps

1. ✅ 22-dot layout implemented
2. ✅ 3D projection system working
3. ✅ Captured photos display in real-time
4. ✅ Smooth sensor fusion
5. ⏭️ Upload to backend for stitching
6. ⏭️ OpenCV panorama stitching
7. ⏭️ AI staging integration
8. ⏭️ 3D reconstruction

---

**Status**: ✅ **Advanced Capture System Complete**

The photo sphere capture experience is now on par with professional apps like Google Street View and Camera360!
