import { oklch, wcagContrast, formatHex } from 'culori';
import type { PaletteConfig, SwatchResult } from '../tokens/types';

/**
 * Perceptual V2 Algorithm
 * 
 * Objectives:
 * 1. Maintain uniform perceptual contrast steps.
 * 2. Handle gamut mapping safely.
 * 3. Support both WCAG 2.1 and (future) APCA-like targets.
 */

const WCAG_TARGET_RATIO = 1.35; // Standard stepping ratio

export function generatePerceptualV2(config: PaletteConfig): SwatchResult[] {
    const { baseColor, stops, anchorStop = 500 } = config;

    const baseOklch = oklch(baseColor);
    if (!baseOklch) throw new Error('Invalid base color');

    const sortedStops = [...stops].sort((a, b) => a - b);

    // 1. Find the anchor lightness
    // For now, we use the base color's lightness as the anchor point.
    // In Phase 3, we can add "Anchor Contrast Targets" (e.g., 4.5:1 against Bg).
    const anchorL = baseOklch.l;

    // 2. Generate steps up and down from anchor
    const stopToResult = new Map<number, SwatchResult>();

    // Add anchor first
    stopToResult.set(anchorStop, {
        stop: anchorStop,
        hex: formatHex(baseOklch),
        lch: { l: baseOklch.l, c: baseOklch.c || 0, h: baseOklch.h || 0 },
        contrastWithNext: 0,
        isAnchor: true
    });

    // Generate lighter stops (decreasing index from anchor)
    let currentL = anchorL;
    const lighterStops = sortedStops.filter(s => s < anchorStop).reverse();
    for (const stop of lighterStops) {
        // L_next = 1.35 * (L_prev + 0.05) - 0.05
        currentL = Math.min(1, WCAG_TARGET_RATIO * (currentL + 0.05) - 0.05);
        stopToResult.set(stop, createSwatch(stop, currentL, baseOklch, config));
    }

    // Generate darker stops (increasing index from anchor)
    currentL = anchorL;
    const darkerStops = sortedStops.filter(s => s > anchorStop);
    for (const stop of darkerStops) {
        // L_next = (L_prev + 0.05) / 1.35 - 0.05
        currentL = Math.max(0, (currentL + 0.05) / WCAG_TARGET_RATIO - 0.05);
        stopToResult.set(stop, createSwatch(stop, currentL, baseOklch, config));
    }

    // 3. Finalize and calculate contrast
    const finalResults = sortedStops.map(s => stopToResult.get(s)!);
    finalResults.forEach((swatch, i) => {
        const next = finalResults[i + 1];
        if (next) {
            swatch.contrastWithNext = wcagContrast(swatch.hex, next.hex);
        }
    });

    return finalResults;
}

function createSwatch(stop: number, l: number, base: any, config: PaletteConfig): SwatchResult {
    const target = {
        mode: 'oklch' as const,
        l: l,
        c: config.oklchVividness ?? base.c ?? 0,
        h: config.oklchHue ?? base.h ?? 0
    };

    return {
        stop,
        hex: formatHex(target),
        lch: { l: target.l, c: target.c, h: target.h },
        contrastWithNext: 0,
        isAnchor: false
    };
}
