# Tilt Test Guide - See the Sky! ☀️

## The Fix Applied

**Changed**: Inverted pitch direction
```typescript
// OLD (wrong):
accumulatedRotation.current.pitch += pitchRate * dt

// NEW (correct):
accumulatedRotation.current.pitch -= pitchRate * dt  // SUBTRACT
```

Now tilting UP increases pitch and shows upper/sky dots!

---

## Understanding the 5 Vertical Levels

```
        ⬆️ TOP (90°)      1 dot (zenith)
              🔵
              
        🔼 UPPER (45°)    6 dots
        🔵🔵🔵🔵🔵🔵
        
    ➡️ CENTER (0°)        8 dots ← You start here
    🔵🔵🔵🔵🔵🔵🔵🔵
        
        🔽 LOWER (-45°)   6 dots
        🔵🔵🔵🔵🔵🔵
              
              🔵
        ⬇️ BOTTOM (-90°)  1 dot (nadir)
```

---

## Testing Vertical Movement

### Step 1: Reset Position
1. Tap **"📍 Reset Position"**
2. Hold phone straight ahead (level)
3. You should be at **CENTER (0°)**

### Step 2: Look at Level Indicator
Watch the left side debug panel:
```
⬆️ TOP (90°)       ← gray
🔼 UPPER (45°)     ← gray
➡️ CENTER (0°)     ← YELLOW (you are here!)
🔽 LOWER (-45°)    ← gray
⬇️ BOTTOM (-90°)   ← gray
```

### Step 3: Tilt Up Slowly
**Action**: Tilt phone UP (toward ceiling)

**Expected**:
- Pitch value increases: 0° → 10° → 20° → 30° → 45°
- Level indicator shows: CENTER → UPPER (turns yellow)
- Dots move DOWN on screen
- NEW dots appear from TOP of screen
- These are the **sky dots** (upper ring)!

### Step 4: Keep Tilting Up
**Action**: Keep tilting UP

**Expected**:
- Pitch: 45° → 60° → 75° → 90°
- Level indicator: UPPER → TOP (turns yellow)
- Eventually see the **TOP dot** (zenith) at pitch=90°

### Step 5: Tilt Down Slowly
**Action**: Tilt phone DOWN (toward floor)

**Expected**:
- Pitch decreases: 0° → -10° → -20° → -30° → -45°
- Level indicator: CENTER → LOWER (turns yellow)
- Dots move UP on screen
- NEW dots appear from BOTTOM of screen
- These are the **floor dots** (lower ring)!

### Step 6: Keep Tilting Down
**Action**: Keep tilting DOWN

**Expected**:
- Pitch: -45° → -60° → -75° → -90°
- Level indicator: LOWER → BOTTOM (turns yellow)
- Eventually see the **BOTTOM dot** (nadir) at pitch=-90°

---

## Quick Verification Test

### Test 1: Can you see CENTER dots?
```
Pitch: 0° (level)
Expected: 3-4 white dots at eye level
Result: [ ] YES / [ ] NO
```

### Test 2: Can you see UPPER dots?
```
Pitch: 45° (tilt up)
Expected: 3-4 dots appear from above
Result: [ ] YES / [ ] NO
```

### Test 3: Can you see TOP dot?
```
Pitch: 90° (straight up)
Expected: 1 dot directly above
Result: [ ] YES / [ ] NO
```

### Test 4: Can you see LOWER dots?
```
Pitch: -45° (tilt down)
Expected: 3-4 dots appear from below
Result: [ ] YES / [ ] NO
```

### Test 5: Can you see BOTTOM dot?
```
Pitch: -90° (straight down)
Expected: 1 dot directly below
Result: [ ] YES / [ ] NO
```

---

## Visual Feedback While Testing

### Level Indicator (Left Panel)
- **Gray text**: Not at this level
- **Yellow text (bright)**: You are at this level!
- Watch it change as you tilt

### Instruction Text (Bottom)
```
"👆 TILT UP to see sky dots!"     ← When upper dots uncaptured
"👇 TILT DOWN to see floor dots!" ← When lower dots uncaptured
"12 more to find!"                 ← General progress
```

### Dots on Screen
- **Moving DOWN**: You're tilting UP
- **Moving UP**: You're tilting DOWN
- **New dots from TOP**: Upper ring appearing
- **New dots from BOTTOM**: Lower ring appearing

