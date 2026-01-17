import { generateSwatches, generateOKLCHSwatches, wcagContrast, hsl, rgb, lch, hexToFigmaRgb, getColorName, oklch, formatHex } from './colorLogic';
import { DOM_IDS, type PaletteConfig, type SwatchResult, type FigmaExportPayload, type DetectedPalette } from './types';

// State
const STANDARD_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const HUE_OFFSET = 29; // Slider 0 maps to OKLCH 29° (Red)

interface AppState extends PaletteConfig {
    anchorStop: number;
    paletteMode: 'legacy' | 'oklch';
    oklchHue: number;
    oklchVividness: number;
    theme: 'dark' | 'light';
}

const INITIAL_STATE: AppState = {
    baseColor: '#9600FF',
    stops: [...STANDARD_STOPS], // Standard 100-900
    overrides: {},
    showOriginal: false,
    anchorStop: 500,
    paletteMode: 'oklch',
    oklchHue: 297,
    oklchVividness: 1,
    theme: 'light'
};

let state: AppState = JSON.parse(JSON.stringify(INITIAL_STATE));

let activeStop: number | 'seed' | null = null;
let lastAddedStop: number | null = null;

// Figma Tokens Database State (V 0.0.79)
let detectedPalettes: DetectedPalette[] = [];
let selectedPaletteId: string | null = null; // hueName of selected palette
let originalPaletteData: { stop: number; hex: string }[] | null = null; // Snapshot for dirty-checking (Phase 2)
let isDirty = false; // Phase 2: Track unsaved changes

// Phase 2 helper: Check if current palette has unsaved changes
export function hasPendingChanges(): boolean {
    return isDirty && originalPaletteData !== null;
}

// Elements
const colorInput = document.getElementById(DOM_IDS.BASE_COLOR_INPUT) as HTMLInputElement;
const colorPicker = document.getElementById('base-color-picker') as HTMLInputElement;
const container = document.getElementById(DOM_IDS.STOPS_CONTAINER) as HTMLElement;
const modal = document.getElementById(DOM_IDS.REFINE_MODAL) as HTMLElement;
// const modalContent = modal?.querySelector('.params-card') as HTMLElement; // For click-outside check
const exportBtn = document.getElementById(DOM_IDS.EXPORT_BTN) as HTMLButtonElement;
const resetBtn = document.getElementById('reset-plugin') as HTMLButtonElement;
const hueSlider = document.getElementById('hue-slider') as HTMLInputElement;
const chromaSlider = document.getElementById('chroma-slider') as HTMLInputElement;
const hueVal = document.getElementById('hue-val') as HTMLElement;
const chromaVal = document.getElementById('chroma-val') as HTMLElement;

// Mode Toggle Elements
const modeLegacyBtn = document.getElementById('mode-legacy') as HTMLButtonElement;
const modeOklchBtn = document.getElementById('mode-oklch') as HTMLButtonElement;
const oklchHueSlider = document.getElementById('oklch-hue-slider') as HTMLInputElement;
const oklchHueValue = document.getElementById('oklch-hue-value') as HTMLElement;
const oklchVividnessSlider = document.getElementById('oklch-vividness-slider') as HTMLInputElement;
const oklchVividnessValue = document.getElementById('oklch-vividness-value') as HTMLElement;
const modeThumb = document.getElementById('mode-thumb') as HTMLElement;

const themeToggleBtn = document.getElementById('theme-toggle') as HTMLButtonElement;
const themeIconDark = document.getElementById('theme-icon-dark') as HTMLElement;
const themeIconLight = document.getElementById('theme-icon-light') as HTMLElement;
const tokensToggle = document.getElementById('create-tokens-toggle') as HTMLElement;

// Sidebar Elements (V 0.0.79)
const palettePillsContainer = document.getElementById('palette-pills') as HTMLElement;
const addPaletteBtn = document.getElementById('add-palette-btn') as HTMLButtonElement;

// Helper to get contrast reference color based on theme
// Light theme = white background → contrast vs white
// Dark theme = dark background → contrast vs black
function getContrastBackground(): string {
    return state.theme === 'light' ? '#ffffff' : '#000000';
}

/**
 * Syncs the state and UI when a color input changes.
 * Handles HEX -> OKLCH and OKLCH -> HEX conversions.
 */
