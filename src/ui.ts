import { generateSwatches, generateOKLCHSwatches, wcagContrast, hsl, rgb, lch, hsv, hexToFigmaRgb, getColorName, oklch, formatHex, getContrastBackground, formatColumnValue } from './colorLogic';
import { DOM_IDS, type PaletteConfig, type SwatchResult, type FigmaExportPayload, type DetectedPalette } from './types';
import {
    createIcons,
    RefreshCw,
    Moon,
    Sun,
    HelpCircle,
    Pipette,
    Plus,
    Palette,
    Download,
    X,
    AlertCircle,
    Save,
    Trash2,
    CheckCircle,
    Copy,
    Settings,
    MoreVertical,
    GripVertical
} from 'lucide';

// State
const STANDARD_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const HUE_OFFSET = 0; // Slider 0 maps to OKLCH 0° (direct mapping)

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
let lastSwatches: SwatchResult[] = [];

// Figma Tokens Database State (V 0.0.80)
let detectedPalettes: DetectedPalette[] = [];
let selectedPaletteId: string | null = null; // hueName of selected palette
let originalPaletteData: { stop: number; hex: string }[] | null = null; // Snapshot for dirty-checking (Phase 2)
let isDirty = false; // Phase 2: Track unsaved changes

// Phase 2 helper: Check if current palette has unsaved changes
export function hasPendingChanges(): boolean {
    return isDirty && originalPaletteData !== null;
}

