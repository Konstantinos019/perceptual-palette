import { oklch, wcagContrast, formatHex } from 'culori';

const baseColor = '#4f4f4f';
const baseOklch = oklch(baseColor);
console.log('Base OKLCH:', baseOklch);

const WCAG_TARGET_RATIO = 1.35;
let currentL = baseOklch.l;

console.log('--- Lighter ---');
for (let i = 0; i < 4; i++) {
    const nextL = Math.min(1, WCAG_TARGET_RATIO * (currentL + 0.05) - 0.05);
    const prevHex = formatHex(oklch({ ...baseOklch, l: currentL }));
    const nextHex = formatHex(oklch({ ...baseOklch, l: nextL }));
    console.log(`L: ${currentL.toFixed(3)} -> ${nextL.toFixed(3)} | Contrast: ${wcagContrast(prevHex, nextHex).toFixed(3)}`);
    currentL = nextL;
}

currentL = baseOklch.l;
console.log('--- Darker ---');
for (let i = 0; i < 4; i++) {
    const nextL = Math.max(0, (currentL + 0.05) / WCAG_TARGET_RATIO - 0.05);
    const prevHex = formatHex(oklch({ ...baseOklch, l: currentL }));
    const nextHex = formatHex(oklch({ ...baseOklch, l: nextL }));
    console.log(`L: ${currentL.toFixed(3)} -> ${nextL.toFixed(3)} | Contrast: ${wcagContrast(prevHex, nextHex).toFixed(3)}`);
    currentL = nextL;
}