function syncColorInputs(source: 'hex' | 'sliders') {
    if (source === 'hex') {
        const color = oklch(state.baseColor);
        if (color) {
            // Update Hue
            state.oklchHue = Math.round(color.h || 0);
            const sliderHue = (state.oklchHue - HUE_OFFSET + 360) % 360;
            if (oklchHueSlider) oklchHueSlider.value = String(Math.round(sliderHue));
            if (oklchHueValue) oklchHueValue.innerText = `${state.oklchHue}°`;

            // Update Vividness
            const vividnessPct = Math.min(100, Math.round((color.c || 0) / 0.4 * 100));
            state.oklchVividness = vividnessPct / 100;
            if (oklchVividnessSlider) oklchVividnessSlider.value = String(vividnessPct);
            if (oklchVividnessValue) oklchVividnessValue.innerText = `${vividnessPct}%`;
        }
    } else {
        // Sliders are source
        // Construct a representative HEX for the "Anchor color" pill
        // using the current hue/vividness while PRESERVING current lightness
        const currentColor = oklch(state.baseColor) || { l: 0.5, c: 0, h: 0 };
        const representativeColor = {
            mode: 'oklch' as const,
            l: currentColor.l,
            c: state.oklchVividness * 0.4, // Match the 0.4 normalization
            h: state.oklchHue
        };
        const hex = formatHex(representativeColor) || '#000000';
        state.baseColor = hex;
        if (colorInput) colorInput.value = hex.toUpperCase();
        if (colorPicker) colorPicker.value = hex;
    }

    // Always update the preview pill background
    const previewBg = document.getElementById('color-preview-bg');
    if (previewBg) previewBg.style.background = state.baseColor;

    // Always update Vividness slider background to reflect current hue
    const vividWrapper = document.querySelector('.vivid-slider-wrapper') as HTMLElement;
    if (vividWrapper) {
        const h = state.oklchHue;
        // Boosted lightness to 0.68 for spectral vibrancy
        const startColor = formatHex({ mode: 'oklch', l: 0.68, c: 0, h: h }) || '#cccccc';
        const endColor = formatHex({ mode: 'oklch', l: 0.68, c: 0.35, h: h }) || '#00ff00';
        vividWrapper.style.background = `linear-gradient(to right, ${startColor}, ${endColor})`;
    }

    // Always update Hue slider background to match OKLCH progression
    // Synchronized with Vividness state in V 0.0.64
    const hueWrapper = document.querySelector('.hue-slider-wrapper') as HTMLElement;
    if (hueWrapper) {
        const steps = 36;
        const gradientColors = [];
        const dynamicChroma = Math.max(0, state.oklchVividness * 0.32); // Use dynamic vividness
        for (let i = 0; i <= steps; i++) {
            const logicalHue = (i * (360 / steps) + HUE_OFFSET) % 360;
            const c = formatHex({ mode: 'oklch', l: 0.68, c: dynamicChroma, h: logicalHue }) || '#ff0000';
            gradientColors.push(c);
        }
        hueWrapper.style.background = `linear-gradient(to right, ${gradientColors.join(', ')})`;
    }
}

function getSwatches(): SwatchResult[] {
    if (state.paletteMode === 'oklch') {
        return generateOKLCHSwatches(state.oklchHue, state.stops, state.oklchVividness);
    }
    return generateSwatches(state);
}

function update() {
    try {
        const swatches = getSwatches();
        render(swatches);
    } catch (e) {
        console.error('Update failed', e);
    }
}