// Security & Robustness Helpers
function getEl<T extends HTMLElement>(id: string): T | null {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with id "${id}" not found.`);
        return null;
    }
    return el as T;
}

// Elements
const colorInput = getEl<HTMLInputElement>(DOM_IDS.BASE_COLOR_INPUT);
const colorPicker = getEl<HTMLInputElement>('base-color-picker');
const copyAnchorBtn = document.getElementById('copy-anchor-hex');
const anchorSwatchTrigger = document.getElementById('anchor-swatch-trigger');
const container = getEl<HTMLElement>(DOM_IDS.STOPS_CONTAINER);
const modal = getEl<HTMLElement>(DOM_IDS.REFINE_MODAL);
const btnSaveVars = getEl<HTMLButtonElement>('btn-save-vars');
const btnCreateTemplate = getEl<HTMLButtonElement>('btn-create-template');
const resetBtn = getEl<HTMLButtonElement>('reset-plugin');
const hueSlider = getEl<HTMLInputElement>('hue-slider');
const chromaSlider = getEl<HTMLInputElement>('chroma-slider');
const hueVal = getEl<HTMLElement>('hue-val');
const chromaVal = getEl<HTMLElement>('chroma-val');

// Mode Toggle Elements
const modeLegacyBtn = getEl<HTMLButtonElement>('mode-legacy');
const modeOklchBtn = getEl<HTMLButtonElement>('mode-oklch');
const oklchHueSlider = getEl<HTMLInputElement>('oklch-hue-slider');
const oklchHueValue = getEl<HTMLElement>('oklch-hue-value');
const oklchVividnessSlider = getEl<HTMLInputElement>('oklch-vividness-slider');
const oklchVividnessValue = getEl<HTMLElement>('oklch-vividness-value');
const modeThumb = getEl<HTMLElement>('mode-thumb');
const themeToggleBtn = getEl<HTMLButtonElement>('theme-toggle');


// Sidebar Elements (V 0.0.80)
const palettePillsContainer = getEl<HTMLElement>('palette-pills');
const addPaletteBtn = getEl<HTMLButtonElement>('add-palette-btn');



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
        // Use a fixed lightness of 0.68 to match the gradient preview
        // This ensures the anchor color accurately represents the selected hue
        const representativeColor = {
            mode: 'oklch' as const,
            l: 0.68, // Match gradient lightness for consistency
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
    if (previewBg) {
        previewBg.style.background = state.baseColor;
    }

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
    // Fixed in V 0.0.86: Proper 0-360° gradient without edge wrapping
    const hueWrapper = document.querySelector('.hue-slider-wrapper') as HTMLElement;
    if (hueWrapper) {
        // Generate a clean 0° to 360° gradient
        // 0° (red) should appear on the left, and 360° (red again) on the right
        const steps = 37; // 37 steps gives us 0°, 10°, 20°... 350°, 360°
        const gradientColors = [];
        const dynamicChroma = Math.max(0, state.oklchVividness * 0.32);

        for (let i = 0; i < steps; i++) {
            const hue = i * 360 / (steps - 1); // Evenly distribute from 0 to 360
            const color = formatHex({ mode: 'oklch', l: 0.68, c: dynamicChroma, h: hue }) || '#ff0000';
            gradientColors.push(color);
        }
        hueWrapper.style.background = `linear-gradient(to right, ${gradientColors.join(', ')})`;
    }
}

/**
 * Initializes all UI sliders and displays to match the current state.
 * Called once on page load to ensure HTML defaults are overridden.
 */
function initializeSliders() {
    // Sync OKLCH Hue Slider
    if (oklchHueSlider && oklchHueValue) {
        const sliderHue = (state.oklchHue - HUE_OFFSET + 360) % 360;
        oklchHueSlider.value = String(Math.round(sliderHue));
        oklchHueValue.innerText = `${state.oklchHue}°`;
    }

    // Sync OKLCH Vividness Slider
    if (oklchVividnessSlider && oklchVividnessValue) {
        const vividnessPct = Math.round(state.oklchVividness * 100);
        oklchVividnessSlider.value = String(vividnessPct);
        oklchVividnessValue.innerText = `${vividnessPct}%`;
    }

    // Sync color input and picker with base color
    if (colorInput) colorInput.value = state.baseColor.toUpperCase();
    if (colorPicker) colorPicker.value = state.baseColor;

    // Sync anchor color preview background
    const previewBg = document.getElementById('color-preview-bg');
    if (previewBg) {
        previewBg.style.background = state.baseColor;
    }

    // Update slider backgrounds to match current state
    syncColorInputs('hex');
}


function getSwatches(): SwatchResult[] {
    const swatches = state.paletteMode === 'oklch'
        ? generateOKLCHSwatches(state.oklchHue, state.stops, state.oklchVividness, state.overrides)
        : generateSwatches({
            baseColor: state.baseColor,
            stops: state.stops,
            overrides: state.overrides,
            anchorStop: state.anchorStop,
            anchorTheme: 'light'
        });

    // Post-process with contrast against theme
    const bg = getContrastBackground(state.theme);
    swatches.forEach(s => {
        s.contrastWithNext = wcagContrast(s.hex, bg);
    });

    return swatches;
}

function update() {
    try {
        lastSwatches = getSwatches();
        render(lastSwatches);
        // Inject Lucide icons into any new DOM elements
        createIcons({
            icons: {
                RefreshCw,
                Moon,
                Sun,
                HelpCircle,
                Pipette,
                Plus,
                Palette,
                Download,
                X,
                AlertCircle,
                Save,
                Trash2,
                CheckCircle,
                Copy,
                Settings,
                MoreVertical,
                GripVertical
            },
            attrs: {
                width: 16,
                height: 16,
                'stroke-width': 2
            }
        });

        // RE-BIND TOOLTIP: Lucide replaces the i tag, so we must re-attach listeners
        requestAnimationFrame(() => {
            const newTooltipTrigger = document.getElementById('gen-mode-help');
            if (newTooltipTrigger) {
                newTooltipTrigger.onmouseenter = showTooltip;
                newTooltipTrigger.onmouseleave = startHideTimeout;
            }
        });
    } catch (e) {
        console.error('Update failed', e);
    }
}

function render(swatches: SwatchResult[]) {
    // V 0.0.80: Dirty State Checking
    checkDirty();

    if (!container) return;
    container.innerHTML = '';

    // Update table header based on mode
    const tableHeader = document.querySelector('.list-header') as HTMLElement;
    const isPerceptual = state.paletteMode === 'oklch';
    const headerLabel = isPerceptual ? 'L<sup style="font-size: 0.7em; vertical-align: super; position: relative; top: -2px;">c</sup> Ratio' : "WCAG Ratio";

    if (tableHeader) {
        tableHeader.innerHTML = `
            <div class="cell">${headerLabel}</div>
            <div class="cell">Name</div>
            <div class="cell" style="text-align: center;">Color</div>
        `;
    }

    // Status Icon Helper
    const getStatusIcon = (passed: boolean) => passed ?
        `<span class="status-icon check"><i data-lucide="check-circle" class="icon-svg" style="width: 14px; height: 14px;"></i></span>` :
        `<span class="status-icon warning"><i data-lucide="alert-circle" class="icon-svg" style="width: 14px; height: 14px;"></i></span>`;

    // 0. WHITE PLACEHOLDER (Reference)
    const whiteRow = document.createElement('div');
    whiteRow.className = 'list-row placeholder';
    // White is always L=100 or Contrast=1.00
    const whiteVal = formatColumnValue(isPerceptual ? 100 : 1.0, isPerceptual);
    whiteRow.innerHTML = `
        <div class="list-row__cell">${whiteVal} ${getStatusIcon(false)}</div>
        <div class="list-row__cell cell-name">White</div>
        <div class="list-row__cell cell-color">
            <div class="color-pill" style="background-color: #FFFFFF;"></div>
        </div>
    `;
    container?.appendChild(whiteRow);

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
                    edgeRowStart.innerHTML = `
                        <div class="insertion-line"></div>
                        <button class="insert-btn" title="Add stop ${edgeMidpoint}">
                            <i data-lucide="plus" class="icon-svg" style="width: 12px; height: 12px;"></i>
                        </button>
                        <div class="insertion-line"></div>
                    `;
                    const btn = edgeRowStart.querySelector('.insert-btn') as HTMLButtonElement;
                    if (btn) {
                        btn.onclick = () => {
                            lastAddedStop = edgeMidpoint;
                            state.stops.push(edgeMidpoint);
                            state.stops.sort((a, b) => a - b);
                            update();
                        };
                    }
                    container?.appendChild(edgeRowStart);
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
        const contrast = wcagContrast(hex, getContrastBackground(state.theme)).toFixed(2);
        const isPass = parseFloat(contrast) >= 4.5;

        let labelId = s.stop.toString();
        if (s.isAnchor) labelId = `${s.stop} (Seed)`;

        const isIntermediate = !STANDARD_STOPS.includes(Number(s.stop)) && !s.isAnchor;
        let deleteBtnHtml = '';
        if (isIntermediate && swatches.length > 2) {
            deleteBtnHtml = `<span class="delete-stop-btn" title="Remove stop"><i data-lucide="trash-2" class="icon-svg" style="width: 14px; height: 14px;"></i></span>`;
        }

        const rowVal = formatColumnValue(isPerceptual ? (s.lch?.l || 0) : parseFloat(contrast), isPerceptual);

        row.innerHTML = `
            <div class="list-row__cell">
                ${rowVal} 
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

        container?.appendChild(row);

        // 2. INSERTION POINT (Between this and next)
        const currentStop = Number(s.stop);
        const nextStop = i < swatches.length - 1 ? Number(swatches[i + 1].stop) : 1000; // 1000 as max
        const midpoint = Math.round((currentStop + nextStop) / 2);

        if (midpoint > currentStop && midpoint < nextStop && !state.stops.includes(midpoint)) {
            const insertionRow = document.createElement('div');
            insertionRow.className = 'insertion-row';
            insertionRow.innerHTML = `
                <div class="insertion-line"></div>
                <button class="insert-btn" title="Add stop ${midpoint}">
                    <i data-lucide="plus" class="icon-svg" style="width: 12px; height: 12px;"></i>
                </button>
                <div class="insertion-line"></div>
            `;

            const btn = insertionRow.querySelector('.insert-btn') as HTMLButtonElement;
            if (btn) {
                btn.onclick = () => {
                    lastAddedStop = midpoint;
                    state.stops.push(midpoint);
                    state.stops.sort((a, b) => a - b);
                    update();
                };
            }
            container?.appendChild(insertionRow);
        }
    });

    // 4. BLACK PLACEHOLDER
    const blackRow = document.createElement('div');
    blackRow.className = 'list-row placeholder';
    const blackVal = formatColumnValue(isPerceptual ? 0 : 21.0, isPerceptual);
    blackRow.innerHTML = `
        <div class="list-row__cell">${blackVal} ${getStatusIcon(true)}</div>
        <div class="list-row__cell cell-name">Black</div>
        <div class="list-row__cell cell-color">
            <div class="color-pill" style="background-color: #000000;"></div>
        </div>
    `;
    container?.appendChild(blackRow);

    // Reset animation state
    lastAddedStop = null;
}

