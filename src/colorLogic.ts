import { oklch, wcagContrast, formatHex, inGamut, hsl, rgb, lch, hsv } from 'culori';
export { wcagContrast, hsl, rgb, lch, oklch, formatHex, hsv }; // Export for UI usage
import type { PaletteConfig, SwatchResult } from './types';

// ============================================================================
// OKLCH PERCEPTUALLY UNIFORM PALETTE GENERATION (Experimental)
// ============================================================================

/**
 * Standard stops for OKLCH mode with their fixed lightness values.
 * Lightness is perceptually uniform: step/1000
 */
const OKLCH_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/**
 * Finds the maximum chroma that stays within sRGB gamut for a given L and H.
 * Uses binary search for efficiency.
 */
function findMaxChroma(l: number, h: number): number {
    let low = 0;
    let high = 0.4; // Max OKLCH chroma is typically around 0.37-0.4

    // Binary search to find max valid chroma
    while (high - low > 0.001) {
        const mid = (low + high) / 2;
        const testColor = { mode: 'oklch' as const, l, c: mid, h };

        if (inGamut('rgb')(testColor)) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return low;
}

/**
 * Generates a perceptually uniform color palette using OKLCH color space.
 * 
 * Features:
 * - Fixed lightness values: L = 1 - (stop / 1000) 
 *   Step 100 → L=0.9 (light), Step 900 → L=0.1 (dark)
 * - Constant hue across all steps
 * - Maximum chroma that fits within sRGB gamut (auto-clamped)
 * - Vividness slider controls chroma intensity (0-100%)
 * 
 * @param hue - The OKLCH hue value (0-360)
 * @param stops - Optional custom stops (defaults to 100-900)
 * @param vividness - Chroma intensity 0-1 (default 1 = max gamut chroma)
 * @returns Array of SwatchResult with OKLCH values
 */
export function generateOKLCHSwatches(
    hue: number,
    stops: number[] = [...OKLCH_STOPS],
    vividness: number = 1
): SwatchResult[] {
    const sortedStops = [...stops].sort((a, b) => a - b);

    const swatches: SwatchResult[] = sortedStops.map(stop => {
        // Lightness mapping for WCAG compliance + UI display order:
        // - Level 0-99: L=0.98→0.91 (near white)
        // - Level 100-400: L=0.90→0.55 (light range)
        // - Level 500: L=0.45 (anchor, WCAG AA compliant vs white)
        // - Level 600-900: L=0.40→0.10 (dark range)
        // - Level 901-1000: L=0.09→0.02 (near black)
        let targetL: number;
        if (stop < 100) {
            // White to Light range: 0→1.00, 100→0.90
            targetL = 1.00 - (stop / 100) * 0.10;
        } else if (stop < 500) {
            // Light range: 100→0.90, 400→0.55
            targetL = 0.90 - ((stop - 100) / 400) * 0.35;
        } else if (stop === 500) {
            targetL = 0.45;
        } else if (stop <= 900) {
            // Dark range: 600→0.40, 900→0.10
            targetL = 0.40 - ((stop - 600) / 300) * 0.30;
        } else {
            // Dark range to Black: 900→0.10, 1000→0.00
            targetL = 0.10 - ((stop - 900) / 100) * 0.10;
        }

        // Clamp to valid OKLCH range (0.00 to 1.00)
        targetL = Math.max(0, Math.min(1, targetL));

        // Find maximum chroma within sRGB gamut, then apply vividness
        const maxChroma = findMaxChroma(targetL, hue);
        const finalChroma = maxChroma * Math.max(0, Math.min(1, vividness));

        // Create the OKLCH color
        const oklchColor = {
            mode: 'oklch' as const,
            l: targetL,
            c: finalChroma,
            h: hue
        };

        // Convert to hex
        const hex = formatHex(oklchColor) || '#000000';

        // Get LCH representation for compatibility with existing UI
        const lchColor = lch(hex);

        return {
            stop,
            hex,
            lch: {
                // Use actual OKLCH lightness (constant per stop, regardless of hue)
                l: targetL * 100,
                c: lchColor ? lchColor.c : finalChroma * 200,
                h: hue
            },
            contrastWithNext: 0,
            isAnchor: stop === 500 // Mark 500 as anchor for consistency
        };
    });

    // Calculate contrast ratios between adjacent swatches
    swatches.forEach((swatch, i) => {
        const next = swatches[i + 1];
        if (next) {
            swatch.contrastWithNext = wcagContrast(swatch.hex, next.hex);
        }
    });

    return swatches;
}

/**
 * Generates an accessible color scale based on FIXED Linear Lightness.
 * Uses OKLCH for superior hue preservation.
 * ALGORITHM: Lightness = 1.0 - (Stop / 1000)
 * This ensures consistent, full-range palettes regardless of seed lightness.
 */
export function generateSwatches(config: PaletteConfig): SwatchResult[] {
    const { baseColor, stops, overrides } = config;

    const originalOklch = oklch(baseColor);
    if (!originalOklch) throw new Error('Invalid base color');

    const sourceOklch = {
        mode: 'oklch' as const,
        l: originalOklch.l,
        c: originalOklch.c || 0,
        h: originalOklch.h || 0
    };

    const sortedStops = [...stops].sort((a, b) => a - b);

    // FIXED LINEAR SCALE
    // Ignores Seed Lightness for the curve shape.
    // Normalized distribution from 0 (White) to 1000 (Black).
    const finalResults: SwatchResult[] = sortedStops.map(stop => {
        // Linear Interpolation:
        // Stop 0 -> L=1.00
        // Stop 500 -> L=0.50
        // Stop 1000 -> L=0.00
        let targetL = 1.0 - (stop / 1000);

        // Clamp to avoid absolute 0/1 issues in some valid contexts, though culori handles it.
        targetL = Math.max(0, Math.min(1, targetL));

        return createSwatch(stop, targetL, sourceOklch, overrides, false);
    });

    // Mark 500 as Anchor (Reference)
    const targetAnchor = config.anchorStop || 500;
    const anchorSwatch = finalResults.find(s => s.stop === targetAnchor) || finalResults[Math.floor(finalResults.length / 2)];
    if (anchorSwatch) anchorSwatch.isAnchor = true;

    // Contrast Calculation
    finalResults.forEach((swatch, i) => {
        const next = finalResults[i + 1];
        if (next) {
            swatch.contrastWithNext = wcagContrast(swatch.hex, next.hex);
        }
    });

    return finalResults;
}

// --- Logic Moved from code.ts ---

export function hexToFigmaRgb(hex: string): { r: number, g: number, b: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
}

export function getColorName(rgb: { r: number, g: number, b: number }): string {
    // Use Culori HSL for better saturation handling
    const culloriRgb = { mode: 'rgb' as const, r: rgb.r, g: rgb.g, b: rgb.b };
    const hslColor = hsl(culloriRgb);

    // Safety check
    if (!hslColor) return "Gray";

    // STRICT NEUTRAL CHECK with HSL Saturation
    // Threshold 0.20 (20%) covers Slate, Zinc, etc. effectively forcing them to "Gray"
    if (hslColor.s < 0.20) {
        if (hslColor.l > 0.96) return "White";
        if (hslColor.l < 0.12) return "Black";
        return "Gray";
    }

    const { r, g, b } = rgb;

    // Standard Colors Dictionary
    // Reduced to core hues to avoid "Slate" or "Neutral" popping up for 21% saturation items
    const colors = [
        { name: "Red", r: 1, g: 0, b: 0 },
        { name: "Orange", r: 1, g: 0.5, b: 0 },
        { name: "Yellow", r: 1, g: 1, b: 0 },
        { name: "Lime", r: 0.5, g: 1, b: 0 },
        { name: "Green", r: 0, g: 1, b: 0 },
        { name: "Teal", r: 0, g: 0.5, b: 0.5 },
        { name: "Cyan", r: 0, g: 1, b: 1 },
        { name: "Blue", r: 0, g: 0, b: 1 },
        { name: "Indigo", r: 0.29, g: 0, b: 0.51 },
        { name: "Purple", r: 0.5, g: 0, b: 0.5 },
        { name: "Pink", r: 1, g: 0.75, b: 0.8 },
        { name: "Rose", r: 1, g: 0, b: 0.5 },
        { name: "Gray", r: 0.5, g: 0.5, b: 0.5 }, // Anchor for semi-saturated grays
        { name: "White", r: 1, g: 1, b: 1 },
        { name: "Black", r: 0, g: 0, b: 0 }
    ];

    let minDist = Infinity;
    let closestName = "Gray";

    // Simple Euclidean distance in RGB space
    for (const color of colors) {
        const d = Math.sqrt(
            Math.pow(r - color.r, 2) +
            Math.pow(g - color.g, 2) +
            Math.pow(b - color.b, 2)
        );
        if (d < minDist) {
            minDist = d;
            closestName = color.name;
        }
    }

    // Special handling for low saturation (Greys) if unrelated to specific tinted greys
    // If not sufficiently close to a colored hue, default to broad Grey/Black/White check
    // But the list above includes Slate/Gray which helps.

    return closestName;
}

function toGamut(color: { mode: 'oklch', l: number, c: number, h: number }): { mode: 'oklch', l: number, c: number, h: number } {
    const mapped = { ...color };
    let attempts = 0;
    while (!inGamut('rgb')(mapped) && mapped.c > 0 && attempts < 50) {
        mapped.c -= 0.005;
        attempts++;
    }
    return mapped;
}

function createSwatch(stop: number, l: number, anchorOklch: any, overrides: any, isAnchor: boolean): SwatchResult {
    const over = overrides[stop];
    const originalHue = anchorOklch.h;

    // Start with the algorithmic default
    let finalOklch = { mode: 'oklch' as const, l, c: anchorOklch.c, h: originalHue };

    if (over) {
        if (over.mode === 'lch') {
            if (over.hue !== undefined) finalOklch.h = over.hue;
            if (over.chroma !== undefined) finalOklch.c = over.chroma;
            if (over.lightness !== undefined) finalOklch.l = over.lightness / 100;
        } else if (over.mode === 'hsl') {
            // Convert current state to HSL to use as fallback for undefined props
            const currentHsl = hsl(formatHex(finalOklch)) || { h: 0, s: 0, l: 0 };
            const newHsl = {
                mode: 'hsl' as const,
                h: over.hue !== undefined ? over.hue : currentHsl.h,
                s: over.s !== undefined ? over.s : currentHsl.s,
                l: over.lightness !== undefined ? over.lightness : currentHsl.l
            };
            const backOklch = oklch(newHsl);
            // V 0.0.79 Fix: Respect the new hue from HSL
            if (backOklch) finalOklch = { mode: 'oklch', l: backOklch.l, c: backOklch.c, h: backOklch.h || 0 };
        } else if (over.mode === 'rgb') {
            // Convert current state to RGB to use as fallback
            const currentRgb = rgb(formatHex(finalOklch)) || { r: 0, g: 0, b: 0 };
            const newRgb = {
                mode: 'rgb' as const,
                r: over.r !== undefined ? over.r : currentRgb.r,
                g: over.g !== undefined ? over.g : currentRgb.g,
                b: over.b !== undefined ? over.b : currentRgb.b
            };
            const backOklch = oklch(newRgb);
            // V 0.0.79 Fix: Respect the new hue from RGB
            if (backOklch) finalOklch = { mode: 'oklch', l: backOklch.l, c: backOklch.c, h: backOklch.h || 0 };
        } else if (over.mode === 'hsb') {
            // HSB support (mapped to HSV)
            const currentHsv = hsv(formatHex(finalOklch)) || { h: 0, s: 0, v: 0 };
            const newHsv = {
                mode: 'hsv' as const,
                h: over.hue !== undefined ? over.hue : currentHsv.h,
                s: over.s !== undefined ? over.s : currentHsv.s,
                v: over.v !== undefined ? over.v : currentHsv.v
            };
            const backOklch = oklch(newHsv);
            if (backOklch) finalOklch = { mode: 'oklch', l: backOklch.l, c: backOklch.c, h: backOklch.h || 0 };
        }
    }

    // Ensure we aren't completely breaking the gamut, but try to respect the user's intent
    finalOklch = toGamut(finalOklch);

    // Bug Fix: Do NOT reset hue to originalHue here!
    // finalOklch.h = originalHue; <--- REMOVED

    const hex = formatHex(finalOklch) || '#000000';
    const backLch = lch(hex);

    return {
        stop,
        hex,
        lch: {
            // Using backLch ensures the report matches reality
            l: backLch ? backLch.l : finalOklch.l * 100,
            c: backLch ? backLch.c : finalOklch.c * 200,
            h: backLch ? (backLch.h || 0) : finalOklch.h
        },
        contrastWithNext: 0,
        isAnchor
    };
}
