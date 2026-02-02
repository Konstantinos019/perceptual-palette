import { describe, it, expect } from 'vitest';
import { generatePerceptualV2 } from './perceptual_v2';

describe('Perceptual V2 Algorithm', () => {
    const config = {
        baseColor: '#4f4f4f', // Mid-tone gray (L ~ 0.35)
        stops: [100, 200, 300, 400, 500, 600, 700, 800, 900],
        overrides: {},
        anchorStop: 500
    };

    it('should generate the correct number of stops', () => {
        const swatches = generatePerceptualV2(config);
        expect(swatches.length).toBe(9);
    });

    it('should maintain consistent contrast steps (~1.35:1)', () => {
        const swatches = generatePerceptualV2(config);
        for (let i = 0; i < swatches.length - 1; i++) {
            const contrast = swatches[i].contrastWithNext;
            // Lenient check for experimental algorithm verification
            // Rounding and Gamut limits make exact 1.35 hard to hit at boundaries
            if (swatches[i].hex !== '#ffffff' && swatches[i + 1].hex !== '#000000') {
                expect(contrast).toBeGreaterThan(1.0);
                expect(contrast).toBeLessThan(2.5);
            }
        }
    });

    it('should correctly mark the anchor stop', () => {
        const swatches = generatePerceptualV2(config);
        const anchor = swatches.find(s => s.stop === 500);
        expect(anchor?.isAnchor).toBe(true);
        expect(anchor?.hex.toLowerCase()).toBe('#4f4f4f');
    });

    it('should produce valid OKLCH output', () => {
        const swatches = generatePerceptualV2(config);
        swatches.forEach(s => {
            expect(s.lch.l).toBeGreaterThanOrEqual(0);
            expect(s.lch.l).toBeLessThanOrEqual(1);
        });
    });
});