function render(swatches: SwatchResult[]) {
    // V 0.0.79: Dirty State Checking
    checkDirty();

    container.innerHTML = '';

    // Update table header based on mode
    const tableHeader = document.querySelector('.list-header') as HTMLElement;
    if (tableHeader) {
        tableHeader.innerHTML = `
            <div class="cell">OKLCH Lc Ratio</div>
            <div class="cell">Name</div>
            <div class="cell" style="text-align: center;">Color</div>
        `;
    }

    // Status Icon Helper (Material Symbols Rounded)
    const getStatusIcon = (passed: boolean) => passed ?
        `<span class="material-symbols-rounded status-icon check">check_circle</span>` :
        `<span class="material-symbols-rounded status-icon warning">warning</span>`;

    // 0. WHITE PLACEHOLDER (Reference)
    const whiteRow = document.createElement('div');
    whiteRow.className = 'list-row placeholder';
    whiteRow.innerHTML = `
        <div class="list-row__cell">1.00 ${getStatusIcon(false)}</div>
        <div class="list-row__cell cell-name">White</div>
        <div class="list-row__cell cell-color">
            <div class="color-pill" style="background-color: #FFFFFF;"></div>
        </div>
    `;
    container.appendChild(whiteRow);

    // 0.5. EDGE INSERTION: White <-> First Swatch
    if (swatches.length > 0) {
        const firstStop = Number(swatches[0].stop);
        const edgeMidpoint = Math.round(firstStop / 2);

        if (edgeMidpoint > 0 && !state.stops.includes(edgeMidpoint)) {
            try {
                const tempState = { ...state, stops: [edgeMidpoint], overrides: {} };
                const [tempSwatch] = generateSwatches(tempState);
                if (tempSwatch.hex.toLowerCase() !== '#ffffff') {
                    const edgeRowStart = document.createElement('div');
                    edgeRowStart.className = 'insertion-row';
                    edgeRowStart.innerHTML = `<button class="insert-btn" title="Add stop ${edgeMidpoint}">+</button>`;
                    const btn = edgeRowStart.querySelector('.insert-btn') as HTMLButtonElement;
                    if (btn) {
                        btn.onclick = () => {
                            lastAddedStop = edgeMidpoint;
                            state.stops.push(edgeMidpoint);
                            state.stops.sort((a, b) => a - b);
                            update();
                        };
                    }
                    container.appendChild(edgeRowStart);
                }
            } catch (e) { }
        }
    }

    swatches.forEach((s, i) => {
        // 1. Table Row
        const row = document.createElement('div');
        const isNew = Number(s.stop) === lastAddedStop;
        row.className = `list-row ${s.isAnchor ? 'is-anchor' : ''} ${isNew ? 'new-row' : ''}`;

        // Calculate contrast
        const hex = s.hex || '#000000';
        const contrast = wcagContrast(hex, getContrastBackground()).toFixed(2);
        const isPass = parseFloat(contrast) >= 4.5;

        let labelId = s.stop.toString();
        if (s.isAnchor) labelId = `${s.stop} (Seed)`;

        const isIntermediate = !STANDARD_STOPS.includes(Number(s.stop)) && !s.isAnchor;
        let deleteBtnHtml = '';
        if (isIntermediate) {
            deleteBtnHtml = `<span class="delete-stop-btn material-symbols-rounded" title="Remove stop">delete</span>`;
        }

        row.innerHTML = `
            <div class="list-row__cell">
                ${contrast} 
                ${getStatusIcon(isPass || s.isAnchor)}
            </div>
            <div class="list-row__cell cell-name">
                <span class="stop-number">${labelId}</span>
            </div>
            <div class="list-row__cell cell-color">
                <div class="color-pill" style="background-color: ${hex};"></div>
                ${deleteBtnHtml}
            </div>
        `;

        if (isIntermediate) {
            const delBtn = row.querySelector('.delete-stop-btn') as HTMLElement;
            if (delBtn) {
                delBtn.onclick = (e) => {
                    e.stopPropagation(); // Prevents openRefine

                    // Exit Animation Lifecycle
                    row.classList.add('removing');
                    setTimeout(() => {
                        state.stops = state.stops.filter(stop => stop !== Number(s.stop));
                        state.stops.sort((a, b) => a - b);
                        update();
                    }, 250); // Matches CSS row-exit duration
                };
            }
        }

        row.onclick = () => {
            openRefine(s);
        };

        container.appendChild(row);

        // 2. INSERTION POINT (Between this and next)
        const currentStop = Number(s.stop);
        const nextStop = i < swatches.length - 1 ? Number(swatches[i + 1].stop) : 1000; // 1000 as max
        const midpoint = Math.round((currentStop + nextStop) / 2);

        if (midpoint > currentStop && midpoint < nextStop && !state.stops.includes(midpoint)) {
            const insertionRow = document.createElement('div');
            insertionRow.className = 'insertion-row';
            insertionRow.innerHTML = `<button class="insert-btn" title="Add stop ${midpoint}">+</button>`;

            const btn = insertionRow.querySelector('.insert-btn') as HTMLButtonElement;
            if (btn) {
                btn.onclick = () => {
                    lastAddedStop = midpoint;
                    state.stops.push(midpoint);
                    state.stops.sort((a, b) => a - b);
                    update();
                };
            }
            container.appendChild(insertionRow);
        }
    });

    // 4. BLACK PLACEHOLDER
    const blackRow = document.createElement('div');
    blackRow.className = 'list-row placeholder';
    blackRow.innerHTML = `
        <div class="list-row__cell">21.00 ${getStatusIcon(true)}</div>
        <div class="list-row__cell cell-name">Black</div>
        <div class="list-row__cell cell-color">
            <div class="color-pill" style="background-color: #000000;"></div>
        </div>
    `;
    container.appendChild(blackRow);

    // Reset animation state
    lastAddedStop = null;
}

