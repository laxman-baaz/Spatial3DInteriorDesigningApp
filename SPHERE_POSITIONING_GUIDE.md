# How the 3D Sphere Positioning Works 🌍

## The Concept: Dots All Around You

Imagine you're standing in the center of a giant sphere. The 22 dots are painted on the inside surface of that sphere in specific positions. As you rotate your head/device, you see different dots come into your view.

## The 22-Dot Layout (Bird's Eye View)

```
         TOP (90°)
            🔵
            
       🔵 🔵 🔵 🔵 🔵 🔵    ← Upper Ring (45°)
       
 🔵 🔵 🔵 🔵 🔵 🔵 🔵 🔵   ← Center Ring (0°) YOU ARE HERE
       
       🔵 🔵 🔵 🔵 🔵 🔵    ← Lower Ring (-45°)
            
            🔵
        BOTTOM (-90°)
```

### Distribution:
- **Top (Zenith)**: 1 dot at pitch=90°, yaw=0°
- **Upper Ring**: 6 dots at pitch=45°, yaw=0°/60°/120°/180°/240°/300°
- **Center Ring**: 8 dots at pitch=0°, yaw=0°/45°/90°/135°/180°/225°/270°/315°
- **Lower Ring**: 6 dots at pitch=-45°, yaw=0°/60°/120°/180°/240°/300°
- **Bottom (Nadir)**: 1 dot at pitch=-90°, yaw=0°

## How You See Them

### Scenario 1: Looking North, Level (Pitch=0°, Yaw=0°)

```
Screen View:
┌─────────────────────┐
│                     │
│                     │  ← No dots (above you)
│                     │
│    ⚪      ⚪      ⚪│  ← Center ring dots
│                     │    (yaw 315°, 0°, 45°)
│                     │
│                     │  ← No dots (below you)
│                     │
└─────────────────────┘
```

**What you see**: 
- 3 dots from center ring (one straight ahead at 0°, one to left at 315°, one to right at 45°)
- Dots at 90°, 180°, 270° are outside your FOV (need to rotate to see them)

### Scenario 2: Looking Up (Pitch=30°, Yaw=0°)

```
Screen View:
┌─────────────────────┐
│        ⚪           │  ← Upper ring dots now visible!
│    ⚪      ⚪       │    (at 300°, 0°, 60°)
│                     │
│    ⚪      ⚪      ⚪│  ← Center ring dots
│                     │    (moved down on screen)
│                     │
│                     │
│                     │
└─────────────────────┘
```

**What happened**:
- You tilted up 30°
- Upper ring dots (at 45° pitch) are now only 15° above you → visible!
- Center dots moved down on screen
- Lower ring dots moved off bottom of screen

### Scenario 3: Rotated Right (Pitch=0°, Yaw=90°)

```
Screen View:
┌─────────────────────┐
│                     │
│                     │
│                     │
│    ⚪      ⚪      ⚪│  ← Different center dots!
│                     │    (yaw 45°, 90°, 135°)
│                     │
│                     │
│                     │
└─────────────────────┘
```

**What happened**:
- You turned right 90°
- Dots at yaw=0° moved off left side of screen
- Dots at yaw=90° now straight ahead
- Dots at yaw=180° still behind you (not visible)

## The Math: Angular Difference

### Formula
```typescript
deltaYaw = targetYaw - currentYaw
deltaPitch = targetPitch - currentPitch

// Normalize yaw to shortest path
if (deltaYaw > 180) deltaYaw -= 360
if (deltaYaw < -180) deltaYaw += 360

// Convert to pixels
screenX = center + deltaYaw * pixelsPerDegree
screenY = center - deltaPitch * pixelsPerDegree
```

### Example Calculation

**Current Position**: pitch=0°, yaw=0° (looking north)
**Target Dot**: pitch=0°, yaw=45° (northeast)

