import { describe, it, expect } from 'vitest';
import { generateSwatches } from './colorLogic';
import type { PaletteConfig } from './types';

describe('Perceptual Palette Color Logic', () => {
    it('should generate a valid palette structure', () => {
        const config: PaletteConfig = {
            baseColor: '#18A0FB',
            stops: [100, 500, 900],
            overrides: {},
            anchorStop: 500
        };

        const results = generateSwatches(config);

        expect(results).toHaveLength(3);
        expect(results[0].stop).toBe(100);
        expect(results[1].stop).toBe(500);
        expect(results[2].stop).toBe(900);

        // Contract checks
        results.forEach(swatch => {
            expect(swatch).toHaveProperty('hex');
            expect(swatch.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(swatch).toHaveProperty('lch');
            expect(swatch).toHaveProperty('contrastWithNext');
        });
    });

    it('should respect the anchor color at the specified stop', () => {
        // Note: The algorithm generates a fixed lightness scale, so the hex might strictly match 
        // the input only if the input's lightness matches the fixed scale's target for that stop.
        // However, we check that it IS marked as anchor.
        const config: PaletteConfig = {
            baseColor: '#18A0FB',
            stops: [500],
            overrides: {},
            anchorStop: 500
        };

        const results = generateSwatches(config);
        const anchor = results.find(s => s.stop === 500);

        expect(anchor).toBeDefined();
        expect(anchor?.isAnchor).toBe(true);
    });

    it('should handle invalid colors gracefully or throw', () => {
        const config: PaletteConfig = {
            baseColor: 'not-a-color',
            stops: [500],
            overrides: {}
        };

        expect(() => generateSwatches(config)).toThrow();
    });
});

// ==============================================================================
// OKLCH PERCEPTUALLY UNIFORM PALETTE TESTS
// ==============================================================================

import { generateOKLCHSwatches } from './colorLogic';

describe('OKLCH Perceptually Uniform Palette', () => {
    it('should generate 9 swatches for default stops', () => {
        const swatches = generateOKLCHSwatches(210); // Blue hue

        expect(swatches).toHaveLength(9);
        expect(swatches[0].stop).toBe(100);
        expect(swatches[8].stop).toBe(900);
    });

    it('should have fixed lightness values (100=light, 900=dark)', () => {
        const swatches = generateOKLCHSwatches(210);

        // UI order: 100 at top (light), 900 at bottom (dark)
        // So step 100 should have HIGHER lightness than step 900
        expect(swatches[0].lch.l).toBeGreaterThan(swatches[8].lch.l);
    });

    it('should maintain constant hue across all stops', () => {
        const testHue = 120; // Green
        const swatches = generateOKLCHSwatches(testHue);

        // All swatches should have the same hue
        swatches.forEach(swatch => {
            expect(swatch.lch.h).toBe(testHue);
        });
    });

    it('should produce valid hex colors in sRGB gamut', () => {
        const swatches = generateOKLCHSwatches(60); // Yellow (challenging hue)

        swatches.forEach(swatch => {
            expect(swatch.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
        });
    });

    it('should mark stop 500 as anchor', () => {
        const swatches = generateOKLCHSwatches(210);
        const anchor = swatches.find(s => s.isAnchor);

        expect(anchor).toBeDefined();
        expect(anchor?.stop).toBe(500);
    });

    it('should calculate contrast ratios between adjacent swatches', () => {
        const swatches = generateOKLCHSwatches(210);

        // All but the last swatch should have contrast calculated
        for (let i = 0; i < swatches.length - 1; i++) {
            expect(swatches[i].contrastWithNext).toBeGreaterThan(0);
        }
    });

    it('should support custom stops', () => {
        const customStops = [100, 500, 900];
        const swatches = generateOKLCHSwatches(210, customStops);

        expect(swatches).toHaveLength(3);
        expect(swatches.map(s => s.stop)).toEqual(customStops);
    });

    it('should use absolute white for stop 0 and absolute black for stop 1000', () => {
        const swatches = generateOKLCHSwatches(210, [0, 1000]);

        const white = swatches.find(s => s.stop === 0);
        const black = swatches.find(s => s.stop === 1000);

        expect(white?.lch.l).toBe(100);
        expect(black?.lch.l).toBe(0);
        expect(white?.hex.toLowerCase()).toBe('#ffffff');
        expect(black?.hex.toLowerCase()).toBe('#000000');
    });
});