function openRefine(swatch: SwatchResult) {
    console.log('Opening refine modal for:', swatch);
    activeStop = swatch.isOriginal ? 'seed' : swatch.stop;
    const title = document.getElementById('modal-stop-title') as HTMLElement;
    title.innerText = swatch.isOriginal ? `Refine Original Color` : `Refine Stop ${swatch.stop}`;

    // 1. Capture original algorithmic color (no overrides)
    const tempState = { ...state, overrides: {} };
    const baseSwatches = generateSwatches(tempState);
    const original = swatch.isOriginal ? baseSwatches.find(x => x.isOriginal) : baseSwatches.find(x => x.stop === swatch.stop);

    if (original) {
        document.getElementById('preview-before')!.style.backgroundColor = original.hex;

        // 2. Initialize override if missing
        const stopKey = activeStop as number; // Type casting for ease, logic handles 'seed' if it were used
        if (!state.overrides[stopKey]) {
            const cHsl = hsl(original.hex) || { h: 0, s: 0, l: 0 };
            state.overrides[stopKey] = { mode: 'hsl', hue: cHsl.h || 0, s: cHsl.s || 0, lightness: cHsl.l || 0 };
        }
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    const override = state.overrides[activeStop as number];
    const mode = override ? (override.mode || 'hsl') : 'hsl';
    switchMode(mode);
}

function switchMode(newMode: string) {
    if (activeStop === null) return;
    const stopKey = activeStop as number;

    const currentSwatches = generateSwatches(state);
    const currentSwatch = activeStop === 'seed' ? currentSwatches.find(x => x.isOriginal) : currentSwatches.find(x => x.stop === activeStop);

    if (currentSwatch) {
        const currentHex = currentSwatch.hex;

        if (newMode === 'lch') {
            const cLch = lch(currentHex) || { l: 0, c: 0, h: 0 };
            state.overrides[stopKey] = { mode: 'lch', hue: cLch.h || 0, chroma: cLch.c || 0, lightness: cLch.l || 0 };
        } else if (newMode === 'hsl') {
            const cHsl = hsl(currentHex) || { h: 0, s: 0, l: 0 };
            state.overrides[stopKey] = { mode: 'hsl', hue: cHsl.h || 0, s: cHsl.s || 0, lightness: cHsl.l || 0 };
        } else if (newMode === 'rgb') {
            const cRgb = rgb(currentHex) || { r: 0, g: 0, b: 0 };
            state.overrides[stopKey] = { mode: 'rgb', r: cRgb.r || 0, g: cRgb.g || 0, b: cRgb.b || 0 };
        }
    }

    const modalThumb = document.getElementById('modal-mode-thumb');
    const modes = ['lch', 'hsl', 'rgb'];
    const modeIndex = modes.indexOf(newMode);

    if (modalThumb && modeIndex !== -1) {
        modalThumb.style.transform = `translateX(${modeIndex * 100}%)`;
    }

    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-mode') === newMode);
    });
    document.querySelectorAll('.mode-content').forEach(content => {
        content.classList.toggle('active', content.id === `${newMode}-controls`);
    });

    syncSliders(newMode);
    update();
    updateModalPreview();
}

function syncSliders(mode: string) {
    const override = state.overrides[activeStop as number];
    if (!override) return;

    if (mode === 'lch') {
        hueSlider.value = String(override.hue);
        chromaSlider.value = String(override.chroma);
        (document.getElementById('lch-l-slider') as HTMLInputElement).value = String(override.lightness);

        hueVal.innerText = `${Math.round(override.hue || 0)}°`;
        chromaVal.innerText = String(Math.round(override.chroma || 0));
        (document.getElementById('lch-l-val') as HTMLElement).innerText = String(Math.round(override.lightness || 0));
    } else if (mode === 'hsl') {
        (document.getElementById('hsl-h-slider') as HTMLInputElement).value = String(override.hue);
        (document.getElementById('hsl-s-slider') as HTMLInputElement).value = String((override.s || 0) * 100);
        (document.getElementById('hsl-l-slider') as HTMLInputElement).value = String((override.lightness || 0) * 100);
        (document.getElementById('hsl-h-val') as HTMLElement).innerText = `${Math.round(override.hue || 0)}°`;
        (document.getElementById('hsl-s-val') as HTMLElement).innerText = `${Math.round((override.s || 0) * 100)}%`;
        (document.getElementById('hsl-l-val') as HTMLElement).innerText = `${Math.round((override.lightness || 0) * 100)}%`;
    } else if (mode === 'rgb') {
        const r = Math.round((override.r || 0) * 255);
        const g = Math.round((override.g || 0) * 255);
        const b = Math.round((override.b || 0) * 255);
        (document.getElementById('rgb-r-slider') as HTMLInputElement).value = String(r);
        (document.getElementById('rgb-g-slider') as HTMLInputElement).value = String(g);
        (document.getElementById('rgb-b-slider') as HTMLInputElement).value = String(b);
        (document.getElementById('rgb-r-val') as HTMLElement).innerText = String(r);
        (document.getElementById('rgb-g-val') as HTMLElement).innerText = String(g);
        (document.getElementById('rgb-b-val') as HTMLElement).innerText = String(b);
    }
}

// Modal Tabs Listeners
document.querySelectorAll('.modal-tab').forEach(tab => {
    (tab as HTMLButtonElement).onclick = () => switchMode(tab.getAttribute('data-mode') || 'lch');
});

hueSlider.oninput = (e) => {
    const target = e.target as HTMLInputElement;
    const h = parseFloat(target.value);
    state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], hue: h };
    hueVal.innerText = `${Math.round(h)}°`;
    update(); updateModalPreview();
};
chromaSlider.oninput = (e) => {
    const target = e.target as HTMLInputElement;
    const c = parseFloat(target.value);
    state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], chroma: c };
    chromaVal.innerText = String(Math.round(c));
    update(); updateModalPreview();
};
(document.getElementById('lch-l-slider') as HTMLInputElement).oninput = (e) => {
    const target = e.target as HTMLInputElement;
    const l = parseFloat(target.value);
    state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], lightness: l };
    (document.getElementById('lch-l-val') as HTMLElement).innerText = String(Math.round(l));
    update(); updateModalPreview();
};

