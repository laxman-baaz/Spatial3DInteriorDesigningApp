# 22-Dot Photo Sphere Layout

## Visual Layout (Natural Sphere Pattern)

```
               🔵 1 DOT
              (Top 85°)
               
        🔵  🔵  🔵  🔵  🔵  🔵
         6 DOTS (Upper Ring 45°)
       Spacing: 60° (0°,60°,120°,180°,240°,300°)
       
    🔵  🔵  🔵  🔵  🔵  🔵  🔵  🔵
       8 DOTS (Center Equator 0°)
    Spacing: 45° (0°,45°,90°,135°,180°,225°,270°,315°)
    
        🔵  🔵  🔵  🔵  🔵  🔵
         6 DOTS (Lower Ring -45°)
       Spacing: 60° (0°,60°,120°,180°,240°,300°)
       
               🔵 1 DOT
             (Bottom -85°)
```

## Total: 22 Photos

### Coverage & Overlap

For **4:3 aspect ratio** with **ultra-wide camera (~120° H-FOV, ~90° V-FOV)**:

#### Horizontal Overlap:
- **Center ring (8 dots)**: 45° spacing → **~62% overlap** ✅
- **Upper/Lower rings (6 dots each)**: 60° spacing → **~50% overlap** ✅

#### Vertical Overlap:
- Top → Upper: 85° to 45° = 40° spacing → **~55% overlap** ✅
- Upper → Center: 45° to 0° = 45° spacing → **~50% overlap** ✅
- Center → Lower: 0° to -45° = 45° spacing → **~50% overlap** ✅
- Lower → Bottom: -45° to -85° = 40° spacing → **~55% overlap** ✅

**All overlaps exceed OpenCV's 30% minimum requirement!** 🎉

---

## Capture Sequence

The app will guide you through all 22 positions **in order**:

### Position 1: Top Zenith
- Pitch: 85° (look almost straight up)
- Yaw: 0° (any direction works)

### Positions 2-7: Upper Ring
1. Pitch: 45°, Yaw: 0° (Northeast)
2. Pitch: 45°, Yaw: 60° (East-Northeast)
3. Pitch: 45°, Yaw: 120° (East-Southeast)
4. Pitch: 45°, Yaw: 180° (Southeast)
5. Pitch: 45°, Yaw: 240° (Southwest)
6. Pitch: 45°, Yaw: 300° (Northwest)

### Positions 8-15: Center Equator
1. Pitch: 0°, Yaw: 0° (North)
2. Pitch: 0°, Yaw: 45° (Northeast)
3. Pitch: 0°, Yaw: 90° (East)
4. Pitch: 0°, Yaw: 135° (Southeast)
5. Pitch: 0°, Yaw: 180° (South)
6. Pitch: 0°, Yaw: 225° (Southwest)
7. Pitch: 0°, Yaw: 270° (West)
8. Pitch: 0°, Yaw: 315° (Northwest)

### Positions 16-21: Lower Ring
1. Pitch: -45°, Yaw: 0°
2. Pitch: -45°, Yaw: 60°
3. Pitch: -45°, Yaw: 120°
4. Pitch: -45°, Yaw: 180°
5. Pitch: -45°, Yaw: 240°
6. Pitch: -45°, Yaw: 300°

### Position 22: Bottom Nadir
- Pitch: -85° (look almost straight down)
- Yaw: 0° (any direction works)

---

## UI Improvements

### All Dots Visible
- **ALL 22 dots** are shown on screen at once
- Dots move naturally as you rotate the device
- Easy to see where you need to go next

### Color Coding
- **⚪ White (24px)**: Uncaptured position
- **🔵 Blue (36px)**: Current target - GO HERE!
- **🟢 Green (28px)**: Already captured

### Visual Feedback
- **Blue dot pulses** with a ring animation
- **Larger size** for current target (36px vs 24px)
- **Glowing shadow** on current target
- **Progress bar** at top shows completion

### Alignment Made Easy
- **Center crosshair** shows where camera is pointing
- **Move device** to bring blue dot to center
- **Auto-capture** when aligned within 3° (more lenient)
- **Poles (top/bottom)** are even more forgiving (5° tolerance)

---

## How to Use

1. **Start the app** → Camera opens with all 22 dots visible
2. **Find the blue dot** → This is your current target
3. **Rotate device** → Bring blue dot toward center crosshair
4. **Align crosshair with blue dot** → Auto-capture triggers!
5. **Blue turns green** → Move to next blue dot
6. **Repeat** until all 22 are green 🎉

---

## Technical Details

### Sensitivity
- **SENSITIVITY = 15**: Each degree = 15 pixels of movement
- Provides natural 1:1 feeling when rotating device
- Adjust in `SphereUtils.ts` if needed (lower = less sensitive)

### Capture Trigger Threshold
- **Standard positions**: Within 3° of target (pitch & yaw)
- **Top/Bottom poles**: Within 5° of pitch (yaw ignored)
- **Auto-capture**: Immediate when threshold met

### Screen Coordinate Mapping
- Handles 0°/360° wraparound correctly
- Shortest angular path calculation
- Screen Y inverted (grows downward)
- Dots hidden when off-screen (100px margin)

---

## Advantages of This Layout

1. ✅ **Natural pattern** - Easy to understand and follow
2. ✅ **Complete coverage** - No gaps in the sphere
3. ✅ **Optimal overlap** - 50%+ for perfect stitching
4. ✅ **Efficient capture** - Only 22 photos needed
5. ✅ **Industry standard** - Similar to Google Camera
6. ✅ **All dots visible** - See exactly where to go
7. ✅ **Clear progression** - Green trail shows progress

---

## Comparison: Old vs New

### Old Setup (Was using)
- 30 dots total (1+8+12+8+1)
- Only 1 moving dot visible
- Hard to find target
- Confusing progression
- Too many photos

### New Setup (Now using)
- **22 dots total (1+6+8+6+1)** ✅
- **All 22 dots visible** ✅
- **Easy to find target (blue)** ✅
- **Clear progression (green trail)** ✅
- **Optimal photo count** ✅

---

## Quick Reference

| Layer | Dots | Pitch | Yaw Spacing | Purpose |
|-------|------|-------|-------------|---------|
| Top | 1 | 85° | N/A | Zenith |
| Upper | 6 | 45° | 60° | Upper hemisphere |
| Center | 8 | 0° | 45° | Full horizon |
| Lower | 6 | -45° | 60° | Lower hemisphere |
| Bottom | 1 | -85° | N/A | Nadir |

**Total: 22 photos = Perfect photo sphere!** 🌍
