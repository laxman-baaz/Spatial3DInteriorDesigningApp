# Movement Test Guide - Fixed Direction! ✅

## The Fix Applied

**Changed**: Inverted yaw direction
```typescript
// OLD (backwards):
accumulatedRotation.current.yaw += yawRate * dt

// NEW (correct):
accumulatedRotation.current.yaw -= yawRate * dt  // SUBTRACT
```

Now rotating LEFT discovers dots from the LEFT (correct!)

---

## Expected Movement Behavior

### Test 1: Rotate Phone LEFT (Counterclockwise)

**Action**: Rotate phone left
**Expected**: 
- ✅ Dots appear from LEFT side of screen
- ✅ Existing dots move to the RIGHT
- ✅ Yaw value DECREASES (or increases depending on convention)
- ✅ You're "discovering" what's to your left

### Test 2: Rotate Phone RIGHT (Clockwise)

**Action**: Rotate phone right
**Expected**:
- ✅ Dots appear from RIGHT side of screen
- ✅ Existing dots move to the LEFT
- ✅ Yaw value INCREASES (or decreases depending on convention)
- ✅ You're "discovering" what's to your right

### Test 3: Tilt UP

**Action**: Tilt phone up (pitch increases)
**Expected**:
- ✅ Dots move DOWN on screen
- ✅ Upper ring dots (45°) appear from TOP
- ✅ Eventually see TOP dot (90°)

### Test 4: Tilt DOWN

**Action**: Tilt phone down (pitch decreases)
**Expected**:
- ✅ Dots move UP on screen
- ✅ Lower ring dots (-45°) appear from BOTTOM
- ✅ Eventually see BOTTOM dot (-90°)

---

## Quick Verification Test

### Setup:
1. Open app
2. Tap **"📍 Reset Position"**
3. Hold phone straight ahead (landscape or portrait)

### Test Sequence:

#### Step 1: Initial View
```
Look straight ahead
Expected: See 3-4 center ring dots
```
**Check**: Do you see white dots? ✅

#### Step 2: Rotate LEFT Slowly
```
Rotate phone counterclockwise (left)
Expected: New dots appear from LEFT side
```
**Check**: Do dots come from the LEFT? ✅

#### Step 3: Rotate RIGHT Slowly
```
Rotate phone clockwise (right)
Expected: New dots appear from RIGHT side
```
**Check**: Do dots come from the RIGHT? ✅

#### Step 4: Tilt UP
```
Tilt phone up (sky)
Expected: Dots move DOWN, new dots from TOP
```
**Check**: Do upper dots appear? ✅

#### Step 5: Full 360° Spin
```
Keep rotating right for full circle
Expected: See ALL 8 center ring dots appear
```
**Check**: After 360°, have you seen 8 different dots? ✅

---

## Debug Info Reference

While testing, watch the debug panel:

```
Pitch: ↑ 23.4°         ← Arrow shows direction
Yaw: 187.2°            ← Accumulates as you rotate
👉 Looking AHEAD       ← Direction indicator
Visible: 5 dots        ← How many in FOV
```

### Direction Indicators:
- **👆 Looking UP**: pitch > 20°
- **👇 Looking DOWN**: pitch < -20°
- **👉 Looking AHEAD**: pitch between -20° and 20°

---

## Common Scenarios

### Scenario 1: "I don't see any dots!"
**Possible causes**:
1. All dots captured already
2. Looking at wrong pitch angle
3. Need to rotate to find them

**Solution**:
- Check debug: "Visible: X dots"
- If 0, rotate phone in a circle
- Try tilting up/down

### Scenario 2: "Dots appear from wrong side"
**If still happening after fix**:
- The gyroscope axis might be device-specific
- Let me know and we'll add device detection

### Scenario 3: "Dots are jumpy/unstable"
**Solution**:
- Move phone smoothly, not jerky
- Check SENSOR_INTERVAL = 16ms
- Complementary filter should smooth it

### Scenario 4: "Can't complete 360°"
**This is normal!**
- Dots are filtered (±50° visibility)
- As you rotate, they appear/disappear
- After full rotation, you've seen them all

---

## Understanding the Sphere Layout

Imagine you're in the CENTER of this sphere:

```
              TOP (90°)
                 🔵
                 
        🔵🔵🔵🔵🔵🔵
        Upper Ring (45°)
        
  🔵🔵🔵🔵 YOU 🔵🔵🔵🔵
  Center Ring (0°)
        
        🔵🔵🔵🔵🔵🔵
        Lower Ring (-45°)
                 
                 🔵
              BOTTOM (-90°)
```

### To see all dots:

1. **Horizontal sweep**: Rotate 360° (see 8 center dots)
2. **Look up**: Tilt to 45° (see 6 upper dots)
3. **Look up more**: Tilt to 90° (see 1 top dot)
4. **Look down**: Tilt to -45° (see 6 lower dots)
5. **Look down more**: Tilt to -90° (see 1 bottom dot)

**Total**: 8 + 6 + 1 + 6 + 1 = 22 dots! ✅

---

## Natural Movement Flow

### Recommended capture order:

1. **Start**: Center ring (pitch=0°)
   - Rotate 360° → capture all 8 center dots

2. **Look up**: Upper ring (pitch=45°)
   - Rotate 360° → capture all 6 upper dots

3. **Look straight up**: Top (pitch=90°)
   - Point at ceiling → capture 1 top dot

4. **Back to center**: (pitch=0°)

5. **Look down**: Lower ring (pitch=-45°)
   - Rotate 360° → capture all 6 lower dots

6. **Look straight down**: Bottom (pitch=-90°)
   - Point at floor → capture 1 bottom dot

**Done!** 22/22 photos = Complete sphere! 🎉

---

## Troubleshooting Movement

### Issue: "Yaw drifts when standing still"
**Cause**: Gyroscope drift (normal)
**Solution**: Tap "📍 Reset Position" to recalibrate

### Issue: "Pitch seems inverted"
**If tilting up moves dots up (wrong)**:
```typescript
// Need to also invert pitch
accumulatedRotation.current.pitch -= pitchRate * dt
```

### Issue: "Movement is too sensitive"
**Solution**: Reduce sensor update rate
```typescript
const SENSOR_INTERVAL = 32; // Slower updates (was 16)
```

### Issue: "Movement is too slow"
**Solution**: Increase sensor update rate
```typescript
const SENSOR_INTERVAL = 8; // Faster updates (was 16)
```

---

## Success Checklist

Test each of these:

- [ ] Rotate LEFT → dots from LEFT ✅
- [ ] Rotate RIGHT → dots from RIGHT ✅
- [ ] Tilt UP → dots from TOP ✅
- [ ] Tilt DOWN → dots from BOTTOM ✅
- [ ] 360° spin → see all 8 center dots ✅
- [ ] Dots capture automatically when aligned ✅
- [ ] Can complete all 22 positions ✅

If all checked, the sphere is working perfectly! 🌍

---

## Quick Debug Commands

If you need to test specific orientations:

1. **Reset to 0,0**: Tap "📍 Reset Position"
2. **Clear photos**: Tap "🔄 Reset Photos"
3. **Check visible count**: Watch "Visible: X dots"
4. **Check direction**: Watch "👉/👆/👇" indicator

---

**Status**: Movement direction FIXED! ✅

Now rotating left/right will correctly discover dots in that direction!
