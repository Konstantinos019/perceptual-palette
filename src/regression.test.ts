import { describe, it, expect } from 'vitest';
import { generateSwatches, generateOKLCHSwatches } from './colorLogic';

describe('Color Generation Regression (Snapshots)', () => {
    const testHues = [0, 60, 120, 180, 240, 300];
    const testBaseColors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#9600FF'];

    it('OKLCH Swatches should remain identical', () => {
        testHues.forEach(hue => {
            const swatches = generateOKLCHSwatches(hue);
            // We just snapshot the hex values for simplicity and robustness
            expect(swatches.map(s => s.hex)).toMatchSnapshot(`oklch-hue-${hue}`);
        });
    });

    it('Linear Swatches (Legacy) should remain identical', () => {
        ['light', 'dark'].forEach(anchorTheme => {
            testBaseColors.forEach(color => {
                const config = {
                    baseColor: color,
                    stops: [100, 200, 300, 400, 500, 600, 700, 800, 900],
                    overrides: {},
                    anchorStop: 500,
                    anchorTheme: anchorTheme as 'light' | 'dark'
                };
                const swatches = generateSwatches(config);
                expect(swatches.map(s => s.hex)).toMatchSnapshot(`legacy-color-${color}-anchor-${anchorTheme}`);
            });
        });
    });
});