```
deltaYaw = 45° - 0° = 45° (dot is 45° to your right)
deltaPitch = 0° - 0° = 0° (dot is level with you)

screenX = 195 + (45 * 3.25) = 195 + 146 = 341px (right side of screen)
screenY = 410 - (0 * 9.1) = 410px (middle of screen)
```

**Result**: Dot appears on right side of screen at eye level ✅

## Visibility Filtering

We only show dots within your current FOV:

```typescript
VISIBLE_H = ±50° (horizontal)
VISIBLE_V = ±45° (vertical)

if (|deltaYaw| > 50° OR |deltaPitch| > 45°) {
  hide dot (it's outside your view)
}
```

### Why This Matters

With 120° camera FOV but 50° dot visibility:
- You see ~3-5 dots at a time (clean screen!)
- As you rotate, new dots "fade in" from the edges
- Dots behind you stay hidden (would be confusing to show them)

## Testing the Sphere

### 1. **Start Position** (pitch=0°, yaw=0°)
- Look straight ahead (north)
- Should see ~3 center ring dots
- One straight ahead (0°), one left (315°), one right (45°)

### 2. **Rotate Right** (yaw → 45° → 90° → 135°...)
- Dots move LEFT on screen
- New dots appear from right edge
- Old dots disappear off left edge
- After 360° rotation, you've seen all 8 center dots!

### 3. **Look Up** (pitch → 15° → 30° → 45°)
- Center dots move DOWN on screen
- Upper ring dots appear from top
- At pitch=45°, you see both center and upper rings

### 4. **Look Down** (pitch → -15° → -30° → -45°)
- Center dots move UP on screen
- Lower ring dots appear from bottom

### 5. **Complete 360° Horizontal Sweep**
```
Yaw 0°:   See dots at yaw 315°, 0°, 45°
Yaw 45°:  See dots at yaw 0°, 45°, 90°
Yaw 90°:  See dots at yaw 45°, 90°, 135°
Yaw 135°: See dots at yaw 90°, 135°, 180°
Yaw 180°: See dots at yaw 135°, 180°, 225°
Yaw 225°: See dots at yaw 180°, 225°, 270°
Yaw 270°: See dots at yaw 225°, 270°, 315°
Yaw 315°: See dots at yaw 270°, 315°, 0°
```

After full rotation → You've seen all 8 center ring dots! ✅

## Debug Info on Screen

The debug panel shows:
```
Pitch: 12.3° (±90°)     ← Your up/down tilt
Yaw: 87.5° (0-360°)     ← Your compass direction
Visible: 4 dots         ← How many dots in current FOV
```

### What to Watch:
- **Pitch changes** when you tilt device up/down
- **Yaw changes** when you rotate left/right
- **Visible count** changes as you move (should be 2-6 typically)

## Expected Behavior

✅ **Correct**:
- See 2-5 dots at any given time
- Dots appear smoothly as you rotate
- Dots form a circle around you as you spin 360°
- When aligned with a dot, it turns blue and captures

❌ **Wrong** (if happening, let me know!):
- See all 22 dots at once (should be filtered)
- Dots don't move when you rotate
- Dots all in a straight line (not a sphere)
- Can't find dots no matter where you look

## Tips for Testing

1. **Start at pitch=0°, yaw=0°**
2. **Slowly rotate right** (increase yaw)
   - Watch dots move LEFT
   - New dots appear from RIGHT
3. **Look up** (increase pitch)
   - Watch center dots move DOWN
   - Upper dots appear from TOP
4. **Complete the circle!**
   - Keep rotating until yaw returns to ~0°
   - You should have seen all center ring dots

---

## Summary

The dots form a complete **3D sphere around you**. You're at the center. As you rotate and tilt your device, different parts of the sphere come into view. The system calculates which dots should be visible based on your current orientation and shows only those, creating a natural "window" into the 360° photo sphere!

**Total Coverage**: 22 photos × (120° FOV) = Complete 360° × 180° sphere! 🌍✨