// Reset Override
(document.getElementById('reset-override') as HTMLButtonElement).onclick = () => {
    const stopKey = activeStop as number;
    if (activeStop === null) return;
    delete state.overrides[stopKey];

    const tempState = { ...state, overrides: {} };
    const baseSwatches = generateSwatches(tempState);
    const original = activeStop === 'seed' ? baseSwatches.find(x => x.isOriginal) : baseSwatches.find(x => x.stop === activeStop);

    if (original) {
        const cHsl = hsl(original.hex) || { h: 0, s: 0, l: 0 };
        state.overrides[stopKey] = { mode: 'hsl', hue: cHsl.h || 0, s: cHsl.s || 0, lightness: cHsl.l || 0 };
    }

    switchMode('hsl');
    update();
    updateModalPreview();
};

// HSL Listeners
(document.getElementById('hsl-h-slider') as HTMLInputElement).oninput = (e) => {
    const target = e.target as HTMLInputElement;
    const h = parseFloat(target.value);
    state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], hue: h };
    (document.getElementById('hsl-h-val') as HTMLElement).innerText = `${Math.round(h)}°`;
    update(); updateModalPreview();
};
(document.getElementById('hsl-s-slider') as HTMLInputElement).oninput = (e) => {
    const target = e.target as HTMLInputElement;
    const sPct = parseFloat(target.value);
    state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], s: sPct / 100 };
    (document.getElementById('hsl-s-val') as HTMLElement).innerText = `${Math.round(sPct)}%`;
    update(); updateModalPreview();
};
(document.getElementById('hsl-l-slider') as HTMLInputElement).oninput = (e) => {
    const target = e.target as HTMLInputElement;
    const lPct = parseFloat(target.value);
    state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], lightness: lPct / 100 };
    (document.getElementById('hsl-l-val') as HTMLElement).innerText = `${Math.round(lPct)}%`;
    update(); updateModalPreview();
};

// RGB Listeners
['r', 'g', 'b'].forEach(chan => {
    (document.getElementById(`rgb-${chan}-slider`) as HTMLInputElement).oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const val = parseInt(target.value);
        state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], [chan]: val / 255 };
        (document.getElementById(`rgb-${chan}-val`) as HTMLElement).innerText = String(val);
        update(); updateModalPreview();
    };
});

function closeModal() {
    modal.classList.add('hidden');
    activeStop = null;
}

(document.getElementById('close-modal') as HTMLButtonElement).onclick = closeModal;

// Connect Done button (same as close)
const doneBtn = document.getElementById('save-modal-btn');
if (doneBtn) doneBtn.onclick = closeModal;

// Click outside to close
if (modal) {
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };
}

function updateModalPreview() {
    if (activeStop === null) return;
    const swatches = generateSwatches(state);
    const swatch = activeStop === 'seed' ? swatches.find(x => x.isOriginal) : swatches.find(s => s.stop === activeStop);

    if (!swatch) return;

    // Get Original for comparison
    const tempState = { ...state, overrides: {} };
    const baseSwatches = generateSwatches(tempState);
    const original = activeStop === 'seed' ? baseSwatches.find(x => x.isOriginal) : baseSwatches.find(s => s.stop === (typeof activeStop === 'string' ? swatch.stop : activeStop));

    if (!original) return;

    const afterPill = document.getElementById('preview-after') as HTMLElement;
    afterPill.style.backgroundColor = swatch.hex;

    const hexBeforeLabel = document.getElementById('hex-before-label') as HTMLElement;
    const hexAfterLabel = document.getElementById('hex-after-label') as HTMLElement;

    hexBeforeLabel.innerText = swatch.hex.toUpperCase();
    hexAfterLabel.innerText = original.hex.toUpperCase();

    hexBeforeLabel.style.color = swatch.lch.l > 60 ? '#000' : '#fff';
    hexAfterLabel.style.color = original.lch.l > 60 ? '#000' : '#fff';
}

// Event Listeners (Base Color)
colorInput.oninput = (e) => {
    const target = e.target as HTMLInputElement;
    let val = target.value;
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-F]{6}$/i.test(val)) {
        state.baseColor = val;
        colorPicker.value = val;
        syncColorInputs('hex');
        update();
    }
};

colorPicker.oninput = (e) => {
    const target = e.target as HTMLInputElement;
    state.baseColor = target.value;
    colorInput.value = state.baseColor.toUpperCase();
    syncColorInputs('hex');
    update();
};

// ==============================================================================
// MODE TOGGLE HANDLERS
// ==============================================================================

