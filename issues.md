# Project Issues

- [ ] **Legacy Mode Math Correction**: Currently, Legacy mode uses "Locked Lightness" (line 159 in `src/colorLogic.ts`) instead of the intended "Locked Contrast" (1.35x multiplier ladder). It should be refactored to calculate steps relative to the seed color's contrast.
- [ ] **Grayscale Naming Persistence**: Gray seed colors are incorrectly named as vivid colors (e.g., "Blue", "Purple"). The system fails to strictly categorize low-saturation inputs (e.g., Slate, Zinc) as "Gray" despite attempts to use RGB chroma differences and HSL saturation thresholds (< 20%).
- [ ] **Modal Radius Mismatch**: Current code uses `20px` (Token based), but Figma design specifies `18px`.
- [ ] **Title Line Height**: Current code inherits global `1.4`, but Figma title uses `1.2`.
- [ ] **Button Radius Precision**: Current code uses standard pill (`99px`), Figma specifies `21.497px`.
