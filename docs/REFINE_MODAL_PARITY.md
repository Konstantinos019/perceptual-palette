# Refine Modal - Design Parity Guide

> Comparison between Figma design (node `95:136`) and current implementation with fix instructions

---

## Figma Design Screenshot

![Figma Design](file:///Users/kdimitropoulos/.gemini/antigravity/scratch/perceptual-palette/docs/refine-modal-design.png)

---

## Key Differences

| Element | Figma Design | Current Implementation | Status |
|---------|--------------|------------------------|--------|
| **Modal Width** | ~400px (estimated) | 320px | ❌ Needs fix |
| **Border Radius** | 18px | 20px | ⚠️ Close |
| **Shadow** | `0px 1.536px 12.284px` | `--shadow-md` (2px 12px) | ✓ Fixed |
| **Mode Tabs** | ❌ Not present | LCH/HSL/RGB tabs visible | ❌ Remove |
| **Contrast Indicator** | `1.00 ⚠` between previews | Not implemented | ❌ Missing |
| **Slider Track Style** | Full-width with gradient | Narrow with gradient | ❌ Needs restyle |
| **Value Badges** | Right-aligned values (188°, 100%, 62%) | Pill badges with background | ❌ Different style |
| **Footer Buttons** | Full rounded pills, equal width | Correct | ✓ OK |

---

## Detailed Comparison

### 1. Header

**Figma:**
```
Padding: 24px
Title: "Refine stop 500" - 20px, Semi Bold, #3c3c3c
Close Button: 44px circle, #f3f3f3 bg, rounded-[21.497px]
```

**Current:**
```css
.modal-header { padding: 24px; }
.modal-title { font-size: 20px; font-weight: 600; }
.modal-close-btn { width: 44px; height: 44px; border-radius: 22px; }
```
**Status:** ✓ Mostly correct

---

### 2. Color Preview Section

**Figma:**
- Two equal panels side-by-side
- Left: "Original" with hex and label
- Right: "Refining" with hex and label
- **Contrast indicator** `1.00 ⚠` shown in center overlap
- Border radius: 12px on outer corners only

**Current:**
- Two panels present
- Labels say "Original" and "Refining" ✓
- **Missing:** Contrast indicator between panels
- Border radius applied correctly

**Fix Required:**
```html
<!-- Add after comparison-preview div -->
<div class="contrast-badge">
  <span class="contrast-value">1.00</span>
  <span class="material-symbols-rounded warning">warning</span>
</div>
```

```css
.contrast-badge {
  position: absolute;
  bottom: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
}
```

---

### 3. Mode Tabs (LCH/HSL/RGB)

**Figma:**
- **NOT PRESENT** - Design only shows HSL sliders

**Current:**
- Shows LCH/HSL/RGB tab switcher
- Adds complexity

**Decision Required:**
- Option A: Remove tabs, use HSL only (match design)
- Option B: Keep tabs but style differently
- Option C: Move tabs to settings area

---

### 4. Slider Rows

**Figma:**
```
Row Height: Auto with proper padding
Label: "Hue" - 13px, #888
Value: "188°" - right-aligned, no pill background
Slider Track: Full-width gradient, rounded
Slider Thumb: White circle with subtle shadow
```

**Current:**
```css
.modal-row {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-subtle);
}
.value-pill {
  background: var(--bg-subtle);
  padding: 4px 10px;
  border-radius: 12px;
}
```

**Fixes Required:**

1. **Remove value pill background:**
```css
.modal-row .value-pill {
  background: transparent;
  padding: 0;
  font-size: 14px;
  color: var(--text-primary);
}
```

2. **Style slider tracks:**
```css
/* Hue slider - rainbow gradient */
input[type=range].hue-slider {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, 
    #ff0000 0%, 
    #ffff00 17%, 
    #00ff00 33%, 
    #00ffff 50%, 
    #0000ff 67%, 
    #ff00ff 83%, 
    #ff0000 100%
  );
}

/* Saturation slider - dynamic gradient based on hue */
input[type=range].saturation-slider {
  background: linear-gradient(to right, #888888, currentColor);
}

/* Lightness slider - grayscale gradient */
input[type=range].lightness-slider {
  background: linear-gradient(to right, #000000, #ffffff);
}
```

---

### 5. Footer Buttons

**Figma:**
```
Padding: 24px
Gap: 14px
Button Height: 48px
Border Radius: 21.497px (full pill)
Reset: #e5e5e5 bg, #3c3c3c text, refresh icon
Save: #000 bg, #fff text, save icon
```

**Current:**
```css
.modal-footer { padding: 24px; gap: 12px; }
.btn-pill { height: 48px; border-radius: 99px; }
```

**Status:** ✓ Mostly correct, adjust gap to 14px

---

## Implementation Checklist

### Must Fix (High Impact)

- [ ] **Add contrast indicator** between color preview panels
- [ ] **Remove value pill backgrounds** - use plain text values
- [ ] **Improve slider styling** - full gradient backgrounds per slider type
- [ ] **Widen modal** from 320px to ~380-400px

### Consider (Medium Impact)

- [ ] Remove or hide LCH/HSL/RGB mode tabs (design shows only HSL)
- [ ] Add proper saturation/lightness gradients based on current hue

### Nice to Have (Low Impact)

- [ ] Adjust footer gap from 12px to 14px
- [ ] Fine-tune border radius values

---

## CSS Variables to Update

```css
:root {
  /* Modal specific */
  --modal-width: 380px;
  --modal-radius: 18px;
  --modal-padding: 24px;
  --preview-height: 128px;
  --slider-height: 8px;
  --slider-thumb-size: 20px;
}
```

---

## Files to Modify

1. **`src/ui.html`** (lines 184-306)
   - Add contrast indicator element
   - Consider removing mode tabs

2. **`src/ui.css`** (lines 1595-1763)
   - Update `.modal-card` width
   - Restyle `.value-pill` without background
   - Add slider track gradient styles
   - Add `.contrast-badge` styles

3. **`src/ui.ts`**

### Update (Styling Reversion)
- **Slider Handles:** Separated modal slider styling from main app to preserve original design.
- **Implementation:** Created `.refiner-slider` class for modal inputs, reverted global `input[type=range]` overrides.