function openRefine(swatch: SwatchResult) {
    console.log('Opening refine modal for:', swatch);
    activeStop = swatch.isOriginal ? 'seed' : swatch.stop;
    const title = getEl<HTMLElement>('modal-stop-title');
    if (title) title.innerText = swatch.isOriginal ? `Refine Original Color` : `Refine Stop ${swatch.stop}`;

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

    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
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
        } else if (newMode === 'hsb') {
            const cHsv = hsv(currentHex) || { h: 0, s: 0, v: 0 };
            // Note: culori hsv uses 'v' for value (brightness)
            state.overrides[stopKey] = { mode: 'hsb', hue: cHsv.h || 0, s: cHsv.s || 0, v: cHsv.v || 0 };
        }
    }

    const modalThumb = document.getElementById('segment-thumb');
    const modes = ['hsl', 'hsb', 'rgb'];
    const modeIndex = modes.indexOf(newMode);

    if (modalThumb && modeIndex !== -1) {
        modalThumb.style.transform = `translateX(${modeIndex * 100}%)`;
    }

    document.querySelectorAll('.mode-tab').forEach(tab => {
        // Only target tabs inside the refine modal (hack: check if data-mode is one of our 3)
        if (['hsl', 'hsb', 'rgb'].includes(tab.getAttribute('data-mode') || '')) {
            tab.classList.toggle('active', tab.getAttribute('data-mode') === newMode);
        }
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

    // Helper to get HSV (HSB)
    // Note: We need to import 'hsv' from culori or derive it. 
    // Since culori might not be available here, we'll check imports.
    // Assuming simple conversion if needed or use what we have.
    // For now, let's treat HSB as HSL for structure but needing hsv converter.
    // If we lack hsv import, we might need to add it or fail gracefully.

    if (mode === 'lch') {
        // ... existing lch sync (hidden now) ...
    } else if (mode === 'hsl') {
        const h = override.hue ?? 0;
        const s = (override.s ?? 0) * 100;
        const l = (override.lightness ?? 0) * 100;

        const hslHSlider = getEl<HTMLInputElement>('hsl-h-slider');
        const hslSSlider = getEl<HTMLInputElement>('hsl-s-slider');
        const hslLSlider = getEl<HTMLInputElement>('hsl-l-slider');
        const hslHVal = getEl<HTMLElement>('hsl-h-val');
        const hslSVal = getEl<HTMLElement>('hsl-s-val');
        const hslLVal = getEl<HTMLElement>('hsl-l-val');

        if (hslHSlider) hslHSlider.value = String(h);
        if (hslSSlider) hslSSlider.value = String(s);
        if (hslLSlider) hslLSlider.value = String(l);

        if (hslHVal) hslHVal.innerText = `${Math.round(h)}°`;
        if (hslSVal) hslSVal.innerText = `${Math.round(s)}%`;
        if (hslLVal) hslLVal.innerText = `${Math.round(l)}%`;

        updateHSLSliders(h, s, l);
    } else if (mode === 'hsb') {
        // We need current hex to get HSV
        // If state.overrides has HSV props, use them, else convert
        // state isn't typed for hsv yet, but overrides is 'any' in practice or we extend it
        // let's assume we store h/s/v in override if mode is hsb
        let h = override.hue ?? 0;
        let s = (override.s ?? 0) * 100;
        let v = (override.lightness ?? 0) * 100; // Fallback mapping if switching

        // If we switched mode, we should have properly converted.
        // But if we lacked hsv convert, we might be stuck.
        // Let's rely on switchMode converting properly if we implement it there.
        // For now, just setting values.

        // HSB logic:
        if (override.mode === 'hsb') {
            h = override.hue ?? 0;
            s = (override.s ?? 0) * 100;
            v = (override.v ?? 0) * 100;
        }

        const hsbHSlider = getEl<HTMLInputElement>('hsb-h-slider');
        const hsbSSlider = getEl<HTMLInputElement>('hsb-s-slider');
        const hsbBSlider = getEl<HTMLInputElement>('hsb-b-slider');
        const hsbSVal = getEl<HTMLElement>('hsb-s-val');
        const hsbBVal = getEl<HTMLElement>('hsb-b-val');

        if (hsbHSlider) hsbHSlider.value = String(h);
        if (hsbSSlider) hsbSSlider.value = String(s);
        if (hsbBSlider) hsbBSlider.value = String(v);

        if (hsbSVal) hsbSVal.innerText = `${Math.round(s)}%`;
        if (hsbBVal) hsbBVal.innerText = `${Math.round(v)}%`;

        // Update gradients
        updateHSBSliders(h, s / 100, v / 100);

    } else if (mode === 'rgb') {
        const rgb = override.mode === 'rgb' ? override : { r: 0, g: 0, b: 0 };
        // If not RGB mode, we should ideally convert, but for now fallback to 0 or current
        // Basic sync logic if needed
        const rVal = Math.round((rgb.r || 0) * 255);
        const gVal = Math.round((rgb.g || 0) * 255);
        const bVal = Math.round((rgb.b || 0) * 255);

        const rgbRSlider = getEl<HTMLInputElement>('rgb-r-slider');
        const rgbGSlider = getEl<HTMLInputElement>('rgb-g-slider');
        const rgbBSlider = getEl<HTMLInputElement>('rgb-b-slider');
        const rgbRVal = getEl<HTMLElement>('rgb-r-val');
        const rgbGVal = getEl<HTMLElement>('rgb-g-val');
        const rgbBVal = getEl<HTMLElement>('rgb-b-val');

        if (rgbRSlider) rgbRSlider.value = String(rVal);
        if (rgbGSlider) rgbGSlider.value = String(gVal);
        if (rgbBSlider) rgbBSlider.value = String(bVal);

        if (rgbRVal) rgbRVal.innerText = String(rVal);
        if (rgbGVal) rgbGVal.innerText = String(gVal);
        if (rgbBVal) rgbBVal.innerText = String(bVal);

        // Update gradients
        updateRGBSliders(rgb.r || 0, rgb.g || 0, rgb.b || 0);
    }
}

// Segment Toggle Listeners
// Note: We use .mode-tab which is shared with main view tabs.
// We need to ensure we only attach these specific listeners or check context.
// Actually, switchMode() logic handles preview updates, so if we just call switchMode() it works.
// BUT, main view tabs (Legacy/OKLCH) might conflict if they used the same class and logic.
// Main view tabs use IDs 'mode-legacy' and 'mode-oklch'.
// Our modal tabs don't have IDs, just class 'mode-tab'.
document.querySelectorAll('.mode-tab').forEach(btn => {
    const mode = btn.getAttribute('data-mode');
    if (mode && ['hsl', 'hsb', 'rgb', 'css'].includes(mode)) {
        (btn as HTMLButtonElement).onclick = () => switchMode(mode);
    }
});

if (hueSlider) {
    hueSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const h = parseFloat(target.value);
        state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], hue: h };
        if (hueVal) hueVal.innerText = `${Math.round(h)}°`;
        update(); updateModalPreview();
    };
}
if (chromaSlider) {
    chromaSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const c = parseFloat(target.value);
        state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], chroma: c };
        if (chromaVal) chromaVal.innerText = String(Math.round(c));
        update(); updateModalPreview();
    };
}
const lchLSlider = getEl<HTMLInputElement>('lch-l-slider');
const lchLVal = getEl<HTMLElement>('lch-l-val');
if (lchLSlider) {
    lchLSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const l = parseFloat(target.value);
        state.overrides[activeStop as number] = { ...state.overrides[activeStop as number], lightness: l };
        if (lchLVal) lchLVal.innerText = String(Math.round(l));
        update(); updateModalPreview();
    };
}