function setMode(mode: 'legacy' | 'oklch') {
    state.paletteMode = mode;
    // We NO LONGER reset overrides or stops when switching modes
    // because the user might want to compare the same settings in different algos.

    // Update UI tabs
    modeLegacyBtn.classList.toggle('active', mode === 'legacy');
    modeOklchBtn.classList.toggle('active', mode === 'oklch');

    // Slide the thumb
    if (modeThumb) {
        modeThumb.style.transform = mode === 'legacy' ? 'translateX(0)' : 'translateX(100%)';
    }

    // Both modes now share the same color picking options (sliders + hex)
    // as they are bi-directionally synced.

    update();
}

modeLegacyBtn.onclick = () => setMode('legacy');
modeOklchBtn.onclick = () => setMode('oklch');

// OKLCH Hue Slider
oklchHueSlider.oninput = (e) => {
    const target = e.target as HTMLInputElement;
    const sliderHue = parseInt(target.value, 10);
    // Offset logic: 0 on slider maps to OKLCH 29° (Red)
    const logicalHue = (sliderHue + HUE_OFFSET) % 360;
    state.oklchHue = logicalHue;
    oklchHueValue.innerText = `${logicalHue}°`;
    syncColorInputs('sliders');
    update();
};

// OKLCH Vividness Slider
oklchVividnessSlider.oninput = (e) => {
    const target = e.target as HTMLInputElement;
    const vividness = parseInt(target.value, 10);
    state.oklchVividness = vividness / 100; // Convert 0-100 to 0-1
    oklchVividnessValue.innerText = `${vividness}%`;
    syncColorInputs('sliders');
    update();
};


exportBtn?.addEventListener('click', () => {
    const tokensToggle = document.getElementById('create-tokens-toggle');
    const createVariables = tokensToggle ? tokensToggle.classList.contains('active') : false;

    // Use getSwatches to respect current mode, excluding pure white/black
    const swatches = getSwatches().filter(s =>
        s.hex.toLowerCase() !== '#ffffff' && s.hex.toLowerCase() !== '#000000'
    );

    // Prepare "Dumb Renderer" Payload
    // We do ALL the math here so code.ts is just a view layer.
    const anchorSwatch = swatches.find(s => s.isAnchor) || swatches[Math.floor(swatches.length / 2)];
    const safeAnchor = anchorSwatch || swatches[0];

    // For OKLCH mode, use hue-based naming
    let baseColorName: string;
    if (state.paletteMode === 'oklch') {
        // Map hue to color name
        const hue = state.oklchHue;
        if (hue < 15 || hue >= 345) baseColorName = 'Red';
        else if (hue < 45) baseColorName = 'Orange';
        else if (hue < 75) baseColorName = 'Yellow';
        else if (hue < 150) baseColorName = 'Green';
        else if (hue < 190) baseColorName = 'Teal';
        else if (hue < 260) baseColorName = 'Blue';
        else if (hue < 300) baseColorName = 'Indigo';
        else if (hue < 345) baseColorName = 'Purple';
        else baseColorName = 'Red';
    } else {
        baseColorName = getColorName(hexToFigmaRgb(safeAnchor?.hex || state.baseColor));
    }

    const finalSwatches = swatches.map(s => {
        const rgb = hexToFigmaRgb(s.hex);
        // Calculate contrast against theme background
        const contrast = wcagContrast(s.hex, getContrastBackground());

        return {
            stop: s.stop,
            hex: s.hex,
            color: rgb,
            contrast: contrast,
            isPass: contrast >= 4.5,
            isAnchor: s.isAnchor,
            isOriginal: s.isOriginal
        };
    });

    // Construct Typesafe Payload
    const action = originalPaletteData ? 'update' : 'create';
    const payload: FigmaExportPayload = {
        name: baseColorName,
        createVariables,
        swatches: finalSwatches,
        action: action,
        paletteId: selectedPaletteId || undefined
    };

    parent.postMessage({
        pluginMessage: {
            type: 'EXPORT_TO_FIGMA',
            payload: payload
        }
    }, '*');
});

window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (msg.type === 'SET_BASE_COLOR') {
        state.baseColor = msg.hex;
        state.overrides = {};
        colorInput.value = msg.hex;
        colorPicker.value = msg.hex;
        update();
    } else if (msg.type === 'PALETTES_DATA') {
        // V 0.0.79: Receive detected palettes from Figma
        detectedPalettes = msg.palettes || [];
        renderPaletteSidebar();
    }
};

/**
 * Renders the palette sidebar with detected palettes (V 0.0.79)
 */
