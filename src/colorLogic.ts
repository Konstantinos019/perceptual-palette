import { oklch, wcagContrast, formatHex, inGamut, hsl, rgb, lch, hsv } from 'culori';
export { wcagContrast, hsl, rgb, lch, oklch, formatHex, hsv }; // Export for UI usage
import type { PaletteConfig, SwatchResult } from './types';

// ============================================================================
// OKLCH PERCEPTUALLY UNIFORM PALETTE GENERATION (Experimental)
// ============================================================================

const OKLCH_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

function findMaxChroma(l: number, h: number): number {
    let low = 0;
    let high = 0.4;
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

export function generateOKLCHSwatches(
    hue: number,
    stops: number[] = [...OKLCH_STOPS],
    vividness: number = 1,
    overrides: Record<number, any> = {}
): SwatchResult[] {
    const sortedStops = [...stops].sort((a, b) => a - b);

    const swatches: SwatchResult[] = sortedStops.map(stop => {
        let targetL: number;
        if (stop < 100) {
            targetL = 1.00 - (stop / 100) * 0.10;
        } else if (stop < 500) {
            targetL = 0.90 - ((stop - 100) / 400) * 0.35;
        } else if (stop === 500) {
            targetL = 0.45;
        } else if (stop <= 900) {
            targetL = 0.40 - ((stop - 600) / 300) * 0.30;
        } else {
            targetL = 0.10 - ((stop - 900) / 100) * 0.10;
        }

        targetL = Math.max(0, Math.min(1, targetL));

        const maxChroma = findMaxChroma(targetL, hue);
        const finalChroma = maxChroma * Math.max(0, Math.min(1, vividness));

        const baseOklch = { mode: 'oklch' as const, l: targetL, c: finalChroma, h: hue };
        return createSwatch(stop, targetL, baseOklch, overrides, stop === 500);
    });

    swatches.forEach((swatch, i) => {
        const next = swatches[i + 1];
        if (next) {
            swatch.contrastWithNext = wcagContrast(swatch.hex, next.hex);
        }
    });

    return swatches;
}

/**
 * Finds the OKLCH lightness value that yields a specific target contrast
 * against a background color. Uses binary search for precision.
 */
function findAccessibleLightness(targetContrast: number, h: number, c: number, theme: 'light' | 'dark'): number {
    const bg = theme === 'light' ? '#ffffff' : '#000000';
    let low = 0;
    let high = 1;

    // Binary search for target contrast
    for (let i = 0; i < 15; i++) {
        const mid = (low + high) / 2;
        const testHex = formatHex({ mode: 'oklch', l: mid, c, h }) || '#000000';
        const contrast = wcagContrast(testHex, bg);

        if (theme === 'light') {
            // Against white: lower L means higher contrast
            if (contrast > targetContrast) {
                low = mid;
            } else {
                high = mid;
            }
        } else {
            // Against black: higher L means higher contrast
            if (contrast > targetContrast) {
                high = mid;
            } else {
                low = mid;
            }
        }
    }
    return (low + high) / 2;
}

export function generateSwatches(config: PaletteConfig): SwatchResult[] {
    const { baseColor, stops, overrides, anchorStop = 500 } = config;

    const originalOklch = oklch(baseColor);
    if (!originalOklch) throw new Error('Invalid base color');

    const sourceOklch = {
        mode: 'oklch' as const,
        l: originalOklch.l,
        c: originalOklch.c || 0,
        h: originalOklch.h || 0
    };

    const sortedStops = [...stops].sort((a, b) => a - b);
    const MULTIPLIER = 1.105; // 1.105^3 ~= 1.35 (WCAG Ratio Target)

    // Always use accessible anchor in Legacy mode, as per user request.
    // The anchorTheme toggle decides whether to target White (light) or Black (dark) contrast.
    const seedL = findAccessibleLightness(4.5, sourceOklch.h, sourceOklch.c, config.anchorTheme || 'light');

    const finalResults: SwatchResult[] = sortedStops.map(stop => {
        const stepsFromAnchor = (stop - anchorStop) / 100;
        let targetL: number;
        if (stepsFromAnchor === 0) {
            targetL = seedL;
        } else if (stepsFromAnchor < 0) {
            targetL = (seedL + 0.05) * Math.pow(MULTIPLIER, Math.abs(stepsFromAnchor)) - 0.05;
        } else {
            targetL = (seedL + 0.05) / Math.pow(MULTIPLIER, stepsFromAnchor) - 0.05;
        }

        targetL = Math.max(0, Math.min(1, targetL));
        return createSwatch(stop, targetL, sourceOklch, overrides, stop === anchorStop);
    });

    finalResults.forEach((swatch, i) => {
        const next = finalResults[i + 1];
        if (next) {
            swatch.contrastWithNext = wcagContrast(swatch.hex, next.hex);
        }
    });

    return finalResults;
}

export function figmaRgbToHex(color: { r: number, g: number, b: number }): string {
    return formatHex({ mode: 'rgb', r: color.r, g: color.g, b: color.b }) || '#000000';
}

export function getContrastBackground(theme: 'light' | 'dark'): string {
    return theme === 'light' ? '#ffffff' : '#000000';
}

export function hexToFigmaRgb(hex: string): { r: number, g: number, b: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b };
}

