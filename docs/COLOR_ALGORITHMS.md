# Color Generation Algorithms Documentation

> Detailed technical documentation of the palette generation logic in Perceptual Palette

---

## Overview

Perceptual Palette offers two color generation modes:

| Mode | Function | Purpose |
|------|----------|---------|
| **Legacy** | `generateSwatches()` | Seed-based palette with fixed lightness scale |
| **Perceptual (OKLCH)** | `generateOKLCHSwatches()` | Hue-based palette with perceptually uniform lightness |

---

## Mode 1: Legacy (`generateSwatches`)

### Intent
Generate a color palette from a seed color (e.g., `#18A0FB`) where:
- The seed's **hue and chroma are preserved** across all stops
- Lightness varies linearly from white (0) to black (1000)
- Users can override individual stops with custom LCH/HSL/RGB values

### Algorithm

```
For each stop in [100, 200, 300, 400, 500, 600, 700, 800, 900]:
    1. Calculate target lightness: L = 1.0 - (stop / 1000)
       - Stop 100 → L = 0.90
       - Stop 500 → L = 0.50
       - Stop 900 → L = 0.10
    
    2. Create OKLCH color: { l: targetL, c: seedChroma, h: seedHue }
    
    3. Apply any user overrides (LCH/HSL/RGB)
    
    4. Clamp to sRGB gamut (reduce chroma if out-of-gamut)
    
    5. Return hex + contrast data
```

### Code Location
- **File:** [colorLogic.ts](file:///Users/kdimitropoulos/.gemini/antigravity/scratch/perceptual-palette/src/colorLogic.ts#L136-L181)
- **Helper:** `createSwatch()` (lines 263-323)

### Known Issues

| Issue | Description | Severity |
|-------|-------------|----------|
| **#1 - Wrong Algorithm** | Uses fixed lightness instead of contrast-based stepping (1.35x multiplier) | High |
| **Seed Not Preserved** | The actual seed color is never placed in the palette; lightness is recalculated | Medium |
| **Chroma Degradation** | High-chroma seeds may lose vibrancy at extreme lightness values due to gamut clamping | Low |

---

## Mode 2: Perceptual OKLCH (`generateOKLCHSwatches`)

### Intent
Generate a **perceptually uniform** palette where:
- User selects a **hue** (0-360°) and **vividness** (0-100%)
- Lightness is **fixed per stop** (not dependent on any seed)
- Chroma is maximized within sRGB gamut, then scaled by vividness

### Algorithm

```
For each stop in [100, 200, 300, 400, 500, 600, 700, 800, 900]:
    1. Calculate target lightness using piecewise function:
       - Stop 0-99:   L = 1.00 - (stop/100) * 0.10      → Near white
       - Stop 100-400: L = 0.90 - ((stop-100)/400) * 0.35 → Light range
       - Stop 500:    L = 0.45                          → Anchor (WCAG AA)
       - Stop 600-900: L = 0.40 - ((stop-600)/300) * 0.30 → Dark range
       - Stop 901-1000: L = 0.10 - ((stop-900)/100) * 0.10 → Near black
    
    2. Find maximum chroma at this L,H that fits sRGB (binary search)
    
    3. Apply vividness: finalChroma = maxChroma * vividness
    
    4. Create OKLCH color and convert to hex
```

### Lightness Mapping Table

| Stop | Target L | Visual |
|------|----------|--------|
| 0 | 1.00 | Pure White |
| 100 | 0.90 | Very Light |
| 200 | 0.81 | Light |
| 300 | 0.72 | Light-Mid |
| 400 | 0.64 | Mid-Light |
| **500** | **0.45** | **Anchor** |
| 600 | 0.40 | Mid-Dark |
| 700 | 0.30 | Dark |
| 800 | 0.20 | Very Dark |
| 900 | 0.10 | Near Black |
| 1000 | 0.00 | Pure Black |

### Code Location
- **File:** [colorLogic.ts](file:///Users/kdimitropoulos/.gemini/antigravity/scratch/perceptual-palette/src/colorLogic.ts#L53-L128)
- **Helper:** `findMaxChroma()` (lines 19-36)

### Known Issues

| Issue | Description | Severity |
|-------|-------------|----------|
| **Discontinuity at 500** | There's a jump from L=0.55 (stop 400) to L=0.45 (stop 500) to L=0.40 (stop 600), creating uneven steps | Medium |
| **Asymmetric Ranges** | Light range covers 400 units (100-500) but dark range covers only 300 units (600-900) | Medium |
| **No APCA Support** | Claims APCA alignment but doesn't actually use APCA contrast calculations | Low |

---

## Comparison: Legacy vs OKLCH

| Aspect | Legacy | OKLCH |
|--------|--------|-------|
| **Input** | Hex color (seed) | Hue + Vividness sliders |
| **Lightness** | Linear: `L = 1 - (stop/1000)` | Piecewise with anchor at 500 |
| **Chroma** | Preserved from seed | Maximized per-stop, scaled by vividness |
| **Hue** | Preserved from seed | User-selected, constant |
| **Overrides** | Supports per-stop LCH/HSL/RGB | Not supported |
| **Gamut Clamping** | Reduces chroma iteratively | Binary search for max valid chroma |

---

## Utility Functions

### `findMaxChroma(l, h)` → number
Binary search to find the maximum OKLCH chroma that stays within sRGB gamut.

### `toGamut(oklchColor)` → oklchColor
Iteratively reduces chroma until color is in-gamut (max 50 iterations).

### `hexToFigmaRgb(hex)` → {r, g, b}
Converts hex string to Figma's 0-1 RGB format.

### `getColorName(rgb)` → string
Attempts to name a color by finding the closest match in a predefined palette.
- **Issue #2:** Fails for low-saturation colors that should be "Gray"

---

## Test Coverage

Location: [colorLogic.test.ts](file:///Users/kdimitropoulos/.gemini/antigravity/scratch/perceptual-palette/src/colorLogic.test.ts)

| Test | Mode | Status |
|------|------|--------|
| Valid palette structure | Legacy | ✓ |
| Anchor marking | Legacy | ✓ |
| Invalid color handling | Legacy | ✓ |
| Default 9 swatches | OKLCH | ✓ |
| Light→Dark ordering | OKLCH | ✓ |
| Constant hue | OKLCH | ✓ |
| Valid hex output | OKLCH | ✓ |
| Anchor at 500 | OKLCH | ✓ |
| Contrast calculation | OKLCH | ✓ |
| Custom stops | OKLCH | ✓ |
| White/Black extremes | OKLCH | ✓ |

Run tests: `npm test`