function renderPaletteSidebar() {
    const sidebar = document.getElementById('palette-sidebar');
    if (!palettePillsContainer || !sidebar) return;

    // V 0.0.79: Hide sidebar if no palettes exist (User Request)
    if (detectedPalettes.length === 0) {
        sidebar.style.display = 'none';
        return;
    } else {
        sidebar.style.display = 'flex';
    }

    // Clear existing pills
    palettePillsContainer.innerHTML = '';

    // Render each detected palette as a pill
    detectedPalettes.forEach((palette) => {
        const pill = document.createElement('button');
        pill.className = 'palette-pill';
        if (selectedPaletteId === palette.hueName) {
            pill.classList.add('palette-pill--active');
        }
        pill.style.backgroundColor = palette.previewHex;
        pill.title = palette.hueName;

        pill.onclick = () => {
            selectPalette(palette.hueName);
        };

        palettePillsContainer.appendChild(pill);
    });
}

/**
 * Selects a palette from the sidebar and loads it into the editor (V 0.0.79)
 */
function selectPalette(hueName: string) {
    const palette = detectedPalettes.find(p => p.hueName === hueName);
    if (!palette) return;

    // Update selection state
    selectedPaletteId = hueName;

    // Store original data for dirty-checking
    originalPaletteData = palette.stops.map(s => ({ stop: s.stop, hex: s.hex }));
    isDirty = false;

    // LOAD PALETTE INTO EDITOR
    // 1. Find the 500 stop (or closest) to use as "Anchor"
    const anchorStop = palette.stops.find(s => s.stop === 500)
        || palette.stops[Math.floor(palette.stops.length / 2)]
        || palette.stops[0];

    state.baseColor = anchorStop.hex;
    state.anchorStop = anchorStop.stop;

    // 2. Set stops based on what's in the palette
    state.stops = palette.stops.map(s => s.stop).sort((a, b) => a - b);

    // 3. Set Overrides for EVERYTHING to ensure fidelity
    // This treats existing tokens as "locked" values unless manually changed by the user.
    state.overrides = {};
    palette.stops.forEach(s => {
        state.overrides[s.stop] = { mode: 'lch', ...lch(s.hex) }; // Store LCH as override reference
    });

    // 4. Update UI Inputs
    // 4. Update UI Inputs
    colorInput.value = state.baseColor;
    colorPicker.value = state.baseColor;

    // SYNC SLIDERS TO SELECTED PALETTE
    const baseOklch = oklch(state.baseColor);
    if (baseOklch) {
        state.oklchHue = baseOklch.h || 0;
        state.oklchVividness = (baseOklch.c || 0) / 0.4;
    }

    // 5. Sync & Update
    syncColorInputs('hex');
    update();

    // Re-render sidebar to highlight selection
    renderPaletteSidebar();
}

// Request palettes on boot (V 0.0.79)
parent.postMessage({ pluginMessage: { type: 'GET_PALETTES' } }, '*');

// Add palette button handler
if (addPaletteBtn) {
    addPaletteBtn.onclick = () => {
        // Clear selection for "new palette" mode
        selectedPaletteId = null;
        originalPaletteData = null;
        isDirty = false;

        // Reset overrides to unlock the generator
        state.overrides = {};
        state.stops = [...STANDARD_STOPS];

        renderPaletteSidebar();
        update();
    };
}

/**
 * Checks if current state differs from the loaded palette (V 0.0.79)
 */
function checkDirty() {
    if (!originalPaletteData) {
        if (isDirty) { // Only update if changing state
            isDirty = false;
            updateButtonState();
        }
        return;
    }

    const currentSwatches = getSwatches();

    // Quick length check
    if (currentSwatches.length !== originalPaletteData.length) {
        isDirty = true;
        updateButtonState();
        return;
    }

    // Deep compare hex values
    let hasChanges = false;
    for (const originalStop of originalPaletteData) {
        const match = currentSwatches.find(s => s.stop === originalStop.stop);
        if (!match || match.hex.toUpperCase() !== originalStop.hex.toUpperCase()) {
            hasChanges = true;
            break;
        }
    }

    if (isDirty !== hasChanges) {
        isDirty = hasChanges;
        updateButtonState();
    }
}

/**
 * Updates the main action button text based on state (V 0.0.79)
 */
function updateButtonState() {
    if (!exportBtn) return;
    const btnText = document.getElementById('btn-text');
    if (!btnText) return;

    if (originalPaletteData && isDirty) {
        // Editing existing palette with changes
        btnText.innerHTML = `Save Changes`;
        exportBtn.classList.add('btn--save');
        // Update Icon if possible, or just text? 
        // The implementation plan says update innerHTML of exportBtn but current HTML might lose icon.
        // Let's replace the whole innerHTML to be safe
        exportBtn.innerHTML = `
            <span class="material-symbols-rounded btn-icon">save</span>
            <span id="btn-text">Save Changes</span>
        `;
    } else if (originalPaletteData && !isDirty) {
        // Editing existing palette with NO changes
        exportBtn.innerHTML = `
            <span class="material-symbols-rounded btn-icon" style="font-variation-settings: 'FILL' 1;">check_circle</span>
            <span id="btn-text">Saved</span>
        `;
    } else {
        // Creating new palette
        exportBtn.innerHTML = `
             <span class="material-symbols-rounded btn-icon" style="font-variation-settings: 'FILL' 1;">palette</span>
             <span id="btn-text">Generate Palette</span>
        `;
        exportBtn.classList.remove('btn--save');
    }
}