export function getColorName(rgb: { r: number, g: number, b: number }): string {
    const culloriRgb = { mode: 'rgb' as const, r: rgb.r, g: rgb.g, b: rgb.b };
    const hslColor = hsl(culloriRgb);
    if (!hslColor) return "Gray";
    if (hslColor.s < 0.20) {
        if (hslColor.l > 0.96) return "White";
        if (hslColor.l < 0.12) return "Black";
        return "Gray";
    }

    const { r, g, b } = rgb;
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
        { name: "Gray", r: 0.5, g: 0.5, b: 0.5 },
        { name: "White", r: 1, g: 1, b: 1 },
        { name: "Black", r: 0, g: 0, b: 0 }
    ];

    let minDist = Infinity;
    let closestName = "Gray";
    for (const color of colors) {
        const d = Math.sqrt(Math.pow(r - color.r, 2) + Math.pow(g - color.g, 2) + Math.pow(b - color.b, 2));
        if (d < minDist) {
            minDist = d;
            closestName = color.name;
        }
    }
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
    let finalOklch = { mode: 'oklch' as const, l, c: anchorOklch.c, h: originalHue };

    if (over) {
        if (over.mode === 'lch') {
            if (over.hue !== undefined) finalOklch.h = over.hue;
            if (over.chroma !== undefined) finalOklch.c = over.chroma;
            if (over.lightness !== undefined) finalOklch.l = over.lightness / 100;
        } else if (over.mode === 'hsl') {
            const currentHsl = hsl(formatHex(finalOklch)) || { h: 0, s: 0, l: 0 };
            const newHsl = {
                mode: 'hsl' as const,
                h: over.hue !== undefined ? over.hue : currentHsl.h,
                s: over.s !== undefined ? over.s : currentHsl.s,
                l: over.lightness !== undefined ? over.lightness : currentHsl.l
            };
            const backOklch = oklch(newHsl);
            if (backOklch) finalOklch = { mode: 'oklch', l: backOklch.l, c: backOklch.c, h: backOklch.h || 0 };
        } else if (over.mode === 'rgb') {
            const currentRgb = rgb(formatHex(finalOklch)) || { r: 0, g: 0, b: 0 };
            const newRgb = {
                mode: 'rgb' as const,
                r: over.r !== undefined ? over.r : currentRgb.r,
                g: over.g !== undefined ? over.g : currentRgb.g,
                b: over.b !== undefined ? over.b : currentRgb.b
            };
            const backOklch = oklch(newRgb);
            if (backOklch) finalOklch = { mode: 'oklch', l: backOklch.l, c: backOklch.c, h: backOklch.h || 0 };
        } else if (over.mode === 'hsb') {
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

    finalOklch = toGamut(finalOklch);
    const hex = formatHex(finalOklch) || '#000000';
    const backLch = lch(hex);

    return {
        stop,
        hex,
        lch: {
            l: finalOklch.l * 100,
            c: backLch ? backLch.c : finalOklch.c * 100,
            h: finalOklch.h
        },
        contrastWithNext: 0,
        isAnchor
    };
}

export function formatColumnValue(value: number, isPerceptual: boolean): string {
    if (isPerceptual) {
        return (value / 100).toFixed(2);
    }
    return `${value.toFixed(2)}:1`;
}