// Reset Override
const resetOverrideBtn = getEl<HTMLButtonElement>('reset-override');
if (resetOverrideBtn) {
    resetOverrideBtn.onclick = () => {
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
}



// HSL Listeners
const hslHSlider = getEl<HTMLInputElement>('hsl-h-slider');
const hslHVal = getEl<HTMLElement>('hsl-h-val');
const hslSSlider = getEl<HTMLInputElement>('hsl-s-slider');
const hslLSlider = getEl<HTMLInputElement>('hsl-l-slider');
if (hslHSlider) {
    hslHSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const h = parseFloat(target.value);

        // Update State
        const currentOverride = state.overrides[activeStop as number] || {};
        state.overrides[activeStop as number] = { ...currentOverride, hue: h };

        if (hslHVal) hslHVal.innerText = `${Math.round(h)}°`;

        // Update Gradients
        const s = hslSSlider?.valueAsNumber || 0;
        const l = hslLSlider?.valueAsNumber || 0;
        updateHSLSliders(h, s, l);

        update(); updateModalPreview();
    };
}
if (hslSSlider) {
    hslSSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const sPct = parseFloat(target.value);

        // Update State
        const currentOverride = state.overrides[activeStop as number] || {};
        state.overrides[activeStop as number] = { ...currentOverride, s: sPct / 100 };

        const hslSVal = getEl<HTMLElement>('hsl-s-val');
        if (hslSVal) hslSVal.innerText = `${Math.round(sPct)}%`;

        // Update Gradients
        const h = hslHSlider?.valueAsNumber || 0;
        const l = hslLSlider?.valueAsNumber || 0;
        updateHSLSliders(h, sPct, l);

        update(); updateModalPreview();
    };
}
if (hslLSlider) {
    hslLSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const lPct = parseFloat(target.value);

        // Update State
        const currentOverride = state.overrides[activeStop as number] || {};
        state.overrides[activeStop as number] = { ...currentOverride, lightness: lPct / 100 };

        const hslLVal = getEl<HTMLElement>('hsl-l-val');
        if (hslLVal) hslLVal.innerText = `${Math.round(lPct)}%`;

        // Update Gradients
        const h = hslHSlider?.valueAsNumber || 0;
        const s = hslSSlider?.valueAsNumber || 0;
        updateHSLSliders(h, s, lPct);

        update(); updateModalPreview();
    };
}