---

## Complete Vertical Sweep Test

### Full Tilt Sequence (Down to Up)
```
Start: Pitch = 0° (level)

1. Tilt to -45°  → See LOWER dots
2. Tilt to -90°  → See BOTTOM dot
3. Tilt to -45°  → Back to LOWER
4. Tilt to 0°    → Back to CENTER
5. Tilt to +45°  → See UPPER dots
6. Tilt to +90°  → See TOP dot
```

**Result**: You've seen all 5 vertical levels! ✅

---

## Common Issues & Solutions

### Issue: "I don't see upper dots even when tilted up"
**Solutions**:
1. Check pitch value → should be 30-60° for upper dots
2. Try rotating left/right while tilted up
3. Make sure visibility = some number > 0
4. Tap "Reset Position" and try again

### Issue: "Dots don't move when I tilt"
**Solutions**:
1. Check pitch value → should change as you tilt
2. Move phone more dramatically (bigger tilt angle)
3. Gyroscope might need calibration
4. Try "Reset Position"

### Issue: "Upper dots appear at bottom of screen"
**This is CORRECT!**
- When you tilt UP, dots above you move DOWN on screen
- They need to come into view from the top edge
- Think of it like looking at the ceiling

### Issue: "Can't reach 90° pitch"
**Physical limitation**:
- Holding phone, 90° is awkward
- Try: 70-80° is usually enough to see top dot
- Tolerance is set to ±8° for poles

---

## Recommended Capture Order

### 1. Start at Center (pitch=0°)
```
Action: Look straight ahead, rotate 360°
Capture: All 8 center ring dots
```

### 2. Look Up to Upper Ring (pitch=45°)
```
Action: Tilt up 45°, rotate 360°
Capture: All 6 upper ring dots
```

### 3. Look at Top (pitch=90°)
```
Action: Tilt straight up
Capture: 1 top dot (zenith)
```

### 4. Back to Center (pitch=0°)
```
Action: Level the phone
```

### 5. Look Down to Lower Ring (pitch=-45°)
```
Action: Tilt down 45°, rotate 360°
Capture: All 6 lower ring dots
```

### 6. Look at Bottom (pitch=-90°)
```
Action: Tilt straight down
Capture: 1 bottom dot (nadir)
```

**Total: 8 + 6 + 1 + 6 + 1 = 22 dots! 🎉**

---

## Debug Values Reference

### Pitch Ranges:
```
+90° = Straight UP (ceiling)
+45° = Upper ring level
  0° = Straight AHEAD (horizon)
-45° = Lower ring level
-90° = Straight DOWN (floor)
```

### What You Should See:
```
Pitch > +70°  → TOP dot visible
Pitch = +45°  → UPPER dots visible (6 dots)
Pitch = 0°    → CENTER dots visible (8 dots)
Pitch = -45°  → LOWER dots visible (6 dots)
Pitch < -70°  → BOTTOM dot visible
```

---

## Success Checklist

Movement tests:
- [ ] Tilt UP → Dots move DOWN ✅
- [ ] Tilt DOWN → Dots move UP ✅
- [ ] Upper dots appear when tilted up ✅
- [ ] Lower dots appear when tilted down ✅
- [ ] Level indicator changes correctly ✅

Coverage tests:
- [ ] Can see center dots (8) ✅
- [ ] Can see upper dots (6) ✅
- [ ] Can see top dot (1) ✅
- [ ] Can see lower dots (6) ✅
- [ ] Can see bottom dot (1) ✅

---

## Pro Tips

1. **Rotate WHILE tilted**
   - At pitch=45°, rotate 360° to capture all upper dots
   - Don't just tilt up once - spin around at that angle!

2. **Use level indicator**
   - Yellow highlight shows your current level
   - Helps you know which ring you're seeing

3. **Check "Visible" count**
   - Should be 2-6 at any position
   - If 0, you might be between rings - adjust pitch

4. **Physical comfort**
   - For top/bottom: 70-80° is usually enough
   - Don't strain to reach exactly 90°

---

**Status**: Pitch direction FIXED! ✅

You can now tilt UP to discover sky dots and DOWN to discover floor dots!

Start testing: Tap "📍 Reset Position" then slowly tilt UP! 👆☀️