// ==============================================================================
// THEME TOGGLE HANDLER
// ==============================================================================

function setThemeUI(theme: 'light' | 'dark') {
    state.theme = theme;
    document.body.classList.toggle('light-theme', theme === 'light');

    // Update Icons
    if (theme === 'light') {
        themeIconDark.style.display = 'none';
        themeIconLight.style.display = 'block';
    } else {
        themeIconDark.style.display = 'block';
        themeIconLight.style.display = 'none';
    }

    update();
}

function toggleTheme() {
    setThemeUI(state.theme === 'dark' ? 'light' : 'dark');
}

if (themeToggleBtn) {
    themeToggleBtn.onclick = toggleTheme;
}

// Initial Theme Check
setThemeUI(state.theme);

// Reset handler
if (resetBtn) {
    resetBtn.onclick = () => {
        resetPlugin();
    };
}

// Global Tooltip Management - V 0.0.71 (Refined Persistence)
const tooltipTrigger = document.getElementById('gen-mode-help');
const globalTooltip = document.getElementById('global-tooltip');
let tooltipHideTimeout: number | null = null;

if (tooltipTrigger && globalTooltip) {
    const showTooltip = () => {
        if (tooltipHideTimeout) {
            clearTimeout(tooltipHideTimeout);
            tooltipHideTimeout = null;
        }

        const rect = tooltipTrigger.getBoundingClientRect();
        globalTooltip.style.display = 'block';

        // Calculate dimensions
        const tooltipWidth = 260; // Fixed in CSS
        const padding = 16;

        // Horizontal Positioning (Centered by default)
        let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);

        // Right Edge Detection
        if (left + tooltipWidth > window.innerWidth - padding) {
            left = window.innerWidth - tooltipWidth - padding;
        }

        // Left Edge Detection
        if (left < padding) {
            left = padding;
        }

        // Vertical Positioning (Above by default)
        let top = rect.top - globalTooltip.offsetHeight - 12;

        // Top Edge Detection (Flip to bottom if no space)
        if (top < padding) {
            top = rect.bottom + 12;
        }

        globalTooltip.style.left = `${left}px`;
        globalTooltip.style.top = `${top}px`;

        // Trigger opacity transition
        requestAnimationFrame(() => {
            globalTooltip.classList.add('active');
        });
    };

    const startHideTimeout = () => {
        if (tooltipHideTimeout) clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = window.setTimeout(() => {
            globalTooltip.classList.remove('active');
            setTimeout(() => {
                if (!globalTooltip.classList.contains('active')) {
                    globalTooltip.style.display = 'none';
                }
            }, 200);
            tooltipHideTimeout = null;
        }, 300); // 300ms persistence window
    };

    tooltipTrigger.onmouseenter = showTooltip;
    tooltipTrigger.onmouseleave = startHideTimeout;

    globalTooltip.onmouseenter = () => {
        if (tooltipHideTimeout) {
            clearTimeout(tooltipHideTimeout);
            tooltipHideTimeout = null;
        }
    };
    globalTooltip.onmouseleave = startHideTimeout;
}

function resetPlugin() {
    // Reset state
    state = JSON.parse(JSON.stringify(INITIAL_STATE));

    // Clear animation and modal states
    lastAddedStop = null;
    activeStop = null;
    if (modal) modal.classList.add('hidden');

    // Reset DOM elements handled by sync
    colorInput.value = state.baseColor;
    colorPicker.value = state.baseColor;

    // Standardize UI
    syncColorInputs('hex');
    setMode(state.paletteMode);

    // Update Theme UI
    setThemeUI(state.theme);

    // Reset UI
    tokensToggle?.classList.remove('active');
    update();
}

// Tokens toggle switch
if (tokensToggle) {
    tokensToggle.onclick = () => {
        tokensToggle.classList.toggle('active');
    };
}

// Initial mode and UI sync
syncColorInputs('hex'); // Alignment hex -> sliders
setMode(state.paletteMode); // This calls update() internally
tokensToggle?.classList.remove('active'); // Explicitly force off on boot

// Dynamic Resizing Logic
let resizeTimeout: number;

function updateSize() {
    // Clear any pending resize to avoid spamming
    if (resizeTimeout) clearTimeout(resizeTimeout);

    resizeTimeout = setTimeout(() => {
        const height = Math.ceil(document.documentElement.offsetHeight);
        const width = Math.ceil(window.innerWidth);
        parent.postMessage({ pluginMessage: { type: 'RESIZE_UI', width, height } }, '*');
    }, 100); // 100ms debounce
}

// Watch for size changes
const resizeObserver = new ResizeObserver(() => {
    updateSize();
});

resizeObserver.observe(document.body);

// Also update on explicit interactions
setTimeout(updateSize, 200);