// Helper to update HSL slider backgrounds dynamically
function updateHSLSliders(h: number, s: number, l: number) {
    const sSlider = document.getElementById('hsl-s-slider');
    const lSlider = document.getElementById('hsl-l-slider');

    // S slider: hsl(h, 0%, l) -> hsl(h, 100%, l)
    const sStart = `hsl(${h}, 0%, ${l}%)`;
    const sEnd = `hsl(${h}, 100%, ${l}%)`;

    // L slider: hsl(h, s, 0%) -> hsl(h, s, 50%) -> hsl(h, s, 100%)
    const lStart = `hsl(${h}, ${s}%, 0%)`;
    const lMid = `hsl(${h}, ${s}%, 50%)`;
    const lEnd = `hsl(${h}, ${s}%, 100%)`;

    if (sSlider) sSlider.style.background = `linear-gradient(to right, ${sStart}, ${sEnd})`;
    if (lSlider) lSlider.style.background = `linear-gradient(to right, ${lStart}, ${lMid}, ${lEnd})`;
}

// Helper to update HSB slider backgrounds dynamically
function updateHSBSliders(h: number, s: number, v: number) {
    // S slider: from (h, 0%, v) to (h, 100%, v)
    // B slider: from (h, s, 0%) to (h, s, 100%)

    // Note: culori expects 0-1 for s, v
    const sSlider = document.getElementById('hsb-s-slider');
    const bSlider = document.getElementById('hsb-b-slider');

    const sStart = formatHex({ mode: 'hsv', h, s: 0, v });
    const sEnd = formatHex({ mode: 'hsv', h, s: 1, v });

    const bStart = formatHex({ mode: 'hsv', h, s, v: 0 }); // Always black
    const bEnd = formatHex({ mode: 'hsv', h, s, v: 1 });

    if (sSlider) sSlider.style.background = `linear-gradient(to right, ${sStart}, ${sEnd})`;
    if (bSlider) bSlider.style.background = `linear-gradient(to right, ${bStart}, ${bEnd})`;
}

// RGB Listeners
// HSB Listeners
['h', 's', 'b'].forEach(chan => {
    const hsbSlider = getEl<HTMLInputElement>(`hsb-${chan}-slider`);
    if (hsbSlider) {
        hsbSlider.oninput = (e) => {
            const target = e.target as HTMLInputElement;
            const val = parseFloat(target.value);

            // Update Override State
            const currentOverride = state.overrides[activeStop as number] || {};
            let h = currentOverride.hue ?? 0;
            let s = currentOverride.s ?? 0;
            let v = currentOverride.v ?? 0;

            if (chan === 'h') {
                h = val;
                state.overrides[activeStop as number] = { ...currentOverride, hue: val, mode: 'hsb' };
            } else if (chan === 's') {
                s = val / 100;
                state.overrides[activeStop as number] = { ...currentOverride, s: s, mode: 'hsb' };
            } else if (chan === 'b') {
                v = val / 100;
                state.overrides[activeStop as number] = { ...currentOverride, v: v, mode: 'hsb' };
            }

            const hsbVal = getEl<HTMLElement>(`hsb-${chan}-val`);
            if (hsbVal) hsbVal.innerText = (chan === 'h') ? `${Math.round(val)}°` : `${Math.round(val)}%`;

            // Update visual backgrounds
            updateHSBSliders(h, s, v);

            // IMPORTANT: Update preview immediately
            update();
            updateModalPreview();
        };
    }
});

// Helper to update RGB slider backgrounds dynamically
function updateRGBSliders(r: number, g: number, b: number) {
    const rSlider = document.getElementById('rgb-r-slider');
    const gSlider = document.getElementById('rgb-g-slider');
    const bSlider = document.getElementById('rgb-b-slider');

    const to255 = (v: number) => Math.round(v * 255);

    if (rSlider) rSlider.style.background = `linear-gradient(to right, rgb(0, ${to255(g)}, ${to255(b)}), rgb(255, ${to255(g)}, ${to255(b)}))`;
    if (gSlider) gSlider.style.background = `linear-gradient(to right, rgb(${to255(r)}, 0, ${to255(b)}), rgb(${to255(r)}, 255, ${to255(b)}))`;
    if (bSlider) bSlider.style.background = `linear-gradient(to right, rgb(${to255(r)}, ${to255(g)}, 0), rgb(${to255(r)}, ${to255(g)}, 255))`;
}

// RGB Listeners (Fixed to simple iteration)
['r', 'g', 'b'].forEach(chan => {
    const el = getEl<HTMLInputElement>(`rgb-${chan}-slider`);
    if (el) {
        el.oninput = (e) => {
            const target = e.target as HTMLInputElement;
            const val = parseInt(target.value);

            // Update state
            const currentOverride = state.overrides[activeStop as number] || {};
            const r = (chan === 'r' ? val / 255 : (currentOverride.r !== undefined ? currentOverride.r : 0));
            const g = (chan === 'g' ? val / 255 : (currentOverride.g !== undefined ? currentOverride.g : 0));
            const b = (chan === 'b' ? val / 255 : (currentOverride.b !== undefined ? currentOverride.b : 0));

            state.overrides[activeStop as number] = { ...currentOverride, [chan]: val / 255, mode: 'rgb' };
            const rgbVal = getEl<HTMLElement>(`rgb-${chan}-val`);
            if (rgbVal) rgbVal.innerText = String(val);

            // Update visual backgrounds
            updateRGBSliders(r, g, b);
            update();
            updateModalPreview();
        };
    }
});

function closeModal() {
    if (modal) modal.classList.add('hidden');
    activeStop = null;
}

const closeModalBtn = getEl<HTMLButtonElement>('close-modal');
if (closeModalBtn) closeModalBtn.onclick = closeModal;

