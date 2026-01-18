**Tagline:**
Perceptual Palette: Science-driven color for designers.

**Description:**
✨ Perceptual Palette: The OKLCH Design System Engine
Perceptual Palette is a high-precision color generator for Figma that bridges the gap between mathematical accessibility and human perception. It replaces traditional "guessing" with a dual-engine logic designed for robust, scalable design systems.

🔥 The Two Engines
1. Perceptual Mode (The Future)
Logic: Uses the OKLCH color space (Lightness, Chroma, Hue).
Calculation: It applies APCA-aligned logic to the L-axis. This ensures that a "Stop 500" in Blue has the same perceived brightness as a "Stop 500" in Yellow.
Result: Perfectly uniform scales that feel consistent to the human eye, regardless of the hue.
2. Legacy Mode (The Standard)
Logic: Uses classic WCAG 2.1 contrast math.
Calculation: Powered by Zain Adeel’s contrast algorithm, it generates a 100-900 scale based on relative luminance.
Result: Guaranteed compliance for standard web accessibility, centered around your specific brand anchor color.

🛠️ Core Features
OKLCH Control: Adjust Hue and Vividness (Chroma) independently without shifting the perceived lightness of your palette.
Precision Refiner: A deep-dive modal to override specific stops using HSL, HSB, or RGB sliders with live "Original vs. Refined" comparisons.
Smart Insertion: Add intermediate stops (e.g., 450, 725) between standard values. The plugin automatically interpolates the math to keep the scale smooth.
Accessibility Guard: Real-time WCAG/APCA contrast badges that alert you the moment a color stop fails readability thresholds.
Token Sync: One-click toggle to generate Figma Variables or Styles directly from your generated scales.
