# 22-Dot Photo Sphere Layout

## Complete Sphere Coverage ✅

The 22-dot configuration ensures **full 360° × 180° coverage** with proper overlap for stitching.

## Layout Structure

```
                    🔵 TOP (90°)
                       1 dot
                       
        🔵  🔵  🔵  🔵  🔵  🔵
        UPPER RING (45°) - 6 dots
        Every 60° spacing
        
  🔵  🔵  🔵  🔵  🔵  🔵  🔵  🔵
  CENTER RING (0°) - 8 dots
  Every 45° spacing (horizon)
        
        🔵  🔵  🔵  🔵  🔵  🔵
        LOWER RING (-45°) - 6 dots
        Every 60° spacing
                       
                    🔵 BOTTOM (-90°)
                       1 dot
```

## Total: 22 Photos

### Ring Distribution

**Coordinate System**: Pitch 90° = Horizon (phone upright in portrait mode)

1. **Zenith (Top Cap)**: 1 photo
   - Pitch: 180° (straight up, 90° above horizon)
   - Yaw: 0°
   
2. **Upper Ring**: 6 photos
   - Pitch: 135° (45° above horizon, looking at sky)
   - Yaw: 0°, 60°, 120°, 180°, 240°, 300°
   
3. **Center Ring (Horizon)**: 8 photos
   - Pitch: 90° (eye level, phone upright)
   - Yaw: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
   
4. **Lower Ring**: 6 photos
   - Pitch: 45° (45° below horizon, looking at ground)
   - Yaw: 0°, 60°, 120°, 180°, 240°, 300°
   
5. **Nadir (Bottom Cap)**: 1 photo
   - Pitch: 0° (straight down, 90° below horizon)
   - Yaw: 0°

## Coverage Details

### Horizontal Coverage
- **Center ring**: 8 photos × 45° = 360° complete circle ✅
- **Upper/Lower rings**: 6 photos × 60° = 360° complete circle ✅

### Vertical Coverage
- **Top**: 180° (straight up, ceiling)
- **Upper**: 135° (45° above horizon, upper walls/ceiling)
- **Center**: 90° (horizon/eye level, phone upright)
- **Lower**: 45° (45° below horizon, lower walls/floor)
- **Bottom**: 0° (straight down, floor)

**Total vertical span**: 180° (full hemisphere) ✅

**Note**: This coordinate system treats pitch 90° as the horizon when the phone is held upright in portrait mode, which aligns with the device's natural orientation tracking.

## Overlap for Stitching

### Horizontal Overlap
- **Center ring**: 45° spacing with ~60° FOV = **15° overlap** ✅
- **Upper/Lower rings**: 60° spacing with ~60° FOV = **~10° overlap** ✅

### Vertical Overlap
- Between rings: 45° spacing with ~45° vertical FOV = **good overlap** ✅
- Poles covered by dedicated zenith/nadir shots ✅

**Result**: 30%+ overlap ensures OpenCV can stitch successfully! 🎉

## Advantages over 16-Dot Layout

### 16-Dot Issues ❌
- 8 center + 4 top + 4 bottom
- Gaps in upper/lower coverage
- Not enough overlap at 45° elevation
- Missing pole coverage

### 22-Dot Benefits ✅
- Complete sphere coverage (no gaps)
- Proper overlap for stitching (30%+)
- Dedicated pole shots (top/bottom)
- More photos at critical angles (±45°)
- Better quality final panorama

## Capture Strategy

### Recommended Order
1. **Start at horizon** (center ring) - 8 photos rotating 360°
2. **Look up 45°** (upper ring) - 6 photos rotating 360°
3. **Look straight up** (zenith) - 1 photo
4. **Return to horizon**, then **look down 45°** (lower ring) - 6 photos
5. **Look straight down** (nadir) - 1 photo

### Free-Form Capture
With non-sequential capture, users can shoot in any order:
- See all 22 dots at once
- Capture whichever is aligned
- Natural, intuitive flow
- No forced sequence

## Technical Specs

- **Total photos**: 22
- **Assumed FOV**: 60° horizontal × 45° vertical (standard phone camera)
- **Pitch range**: -90° to +90° (full vertical)
- **Yaw range**: 0° to 360° (full horizontal)
- **Expected photo ratio**: 4:3
- **Stitching software**: OpenCV panorama stitcher

## Coverage Visualization

```
View from above (looking down at horizontal rings):

         0° (North)
         
    315°    |    45°
         \  |  /
          \ | /
   270° ---+--- 90° (East)
          / | \
         /  |  \
    225°    |    135°
         
        180° (South)

Center Ring (8 dots):    0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
Upper/Lower Rings (6):   0°, 60°, 120°, 180°, 240°, 300°
```

## Why This Works

1. **More photos at mid-elevations** (±45°): 6 photos each
   - Most important for room interiors
   - Where most details are visible
   
2. **Dense center ring**: 8 photos at eye level
   - Most critical for immersive panoramas
   - 45° spacing ensures good overlap
   
3. **Pole coverage**: Dedicated zenith/nadir shots
   - Fills the top/bottom gaps
   - Prevents black holes in stitched panorama

---

**Result**: Professional-quality 360° photo spheres ready for OpenCV stitching! 🌍✨