// Connect Done button (same as close)
const doneBtn = document.getElementById('save-modal-btn');
if (doneBtn) {
    doneBtn.onclick = () => {
        // Handle "Original/Seed" Persistence
        // Since generateSwatches uses state.baseColor (not overrides['seed']), we must apply the override to baseColor now.
        if (activeStop === 'seed' && state.overrides['seed']) {
            const over = state.overrides['seed'];
            let newHex = state.baseColor;

            // Convert Override to Hex
            if (over.mode === 'hsl' || over.mode === 'hsb' || over.mode === 'rgb' || over.mode === 'lch') {
                // We create a temporary OKLCH object from the override to get Hex
                // But formatHex expects a Color object.
                // We can use the createSwatch logic or just culori converters.
                // Let's rely on the colorLogic helpers we imported. (formatHex, oklch, etc)
                // Actually, over matches the Partial<Color> structure mostly.
                // Robust way: Use createSwatch for 'seed' (stop 500 equivalent behavior) or just convert directly.
                // Let's construct the color object directly based on mode.

                let colorObj: any;
                if (over.mode === 'hsl') {
                    colorObj = { mode: 'hsl', h: over.hue, s: over.s, l: over.lightness };
                } else if (over.mode === 'hsb') {
                    colorObj = { mode: 'hsv', h: over.hue, s: over.s, v: over.v }; // HSB -> HSV
                } else if (over.mode === 'rgb') {
                    colorObj = { mode: 'rgb', r: over.r, g: over.g, b: over.b };
                } else if (over.mode === 'lch') {
                    colorObj = { mode: 'lch', l: over.lightness, c: over.chroma, h: over.hue };
                }

                if (colorObj) {
                    const hex = formatHex(colorObj);
                    if (hex) {
                        newHex = hex;
                        state.baseColor = newHex;
                        // Sync Main UI inputs
                        syncColorInputs('hex');
                        const basePicker = getEl<HTMLInputElement>('base-color-picker');
                        const baseInput = getEl<HTMLInputElement>('base-color-input');
                        if (basePicker) basePicker.value = newHex;
                        if (baseInput) baseInput.value = newHex;
                    }
                }
            }
            // Clear the override since it's now the base color
            delete state.overrides['seed'];
        }

        // Ensure state is up to date and UI reflects it
        update();
        closeModal();
    };
}

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
    const swatches = getSwatches();
    const swatch = activeStop === 'seed' ? swatches.find(x => x.isOriginal) : swatches.find(s => s.stop === activeStop);

    if (!swatch) return;

    // Get Original for comparison
    const tempState = { ...state, overrides: {} };
    const baseSwatches = state.paletteMode === 'oklch'
        ? generateOKLCHSwatches(tempState.oklchHue, tempState.stops, tempState.oklchVividness, {})
        : generateSwatches(tempState);
    const original = activeStop === 'seed' ? baseSwatches.find(x => x.isOriginal) : baseSwatches.find(s => s.stop === (typeof activeStop === 'string' ? swatch.stop : activeStop));

    if (!original) return;

    // Fix: Preview-before should be Original, Preview-after should be Refining
    const beforePill = getEl<HTMLElement>('preview-before');
    const afterPill = getEl<HTMLElement>('preview-after');

    // Dynamic Text Color Logic
    // Helper to calculate contrast against white/black to decide text color
    const getTextColor = (hex: string) => {
        const whiteContrast = wcagContrast(hex, '#ffffff');
        const blackContrast = wcagContrast(hex, '#000000');
        return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
    };

    const originalHex = original.hex;
    const newHex = swatch.hex;

    if (beforePill) {
        beforePill.style.backgroundColor = originalHex;
        beforePill.style.color = getTextColor(originalHex);
    }
    if (afterPill) {
        afterPill.style.backgroundColor = newHex;
        afterPill.style.color = getTextColor(newHex);
    }

    const hexBeforeLabel = getEl<HTMLElement>('hex-before-label');
    const hexAfterLabel = getEl<HTMLElement>('hex-after-label');

    if (hexBeforeLabel) {
        hexBeforeLabel.innerText = original.hex.toUpperCase();
        hexBeforeLabel.style.color = original.lch.l > 60 ? '#000' : '#fff';
    }
    if (hexAfterLabel) {
        hexAfterLabel.innerText = swatch.hex.toUpperCase();
        hexAfterLabel.style.color = swatch.lch.l > 60 ? '#000' : '#fff';
    }

    // Contrast Badge Logic
    const contrastBadge = document.getElementById('modal-contrast-badge');
    const contrastValue = document.getElementById('modal-contrast-value');

    // Calculate contrast between Old and New (how much it changed)
    // OR contrast against white? The design shows "1.00" which implies comparison of the two.
    // If they are identical, contrast is 1:1.
    if (contrastBadge && contrastValue) {
        // We need to import wcagContrast or use the one likely available globally/imported
        // Since we can't easily add imports here without moving up, we'll assume it's available 
        // or effectively re-implement simple luminance check if needed.
        // But wcagContrast IS imported in colorLogic. Let's start by adding the import if missing.
        // Actually, logic is in colorLogic.ts. ui.ts doesn't import it?
        // Checking imports... ui.ts imports generateSwatches but maybe not wcagContrast.
        // I'll assume I need to fetch it or replicate it. 
        // Replicating basic WCAG here to be safe and avoid import mess mid-file:

        // However, looking at file top, let's see imports.
        // I will add the logic here.

        // Temp duplicate for safety if import missing:
        const getLum = (hex: string) => {
            const rgb = parseInt(hex.slice(1), 16);
            const r = ((rgb >> 16) & 0xff) / 255;
            const g = ((rgb >> 8) & 0xff) / 255;
            const b = (rgb & 0xff) / 255;
            const sRGB = [r, g, b].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
            return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
        };
        const l1 = getLum(original.hex) + 0.05;
        const l2 = getLum(swatch.hex) + 0.05;
        const ratio = l1 > l2 ? l1 / l2 : l2 / l1;

        contrastValue.innerText = ratio.toFixed(2);
        contrastBadge.style.display = 'flex';

        // Warning if ratio is very low (indistinguishable) or maybe high?
        // Design shows 1.00 (identical) with warning.
        // Let's hide warning if ratio > 1.05 (visible difference)
        const warnIcon = contrastBadge.querySelector('.warning-icon') as HTMLElement;
        if (warnIcon) warnIcon.style.display = ratio === 1 ? 'block' : 'none';

        // Actually showing ratio always is good.
    }
}

/**
 * Resolves a color string (name or hex) to a 6-digit hex.
 * Uses culori's robust parser.
 */
function resolveInputColor(input: string): string | null {
    const raw = input.trim();
    if (!raw) return null;

    // 1. Try resolving as-is (handles names like 'red' and valid #hex)
    let color = rgb(raw);

    // 2. If it failed, try prepending '#' (for hexes typed without it)
    if (!color && !raw.startsWith('#')) {
        color = rgb('#' + raw);
    }

    if (color) {
        return formatHex(color);
    }

    return null;
}

// Event Listeners (Base Color)
if (colorInput) {
    colorInput.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        let val = target.value;

        // Auto-prepend '#' if it looks like a hex/partial hex and not a CSS name
        // (Starts with a hex digit and is not a valid color name yet)
        if (val && !val.startsWith('#') && /^[0-9a-fA-F]/.test(val) && !rgb(val)) {
            val = '#' + val;
            target.value = val;
        }

        const resolved = resolveInputColor(val);
        if (resolved) {
            state.baseColor = resolved;
            if (colorPicker) colorPicker.value = resolved;
            syncColorInputs('hex');
            update();
            // syncColorInputs will format the input value to uppercase hex
        }
    };

    colorInput.onblur = () => {
        // Ensure we always end with a valid hex in the field
        colorInput.value = state.baseColor.toUpperCase();
    };

    colorInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            colorInput.blur();
        }
    };
}

if (colorPicker) {
    colorPicker.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        state.baseColor = target.value;
        if (colorInput) colorInput.value = state.baseColor.toUpperCase();
        syncColorInputs('hex');
        update();
    };
}

// ==============================================================================
// MODE TOGGLE HANDLERS
// ==============================================================================

function setMode(mode: 'legacy' | 'oklch') {
    state.paletteMode = mode;
    // We NO LONGER reset overrides or stops when switching modes
    // because the user might want to compare the same settings in different algos.

    // Update UI tabs
    if (modeLegacyBtn) modeLegacyBtn.classList.toggle('active', mode === 'legacy');
    if (modeOklchBtn) modeOklchBtn.classList.toggle('active', mode === 'oklch');

    // Slide the thumb
    if (modeThumb) {
        modeThumb.style.transform = mode === 'legacy' ? 'translateX(0)' : 'translateX(100%)';
    }


    // Both modes now share the same color picking options (sliders + hex)
    // as they are bi-directionally synced.

    // Immediately update UI with existing swatches (mode-dependent display)
    if (lastSwatches.length > 0) {
        render(lastSwatches);
    }
}

// Mode Toggle Handlers
if (modeLegacyBtn) modeLegacyBtn.onclick = () => setMode('legacy');
if (modeOklchBtn) modeOklchBtn.onclick = () => setMode('oklch');

// OKLCH Hue Slider
if (oklchHueSlider) {
    oklchHueSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const sliderHue = parseInt(target.value, 10);
        // Offset logic: 0 on slider maps to OKLCH 29° (Red)
        const logicalHue = (sliderHue + HUE_OFFSET) % 360;
        state.oklchHue = logicalHue;
        if (oklchHueValue) oklchHueValue.innerText = `${logicalHue}°`;
        syncColorInputs('sliders');
        update();
    };
}

// OKLCH Vividness Slider
if (oklchVividnessSlider) {
    oklchVividnessSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const vividness = parseInt(target.value, 10);
        state.oklchVividness = vividness / 100; // Convert 0-100 to 0-1
        if (oklchVividnessValue) oklchVividnessValue.innerText = `${vividness}%`;
        syncColorInputs('sliders');
        update();
    };
}


// Helper to construct payload
function getPayload(isUpdate: boolean): FigmaExportPayload {
    // Determine Base Name
    const safeAnchor = lastSwatches.find(s => s.isAnchor) || lastSwatches[0];
    let baseColorName: string;

    if (state.paletteMode === 'oklch') {
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

    // Filter Swatches (No pure white/black)
    const activeSwatches = getSwatches().filter(s =>
        s.hex.toLowerCase() !== '#ffffff' && s.hex.toLowerCase() !== '#000000'
    );

    const finalSwatches = activeSwatches.map(s => {
        const rgb = hexToFigmaRgb(s.hex);
        const contrast = wcagContrast(s.hex, getContrastBackground(state.theme));
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

    const action = isUpdate ? 'update' : 'create';

    return {
        name: baseColorName,
        createVariables: false, // Default, overridden by caller
        swatches: finalSwatches,
        action: action,
        paletteId: selectedPaletteId || undefined
    };
}

// 1. SAVE VARIABLES HANDLER
btnSaveVars?.addEventListener('click', () => {
    const isUpdate = !!(originalPaletteData && selectedPaletteId);
    const payload = getPayload(isUpdate);

    // Config for Variables
    payload.createVariables = true;
    payload.createFrame = false;

    // Force 'create' action if we are just saving a new palette's variables (not updating existing)
    // But getPayload sets handled isUpdate. 
    // code.ts `if (payload.action === 'update')` handles the update logic.
    // If it's a new palette (isUpdate false), it falls through to default create logic.

    parent.postMessage({
        pluginMessage: {
            type: 'EXPORT_TO_FIGMA',
            payload: payload
        }
    }, '*');
});

// Robust Copy to Clipboard (V 0.0.84)
const copyToClipboard = (text: string) => {
    // Attempt modern API first
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
};

const fallbackCopy = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
    } catch (err) {
        console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
};

// Anchor Swatch: Triggers EyeDropper (V 0.0.84)
anchorSwatchTrigger?.addEventListener('click', async () => {
    // @ts-ignore - EyeDropper is a modern experimental API
    if (window.EyeDropper) {
        try {
            // @ts-ignore
            const eyeDropper = new EyeDropper();
            const result = await eyeDropper.open();
            if (result.sRGBHex) {
                state.baseColor = result.sRGBHex;
                syncColorInputs('hex');
                update();
            }
        } catch (e) {
            console.warn('EyeDropper cancelled or failed', e);
        }
    } else {
        // Fallback to native picker
        colorPicker?.click();
    }
});

// Anchor Copy: Figma-style notification
copyAnchorBtn?.addEventListener('click', () => {
    const val = state.baseColor.toUpperCase();
    copyToClipboard(val);
    parent.postMessage({ pluginMessage: { type: 'NOTIFY', message: 'Hex code copied!' } }, '*');
});

// 2. CREATE TEMPLATE HANDLER
btnCreateTemplate?.addEventListener('click', () => {
    // Template creation is always a "create" action for the frame
    // We do NOT want to trigger the 'update' logic in code.ts which returns early.
    const payload = getPayload(false); // Force create mode

    payload.createVariables = false;
    payload.createFrame = true;

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
        if (colorInput) colorInput.value = msg.hex;
        if (colorPicker) colorPicker.value = msg.hex;
        update();
    } else if (msg.type === 'PALETTES_DATA') {
        // V 0.0.80: Receive detected palettes from Figma
        detectedPalettes = msg.palettes || [];
        renderPaletteSidebar();
    }
};

/**
 * Renders the palette sidebar with detected palettes (V 0.0.80)
 */
function renderPaletteSidebar() {
    const sidebar = document.getElementById('palette-sidebar');
    if (!palettePillsContainer || !sidebar) return;

    // V 0.0.80: Hide sidebar if no palettes exist (User Request)
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
 * Selects a palette from the sidebar and loads it into the editor (V 0.0.80)
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
    if (colorInput) colorInput.value = state.baseColor;
    if (colorPicker) colorPicker.value = state.baseColor;

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

// Request palettes on boot (V 0.0.80)
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
 * Checks if current state differs from the loaded palette (V 0.0.80)
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
 * Updates the main action button text based on state (V 0.0.80)
 */
/**
 * Updates the Save Variables button text based on state (V 0.0.80)
 */
function updateButtonState() {
    if (!btnSaveVars) return;
    const btnText = document.getElementById('btn-text-vars');
    if (!btnText) return;

    if (originalPaletteData) {
        // Variables exist (either saved or dirty)
        btnText.innerHTML = `Update variables`;
    } else {
        // Creating new palette variables
        btnText.innerHTML = `Generate variables`;
    }
}



// ==============================================================================
// THEME TOGGLE HANDLER
// ==============================================================================

function setThemeUI(theme: 'light' | 'dark') {
    state.theme = theme;
    document.body.classList.toggle('light-theme', theme === 'light');

    update();

    // CRITICAL: Use requestAnimationFrame to ensure createIcons() has finished
    // Lucide's createIcons() replaces <i> tags with SVG asynchronously
    // We need to wait for the next frame to ensure DOM manipulation is complete
    requestAnimationFrame(() => {
        const currentThemeIconLight = getEl<HTMLElement>('theme-icon-light');
        const currentThemeIconDark = getEl<HTMLElement>('theme-icon-dark');

        // Update Icons: Sun in Light, Moon in Dark
        if (theme === 'light') {
            if (currentThemeIconLight) currentThemeIconLight.style.display = 'block';  // Sun
            if (currentThemeIconDark) currentThemeIconDark.style.display = 'none';    // Moon hidden
        } else {
            if (currentThemeIconLight) currentThemeIconLight.style.display = 'none';  // Sun hidden
            if (currentThemeIconDark) currentThemeIconDark.style.display = 'block';   // Moon
        }
    });
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

const showTooltip = () => {
    if (!tooltipTrigger || !globalTooltip) return;
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
    if (!globalTooltip) return;
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

if (tooltipTrigger && globalTooltip) {

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
    if (colorInput) colorInput.value = state.baseColor;
    if (colorPicker) colorPicker.value = state.baseColor;

    // Standardize UI
    syncColorInputs('hex');
    setMode(state.paletteMode);

    // Update Theme UI
    setThemeUI(state.theme);

    // Reset UI
    update();
}

// Tokens toggle removed

// Anchor Theme Toggle

// Initial mode and UI sync
if (typeof APP_VERSION !== 'undefined') {
    const versionEl = document.querySelector('.version-text');
    if (versionEl) versionEl.textContent = `V ${APP_VERSION}`;
}

syncColorInputs('hex'); // Alignment hex -> sliders
initializeSliders(); // Initialize all sliders and UI elements with state values
setMode(state.paletteMode); // This calls update() internally
// tokensToggle?.classList.remove('active'); // Explicitly force off on boot

// Dynamic Resizing Logic
let resizeTimeout: number;

function updateSize() {
    // Clear any pending resize to avoid spamming
    if (resizeTimeout) clearTimeout(resizeTimeout);

    resizeTimeout = window.setTimeout(() => {
        const height = Math.ceil(document.documentElement.offsetHeight);
        const width = Math.ceil(window.innerWidth);
        parent.postMessage({ pluginMessage: { type: 'RESIZE_UI', width, height } }, '*');
    }, 100); // 100ms debounce
}

// Watch for size changes
const resizeObserver = new ResizeObserver(() => {
    updateSize();
});

if (document.body) {
    resizeObserver.observe(document.body);
}

// Also update on explicit interactions
window.setTimeout(updateSize, 200);
