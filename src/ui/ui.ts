import { generateSwatches, wcagContrast, hsl, rgb, lch, hsv, hexToFigmaRgb, getColorName, oklch, formatHex, getContrastBackground, formatColumnValue } from '../lib/color/colorLogic';
import { generatePerceptualV2 } from '../lib/color/perceptual_v2';
import { DOM_IDS, type SwatchResult, type FigmaExportPayload } from '../lib/tokens/types';
import { StateManager } from './state';
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
    GripVertical,
    ChevronDown,
    Pencil,
    Globe
} from 'lucide';
import { createPaletteRow } from './components/PaletteRow';
import { createPaletteSelector } from './components/PaletteSelector';
import { createButton } from './components/Button';

import { createSegmentController } from './components/SegmentController';
import { createRefineModal } from './components/RefineModal';

// Declare global for Vite define
declare const APP_VERSION: string;

// Phase 3: Centralized State Management
function getState() { return StateManager.getState(); }
function setState(updates: Partial<any>) { return StateManager.setState(updates); }

// Phase 2 helper: Check if current palette has unsaved changes
export function hasPendingChanges(): boolean {
    const s = getState();
    return s.isDirty && s.originalPaletteData !== null;
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
const anchorSwatchTrigger = document.getElementById('anchor-swatch-trigger');
const container = getEl<HTMLElement>(DOM_IDS.STOPS_CONTAINER);
const modalContainer = getEl<HTMLElement>('modal-container');

// Component Containers
const footerContainer = getEl<HTMLElement>('footer-actions-container');
const modeTabsContainer = getEl<HTMLElement>('mode-tabs-container');
const themeToggleBtn = getEl<HTMLElement>('theme-toggle');

// Re-selectors for elements that are now inside components (handled via delegation or re-query)
let modal: HTMLElement | null = null;

// OKLCH Sliders (Keep references for sync logic)
let oklchHueSlider: HTMLInputElement | null = null;
let oklchHueValue: HTMLElement | null = null;
let oklchVividnessSlider: HTMLInputElement | null = null;
let oklchVividnessValue: HTMLElement | null = null;

// Legacy Sliders (V 0.0.80)
let hueVal: HTMLElement | null = null;
let chromaVal: HTMLElement | null = null;

// Mode Toggle Elements (Now handled by components, but kept as let for logic)


const anchorDisplay = document.getElementById('base-color-display');
const anchorCopyBtn = document.querySelector('.anchor-hex-icon');


// Sidebar Elements (V 0.0.80)
// let palettePillsContainer = getEl<HTMLElement>('palette-pills'); // Decoupled in Phase 3
const addPaletteBtn = getEl<HTMLButtonElement>('add-palette-btn');

// Global flags for creation state
(window as any)._isCreatingManual = false;

// Header Expand/Collapse Elements (V 1.0.1)
const editPaletteToggle = getEl<HTMLButtonElement>('edit-palette-toggle');
const expandableSettings = getEl<HTMLElement>('expandable-settings');
const topHeader = document.querySelector('.top-header-container') as HTMLElement;



/**
 * Syncs the state and UI when a color input changes.
 * Handles HEX -> OKLCH and OKLCH -> HEX conversions.
 */
function syncColorInputs(source: 'hex' | 'sliders') {
    if (source === 'hex') {
        const color = oklch(getState().baseColor);
        if (color) {
            // Update Hue
            getState().oklchHue = Math.round(color.h || 0);
            const h = getState().oklchHue || 0;
            const sliderHue = (h - 0 + 360) % 360;
            if (oklchHueSlider) oklchHueSlider.value = String(Math.round(sliderHue));
            if (oklchHueValue) oklchHueValue.innerText = `${h}°`;

            // Update Vividness
            const vividnessPct = Math.min(100, Math.round((color.c || 0) / 0.4 * 100));
            getState().oklchVividness = vividnessPct / 100;
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
            c: (getState().oklchVividness || 0) * 0.4, // Match the 0.4 normalization
            h: getState().oklchHue || 0
        };
        const hex = formatHex(representativeColor) || '#000000';
        getState().baseColor = hex;
        const input = getEl<HTMLInputElement>(DOM_IDS.BASE_COLOR_INPUT);
        const picker = getEl<HTMLInputElement>('base-color-picker');
        if (input) input.value = hex.toUpperCase();
        if (picker) picker.value = hex;
    }

    // Always update the preview pill background
    const previewBg = document.getElementById('color-preview-bg');
    if (previewBg) {
        previewBg.style.background = getState().baseColor;
    }

    // Always update Vividness slider background to reflect current hue
    const vividWrapper = document.querySelector('.vivid-slider-wrapper') as HTMLElement;
    if (vividWrapper) {
        const h = getState().oklchHue || 0;
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
        const dynamicChroma = Math.max(0, (getState().oklchVividness || 0) * 0.32);

        for (let i = 0; i < steps; i++) {
            const hue = i * 360 / (steps - 1); // Evenly distribute from 0 to 360
            const color = formatHex({ mode: 'oklch', l: 0.68, c: dynamicChroma, h: hue }) || '#ff0000';
            gradientColors.push(color);
        }
        hueWrapper.style.background = `linear-gradient(to right, ${gradientColors.join(', ')})`;
    }
}

/**
 * Initializes all UI sliders and displays to match the current getState().
 * Called once on page load to ensure HTML defaults are overridden.
 */
function initializeSliders() {
    // Sync OKLCH Hue Slider
    if (oklchHueSlider && oklchHueValue) {
        const h = getState().oklchHue || 0;
        const sliderHue = (h - 0 + 360) % 360;
        oklchHueSlider.value = String(Math.round(sliderHue));
        oklchHueValue.innerText = `${h}°`;
    }

    // Sync OKLCH Vividness Slider
    if (oklchVividnessSlider && oklchVividnessValue) {
        const v = getState().oklchVividness || 0;
        const vividnessPct = Math.round(v * 100);
        oklchVividnessSlider.value = String(vividnessPct);
        oklchVividnessValue.innerText = `${vividnessPct}%`;
    }

    // Sync color input and picker with base color
    if (colorInput) colorInput.value = getState().baseColor.toUpperCase();
    if (colorPicker) colorPicker.value = getState().baseColor;

    // Sync anchor color preview background
    const previewBg = document.getElementById('color-preview-bg');
    if (previewBg) {
        previewBg.style.background = getState().baseColor;
    }

    // Update slider backgrounds to match current state
    syncColorInputs('hex');
}


function getSwatches(): SwatchResult[] {
    const swatches = getState().paletteMode === 'oklch'
        ? generatePerceptualV2({
            baseColor: getState().baseColor,
            stops: getState().stops,
            overrides: getState().overrides,
            anchorStop: getState().anchorStop,
            oklchHue: getState().oklchHue || 0,
            oklchVividness: getState().oklchVividness || 0
        })
        : generateSwatches({
            baseColor: getState().baseColor,
            stops: getState().stops,
            overrides: getState().overrides,
            anchorStop: getState().anchorStop,
            anchorTheme: 'light'
        });

    // Post-process with contrast against theme
    const bg = getContrastBackground(getState().theme);
    swatches.forEach(s => {
        s.contrastWithNext = wcagContrast(s.hex, bg);
    });

    return swatches;
}

function update() {
    try {
        const s = getState();
        s.lastSwatches = getSwatches();
        render(s.lastSwatches);

        // Render Header Components (Only create once)
        if (modeTabsContainer && !modeTabsContainer.hasChildNodes()) {
            modeTabsContainer.appendChild(createSegmentController({
                id: 'mode-switch',
                options: [
                    { id: 'oklch', label: 'Perceptual' },
                    { id: 'legacy', label: 'Legacy' }
                ],
                activeId: s.paletteMode as string,
                onChange: (id) => {
                    s.paletteMode = id as any;
                    update();
                }
            }));
        }



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
                GripVertical,
                ChevronDown,
                Pencil,
                Globe
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
        // Apply Multi-State Logic
        renderHeaderExpansion();
        applyUIState();
        renderPaletteSidebar();

        // Re-initialize slider references
        oklchHueSlider = getEl<HTMLInputElement>('oklch-hue-slider');
        oklchHueValue = getEl<HTMLElement>('oklch-hue-value');
        oklchVividnessSlider = getEl<HTMLInputElement>('oklch-vividness-slider');
        oklchVividnessValue = getEl<HTMLElement>('oklch-vividness-value');


        modal = getEl<HTMLElement>(DOM_IDS.REFINE_MODAL);

        // Render Refine Modal if not present
        if (modalContainer && !document.getElementById('refine-modal')) {
            modalContainer.innerHTML = '';
            // For now, we pass a dummy swatch or the first one if possible
            // In a real app, this would be reactive or the modal would be static
            const dummySwatch = s.lastSwatches[0] || { stop: 500, hex: '#000000', ratio: 1 };
            modalContainer.appendChild(createRefineModal({
                swatch: dummySwatch as any,
                override: {} as any,
                activeMode: 'hsl',
                onClose: () => { if (modal) modal.classList.add('hidden'); },
                onReset: () => { (window as any).resetOverride(); },
                onSave: () => { (window as any).saveOverride(); },
                onModeSwitch: (mode) => { (window as any).switchToMode(mode); },
                onSliderInput: (key, val) => { (window as any).handleSliderInput(key, val); }
            }));
        }
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
    const isPerceptual = getState().paletteMode === 'oklch';
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

        if (edgeMidpoint > 0 && !getState().stops.includes(edgeMidpoint)) {
            try {
                const tempState = { ...getState(), stops: [edgeMidpoint], overrides: {} };
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
                            getState().lastAddedStop = edgeMidpoint;
                            getState().stops.push(edgeMidpoint);
                            getState().stops.sort((a, b) => a - b);
                            update();
                        };
                    }
                    container?.appendChild(edgeRowStart);
                }
            } catch (e) { }
        }
    }

    swatches.forEach((s, i) => {
        const isIntermediate = ![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(Number(s.stop)) && !s.isAnchor;

        // 1. Table Row
        const row = createPaletteRow({
            swatch: s,
            isPerceptual: getState().paletteMode === 'oklch',
            isNew: Number(s.stop) === getState().lastAddedStop,
            theme: getState().theme,
            onDelete: (isIntermediate && swatches.length > 2) ? (stop) => {
                getState().stops = getState().stops.filter(st => st !== stop);
                getState().stops.sort((a, b) => a - b);
                update();
            } : undefined,
            onClick: (swatch) => openRefine(swatch)
        });

        container?.appendChild(row);

        // 2. INSERTION POINT (Between this and next)
        const currentStop = Number(s.stop);
        const nextStop = i < swatches.length - 1 ? Number(swatches[i + 1].stop) : 1000; // 1000 as max
        const midpoint = Math.round((currentStop + nextStop) / 2);

        if (midpoint > currentStop && midpoint < nextStop && !getState().stops.includes(midpoint)) {
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
                    getState().lastAddedStop = midpoint;
                    getState().stops.push(midpoint);
                    getState().stops.sort((a, b) => a - b);
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
    getState().lastAddedStop = null;
}

function openRefine(swatch: SwatchResult) {
    console.log('Opening refine modal for:', swatch);
    getState().activeStop = swatch.isOriginal ? 'seed' : swatch.stop;
    const title = getEl<HTMLElement>('modal-stop-title');
    if (title) title.innerText = swatch.isOriginal ? `Refine Original Color` : `Refine Stop ${swatch.stop}`;

    // 1. Capture original algorithmic color (no overrides)
    const tempState = { ...getState(), overrides: {} };
    const baseSwatches = generateSwatches(tempState);
    const original = swatch.isOriginal ? baseSwatches.find(x => x.isOriginal) : baseSwatches.find(x => x.stop === swatch.stop);

    if (original) {
        document.getElementById('preview-before')!.style.backgroundColor = original.hex;

        // 2. Initialize override if missing
        const stopKey = getState().activeStop as number; // Type casting for ease, logic handles 'seed' if it were used
        if (!getState().overrides[stopKey]) {
            const cHsl = hsl(original.hex) || { h: 0, s: 0, l: 0 };
            getState().overrides[stopKey] = { mode: 'hsl', hue: cHsl.h || 0, s: cHsl.s || 0, lightness: cHsl.l || 0 };
        }
    }

    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
    const override = getState().overrides[getState().activeStop as number];
    const mode = override ? (override.mode || 'hsl') : 'hsl';
    switchMode(mode);
}

function switchMode(newMode: string) {
    if (getState().activeStop === null) return;
    const stopKey = getState().activeStop as number;

    const currentSwatches = generateSwatches(getState());
    const currentSwatch = getState().activeStop === 'seed' ? currentSwatches.find(x => x.isOriginal) : currentSwatches.find(x => x.stop === getState().activeStop);

    if (currentSwatch) {
        const currentHex = currentSwatch.hex;

        if (newMode === 'lch') {
            const cLch = lch(currentHex) || { l: 0, c: 0, h: 0 };
            getState().overrides[stopKey] = { mode: 'lch', hue: cLch.h || 0, chroma: cLch.c || 0, lightness: cLch.l || 0 };
        } else if (newMode === 'hsl') {
            const cHsl = hsl(currentHex) || { h: 0, s: 0, l: 0 };
            getState().overrides[stopKey] = { mode: 'hsl', hue: cHsl.h || 0, s: cHsl.s || 0, lightness: cHsl.l || 0 };
        } else if (newMode === 'rgb') {
            const cRgb = rgb(currentHex) || { r: 0, g: 0, b: 0 };
            getState().overrides[stopKey] = { mode: 'rgb', r: cRgb.r || 0, g: cRgb.g || 0, b: cRgb.b || 0 };
        } else if (newMode === 'hsb') {
            const cHsv = hsv(currentHex) || { h: 0, s: 0, v: 0 };
            // Note: culori hsv uses 'v' for value (brightness)
            getState().overrides[stopKey] = { mode: 'hsb', hue: cHsv.h || 0, s: cHsv.s || 0, v: cHsv.v || 0 };
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
    const override = getState().overrides[getState().activeStop as number];
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
        // If getState().overrides has HSV props, use them, else convert
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

getEl<HTMLInputElement>('hue-slider')?.addEventListener('input', (e: any) => {
    const target = e.target as HTMLInputElement;
    const h = parseFloat(target.value);
    getState().overrides[getState().activeStop as number] = { ...getState().overrides[getState().activeStop as number], hue: h };
    if (hueVal) (hueVal as HTMLElement).innerText = `${Math.round(h)}°`;
    update(); updateModalPreview();
});

getEl<HTMLInputElement>('chroma-slider')?.addEventListener('input', (e: any) => {
    const target = e.target as HTMLInputElement;
    const c = parseFloat(target.value);
    getState().overrides[getState().activeStop as number] = { ...getState().overrides[getState().activeStop as number], chroma: c };
    if (chromaVal) (chromaVal as HTMLElement).innerText = String(Math.round(c));
    update(); updateModalPreview();
});
const lchLSlider = getEl<HTMLInputElement>('lch-l-slider');
const lchLVal = getEl<HTMLElement>('lch-l-val');
if (lchLSlider) {
    lchLSlider.oninput = (e) => {
        const target = e.target as HTMLInputElement;
        const l = parseFloat(target.value);
        getState().overrides[getState().activeStop as number] = { ...getState().overrides[getState().activeStop as number], lightness: l };
        if (lchLVal) lchLVal.innerText = String(Math.round(l));
        update(); updateModalPreview();
    };
}

// Reset Override
const resetOverrideBtn = getEl<HTMLButtonElement>('reset-override');
if (resetOverrideBtn) {
    resetOverrideBtn.onclick = () => {
        const stopKey = getState().activeStop as number;
        if (getState().activeStop === null) return;
        delete getState().overrides[stopKey];

        const tempState = { ...getState(), overrides: {} };
        const baseSwatches = generateSwatches(tempState);
        const original = getState().activeStop === 'seed' ? baseSwatches.find(x => x.isOriginal) : baseSwatches.find(x => x.stop === getState().activeStop);

        if (original) {
            const cHsl = hsl(original.hex) || { h: 0, s: 0, l: 0 };
            getState().overrides[stopKey] = { mode: 'hsl', hue: cHsl.h || 0, s: cHsl.s || 0, lightness: cHsl.l || 0 };
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
        const currentOverride = getState().overrides[getState().activeStop as number] || {};
        getState().overrides[getState().activeStop as number] = { ...currentOverride, hue: h };

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
        const currentOverride = getState().overrides[getState().activeStop as number] || {};
        getState().overrides[getState().activeStop as number] = { ...currentOverride, s: sPct / 100 };

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
        const currentOverride = getState().overrides[getState().activeStop as number] || {};
        getState().overrides[getState().activeStop as number] = { ...currentOverride, lightness: lPct / 100 };

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
            const currentOverride = getState().overrides[getState().activeStop as number] || {};
            let h = currentOverride.hue ?? 0;
            let s = currentOverride.s ?? 0;
            let v = currentOverride.v ?? 0;

            if (chan === 'h') {
                h = val;
                getState().overrides[getState().activeStop as number] = { ...currentOverride, hue: val, mode: 'hsb' };
            } else if (chan === 's') {
                s = val / 100;
                getState().overrides[getState().activeStop as number] = { ...currentOverride, s: s, mode: 'hsb' };
            } else if (chan === 'b') {
                v = val / 100;
                getState().overrides[getState().activeStop as number] = { ...currentOverride, v: v, mode: 'hsb' };
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

// ANCHOR LISTENERS
if (anchorCopyBtn) {
    (anchorCopyBtn as HTMLElement).onclick = () => {
        const currentHex = getState().baseColor.toUpperCase();
        copyToClipboard(currentHex);
        parent.postMessage({ pluginMessage: { type: 'NOTIFY', message: 'Hex code copied!' } }, '*');
    };
}
['r', 'g', 'b'].forEach(chan => {
    const el = getEl<HTMLInputElement>(`rgb-${chan}-slider`);
    if (el) {
        el.oninput = (e) => {
            const target = e.target as HTMLInputElement;
            const val = parseInt(target.value);

            // Update state
            const currentOverride = getState().overrides[getState().activeStop as number] || {};
            const r = (chan === 'r' ? val / 255 : (currentOverride.r !== undefined ? currentOverride.r : 0));
            const g = (chan === 'g' ? val / 255 : (currentOverride.g !== undefined ? currentOverride.g : 0));
            const b = (chan === 'b' ? val / 255 : (currentOverride.b !== undefined ? currentOverride.b : 0));

            getState().overrides[getState().activeStop as number] = { ...currentOverride, [chan]: val / 255, mode: 'rgb' };
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
    getState().activeStop = null;
}

const closeModalBtn = getEl<HTMLButtonElement>('close-modal');
if (closeModalBtn) closeModalBtn.onclick = closeModal;

// Connect Done button (same as close)
const doneBtn = document.getElementById('save-modal-btn');
if (doneBtn) {
    doneBtn.onclick = () => {
        // Handle "Original/Seed" Persistence
        // Since generateSwatches uses getState().baseColor (not overrides['seed']), we must apply the override to baseColor now.
        if (getState().activeStop === 'seed' && getState().overrides['seed']) {
            const over = getState().overrides['seed'];
            let newHex = getState().baseColor;

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
                        getState().baseColor = newHex;
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
            delete getState().overrides['seed'];
        }

        // Ensure state is up to date and UI reflects it
        update();
        closeModal();
    };
}

// Click outside to close
if (modal) {
    (modal as HTMLElement).onclick = (e: MouseEvent) => {
        if (e.target === modal) {
            closeModal();
        }
    };
}

function updateModalPreview() {
    if (getState().activeStop === null) return;
    const swatches = getSwatches();
    const swatch = getState().activeStop === 'seed'
        ? swatches.find(x => x.isOriginal)
        : swatches.find(s => s.stop === (getState().activeStop as number));

    if (!swatch) return;

    // Get Original for comparison
    const tempState = { ...getState(), overrides: {} };
    const baseSwatches = getState().paletteMode === 'oklch'
        ? generatePerceptualV2({
            baseColor: tempState.baseColor,
            stops: tempState.stops,
            overrides: {},
            anchorStop: tempState.anchorStop,
            oklchHue: tempState.oklchHue || 0,
            oklchVividness: tempState.oklchVividness || 0
        })
        : generateSwatches(tempState);
    const original = getState().activeStop === 'seed'
        ? baseSwatches.find((x: SwatchResult) => x.isOriginal)
        : baseSwatches.find((s: SwatchResult) => s.stop === (typeof getState().activeStop === 'string' ? swatch.stop : getState().activeStop));

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
            getState().baseColor = resolved;
            if (colorPicker) colorPicker.value = resolved;
            syncColorInputs('hex');
            update();
            // syncColorInputs will format the input value to uppercase hex
        }
    };

    colorInput.onblur = () => {
        // Ensure we always end with a valid hex in the field
        colorInput.value = getState().baseColor.toUpperCase();
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
        getState().baseColor = target.value;
        if (colorInput) colorInput.value = getState().baseColor.toUpperCase();
        syncColorInputs('hex');
        update();
    };
}

// ==============================================================================
// MODE TOGGLE HANDLERS
// ==============================================================================

function setMode(mode: 'legacy' | 'oklch') {
    getState().paletteMode = mode;
    // We NO LONGER reset overrides or stops when switching modes
    // because the user might want to compare the same settings in different algos.

    // Both modes now share the same color picking options (sliders + hex)
    // as they are bi-directionally synced.

    // Immediately update UI with existing swatches (mode-dependent display)
    if (getState().lastSwatches.length > 0) {
        render(getState().lastSwatches);
    }
}

// Sliders and other inputs handled below

// OKLCH Hue Slider
getEl<HTMLInputElement>('oklch-hue-slider')?.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    const sliderHue = parseInt(target.value, 10);
    // Offset logic: 0 on slider maps to OKLCH 29° (Red)
    const logicalHue = (sliderHue + 0) % 360;
    getState().oklchHue = logicalHue;
    if (oklchHueValue) (oklchHueValue as HTMLElement).innerText = `${logicalHue}°`;
    syncColorInputs('sliders');
    update();
});

// OKLCH Vividness Slider
getEl<HTMLInputElement>('oklch-vividness-slider')?.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    const vividness = parseInt(target.value, 10);
    getState().oklchVividness = vividness / 100; // Convert 0-100 to 0-1
    if (oklchVividnessValue) (oklchVividnessValue as HTMLElement).innerText = `${vividness}%`;
    syncColorInputs('sliders');
    update();
});


// Helper to construct payload
function getPayload(isUpdate: boolean): FigmaExportPayload {
    // Determine Base Name
    const safeAnchor = getState().lastSwatches.find(s => s.isAnchor) || getState().lastSwatches[0];
    let baseColorName: string;

    if (getState().paletteMode === 'oklch') {
        const h = getState().oklchHue !== undefined ? (getState().oklchHue as number) : 0;
        if (h < 15 || h >= 345) baseColorName = 'Red';
        else if (h < 45) baseColorName = 'Orange';
        else if (h < 75) baseColorName = 'Yellow';
        else if (h < 150) baseColorName = 'Green';
        else if (h < 190) baseColorName = 'Teal';
        else if (h < 260) baseColorName = 'Blue';
        else if (h < 300) baseColorName = 'Indigo';
        else if (h < 345) baseColorName = 'Purple';
        else baseColorName = 'Red';
    } else {
        baseColorName = getColorName(hexToFigmaRgb(safeAnchor?.hex || getState().baseColor));
    }

    // Filter Swatches (No pure white/black)
    const activeSwatches = getSwatches().filter(s =>
        s.hex.toLowerCase() !== '#ffffff' && s.hex.toLowerCase() !== '#000000'
    );

    const finalSwatches = activeSwatches.map(s => {
        const rgb = hexToFigmaRgb(s.hex);
        const contrast = wcagContrast(s.hex, getContrastBackground(getState().theme));
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
        paletteId: getState().selectedPaletteId || undefined
    };
}

// 1. FOOTER: VARIABLES HANDLER (Dynamic Create/Update)
getEl<HTMLButtonElement>('btn-variables')?.addEventListener('click', () => {
    const state = computeUIState();
    const isUpdate = state === 'edit';
    const payload = getPayload(isUpdate);

    if (!isUpdate) {
        // Track the name we're about to create to auto-select it later
        (window as any)._pendingPaletteSelection = payload.name;
    }

    // Config for Variables
    payload.createVariables = true;
    payload.createFrame = false;

    parent.postMessage({
        pluginMessage: {
            type: 'EXPORT_TO_FIGMA',
            payload: payload
        }
    }, '*');
});

// 2. FOOTER: CANVAS HANDLER
const handleCanvasClick = () => {
    // Template creation is always a "create" action for the frame
    const payload = getPayload(false); // Force create mode
    payload.createVariables = false;
    payload.createFrame = true;

    parent.postMessage({
        pluginMessage: {
            type: 'EXPORT_TO_FIGMA',
            payload: payload
        }
    }, '*');
};

getEl<HTMLButtonElement>('btn-canvas')?.addEventListener('click', handleCanvasClick);

// 3. FOOTER: RESET HANDLER
getEl<HTMLButtonElement>('btn-reset')?.addEventListener('click', () => {
    (window as any).resetPlugin(); // Use global helper if available or local resetPlugin
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
                getState().baseColor = result.sRGBHex;
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

// Anchor Copy listener moved to top (lines ~814) to be near other listeners and avoid duplication.
// Removed dead code for 'copy-anchor-hex' ID which does not exist.

// CREATE TEMPLATE HANDLER (Kept for search compatibility if needed, but we used footer listeners above)

window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (msg.type === 'SET_BASE_COLOR') {
        getState().baseColor = msg.hex;
        getState().overrides = {};
        if (colorInput) colorInput.value = msg.hex;
        if (colorPicker) colorPicker.value = msg.hex;
        update();
    } else if (msg.type === 'PALETTES_DATA') {
        // V 0.0.80: Receive detected palettes from Figma
        console.log("UI: Received PALETTES_DATA", msg.palettes);
        getState().detectedPalettes = msg.palettes || [];

        const s = getState();
        const pendingSelection = (window as any)._pendingPaletteSelection;

        if (pendingSelection) {
            // Find the newly created palette
            const match = s.detectedPalettes.find(p => p.hueName.startsWith(pendingSelection));
            if (match) {
                delete (window as any)._pendingPaletteSelection;
                delete (window as any)._isCreatingManual;
                selectPalette(match.hueName);
                return;
            }
        }

        // V 0.0.90: Strict State Management - Sync Data
        if (s.selectedPaletteId) {
            const current = s.detectedPalettes.find(p => p.hueName === s.selectedPaletteId);
            if (current) {
                s.originalPaletteData = current.stops.map(st => ({ stop: st.stop, hex: st.hex }));

                // V 1.1.0: Robust case-insensitive comparison
                const uiHexes = s.lastSwatches.map(x => x.hex.toLowerCase());
                const figmaHexes = current.stops.map(x => x.hex.toLowerCase());

                const isMatching = JSON.stringify(uiHexes) === JSON.stringify(figmaHexes);
                if (isMatching) {
                    s.isDirty = false;
                    // Update synced state to match current
                    StateManager.commit();
                }
            } else {
                // V 0.0.92: ORPHANED PALETTE PROTECTION
                // Selected palette is no longer in Figma's variables!
                // We keep the working state but switch context to "Creation"
                console.warn(`Selected palette ${s.selectedPaletteId} was deleted in Figma. Switching to creation mode.`);
                s.selectedPaletteId = null;
                s.syncedState = null;
                StateManager.checkDirty(); // Recalculate dirty against INITIAL_STATE
                parent.postMessage({ pluginMessage: { type: 'NOTIFY', message: 'Original palette deleted. You can save this as a new one.' } }, '*');
            }
        }

        // Auto-select first palette on boot REMOVED to defaulting to View Mode (State 2)
        // if (!s.selectedPaletteId && s.detectedPalettes.length > 0 && !(window as any)._isCreatingManual) {
        //    selectPalette(s.detectedPalettes[0].hueName);
        // } else {
        renderPaletteSidebar();
        update();
    }
}


/**
 * Renders the palette sidebar with detected palettes (V 0.0.80)
 */
function renderPaletteSidebar() {
    const s = getState();
    const sidebar = document.getElementById('palette-sidebar');
    if (!sidebar) return;

    const uiState = computeUIState();

    // Only show "Color palettes" row in Default mode (View mode)
    // In Create/Edit mode, we hide it to avoid duplication or clutter
    if (s.detectedPalettes.length === 0 || uiState !== 'default') {
        sidebar.style.display = 'none';
        return;
    } else {
        sidebar.style.display = 'flex';
    }

    const newSidebar = createPaletteSelector({
        palettes: s.detectedPalettes,
        selectedId: s.selectedPaletteId,
        onSelect: (id: string) => selectPalette(id),
        onAdd: () => {
            // Take snapshot of current state before clearing for creation
            const snapshot = {
                prevId: s.selectedPaletteId,
                prevHue: s.oklchHue,
                prevVividness: s.oklchVividness,
                prevColor: s.baseColor
            };
            (window as any)._creationSnapshot = snapshot;

            setState({
                selectedPaletteId: null,
                originalPaletteData: null,
                isDirty: false,
                overrides: {},
                stops: [100, 200, 300, 400, 500, 600, 700, 800, 900],
                // Reset to defaults for a "New Palette" feel
                oklchHue: 297,
                oklchVividness: 1,
                baseColor: '#9600FF'
            });

            // Refresh UI
            update();
            initializeSliders();
            renderPaletteSidebar();
        },
        onCancel: () => {
            const snapshot = (window as any)._creationSnapshot;
            // Clear manual creation flag so we don't get stuck
            delete (window as any)._isCreatingManual;

            if (snapshot && snapshot.prevId) {
                // Restore previous palette exactly
                setState({
                    oklchHue: snapshot.prevHue,
                    oklchVividness: snapshot.prevVividness,
                    baseColor: snapshot.prevColor
                });
                selectPalette(snapshot.prevId);
            } else if (s.detectedPalettes.length > 0) {
                // Fallback to first palette
                selectPalette(s.detectedPalettes[0].hueName);
            } else {
                update();
            }
            delete (window as any)._creationSnapshot;
        }
    });

    sidebar.replaceWith(newSidebar);

    // Re-initialize icons for the new sidebar elements
    createIcons({
        icons: {
            Plus,
            ChevronDown,
            Pencil
        }
    });
}

function renderHeaderExpansion() {
    const state = getState();
    const hasTokens = state.detectedPalettes.length > 0;
    const isExpanded = state.isHeaderExpanded;
    const hasSelection = !!state.selectedPaletteId;

    // Compute header state
    type HeaderState = 'create-no-tokens' | 'default' | 'edit' | 'create-with-tokens';
    let headerState: HeaderState;

    if (!hasTokens) {
        headerState = 'create-no-tokens';
        // Note: We don't force isHeaderExpanded here anymore.
        // The state should already be expanded by INITIAL_STATE or explicitly set.
    } else if (!isExpanded) {
        headerState = 'default';
    } else if (hasSelection) {
        headerState = 'edit';
    } else {
        headerState = 'create-with-tokens';
    }

    // Apply state to body for CSS selectors
    document.body.setAttribute('data-header-state', headerState);

    // Handle expandable container classes
    const shouldExpand = headerState !== 'default';
    if (expandableSettings) {
        if (shouldExpand) {
            expandableSettings.classList.remove('collapsed');
            expandableSettings.classList.add('expanded');
        } else {
            expandableSettings.classList.remove('expanded');
            expandableSettings.classList.add('collapsed');
        }
    }

    // Handle top header collapsed class
    if (topHeader) {
        if (shouldExpand) {
            topHeader.classList.remove('collapsed');
        } else {
            topHeader.classList.add('collapsed');
        }
    }

    // Update status row content based on state
    const statusLabel = document.getElementById('status-label');
    const statusColorDot = document.getElementById('status-color-dot') as HTMLElement;
    const statusColorName = document.getElementById('status-color-name') as HTMLInputElement;

    if (statusLabel && statusColorDot && statusColorName) {
        if (headerState === 'edit' && state.selectedPaletteId) {
            // Editing existing palette
            statusLabel.textContent = 'Editing palette:';
            const palette = state.detectedPalettes.find(p => p.hueName === state.selectedPaletteId);
            if (palette) {
                statusColorName.value = palette.hueName;
            }
            // Always use current baseColor for live preview
            statusColorDot.style.background = state.baseColor;
        } else {
            // Creating new palette
            statusLabel.textContent = 'Creating new palette';
            statusColorName.value = getColorName(hexToFigmaRgb(state.baseColor));
            statusColorDot.style.background = state.baseColor;
        }
    }

    // VISIBILITY ENFORCEMENT
    const statusRow = document.getElementById('status-row');
    const editToggle = document.getElementById('edit-palette-toggle');
    const sidebar = document.getElementById('palette-sidebar');

    switch (headerState) {
        case 'create-no-tokens': // State 1
            if (statusRow) statusRow.style.display = 'flex';
            // Hide edit toggle in fresh state as there is nothing to edit/cancel back to
            if (editToggle) editToggle.style.display = 'none';
            if (sidebar) sidebar.style.display = 'none';
            break;

        case 'default': // State 2 (View Mode)
            if (statusRow) statusRow.style.display = 'none';
            if (editToggle) editToggle.style.display = 'flex'; // Show Pencil
            if (sidebar) sidebar.style.display = 'flex';
            break;

        case 'edit': // State 3 (Edit Mode)
            if (statusRow) statusRow.style.display = 'flex';
            if (editToggle) editToggle.style.display = 'flex'; // Show Cancel
            if (sidebar) sidebar.style.display = 'none';
            break;

        case 'create-with-tokens': // State 4 (Add Mode)
            if (statusRow) statusRow.style.display = 'flex';
            if (editToggle) editToggle.style.display = 'flex'; // Show Cancel
            if (sidebar) sidebar.style.display = 'none';
            break;
    }

    // Re-initialize icons for button states logic (Pencil vs X) handled by CSS via data-header-state
    // But we need to ensure the correct icons are available if DOM was rebuilt
    if (editToggle) {
        createIcons({
            icons: { Pencil, X },
            nameAttr: 'data-lucide',
            attrs: {
                class: "icon-svg",
                style: "width: 14px; height: 14px;"
            }
        });
    }
}

/**
 * Selects a palette from the sidebar and loads it into the editor (V 0.0.80)
 */
function selectPalette(hueName: string) {
    const palette = getState().detectedPalettes.find(p => p.hueName === hueName);
    if (!palette) return;

    // Update selection state
    const s = getState();
    s.selectedPaletteId = hueName;
    s.isDirty = false;

    // Store original data for dirty-checking
    s.originalPaletteData = palette.stops.map(s => ({ stop: s.stop, hex: s.hex }));

    // Auto-expand header removed per user request
    // s.isHeaderExpanded = true;
    // renderHeaderExpansion();

    // LOAD PALETTE INTO EDITOR
    // 1. Find the 500 stop (or closest) to use as "Anchor"
    const anchorStop = palette.stops.find(s => s.stop === 500)
        || palette.stops[Math.floor(palette.stops.length / 2)]
        || palette.stops[0];

    getState().baseColor = anchorStop.hex;
    getState().anchorStop = anchorStop.stop;

    // 2. Set stops based on what's in the palette
    getState().stops = palette.stops.map(s => s.stop).sort((a, b) => a - b);

    // 3. Set Overrides for EVERYTHING to ensure fidelity
    // This treats existing tokens as "locked" values unless manually changed by the user.
    getState().overrides = {};
    palette.stops.forEach(s => {
        getState().overrides[s.stop] = { mode: 'lch', ...lch(s.hex) }; // Store LCH as override reference
    });

    // 4. Update UI Inputs
    if (colorInput) colorInput.value = getState().baseColor;
    if (colorPicker) colorPicker.value = getState().baseColor;
    if (anchorDisplay) anchorDisplay.innerText = getState().baseColor;

    // SYNC SLIDERS TO SELECTED PALETTE
    const baseOklch = oklch(getState().baseColor);
    if (baseOklch) {
        getState().oklchHue = baseOklch.h || 0;
        getState().oklchVividness = (baseOklch.c || 0) / 0.4;
    }

    // V 0.0.90: Commit the loaded state as the "Synced" baseline
    StateManager.commit();

    // 5. Sync & Update
    syncColorInputs('hex');
    update();

    renderPaletteSidebar();
}

// Add palette button handler
if (addPaletteBtn) {
    addPaletteBtn.onclick = () => {
        // Clear selection for "new palette" mode
        getState().selectedPaletteId = null;
        getState().originalPaletteData = null;
        getState().isDirty = false;
        (window as any)._isCreatingManual = true;

        // Reset overrides to unlock the generator
        getState().overrides = {};
        getState().stops = [...[100, 200, 300, 400, 500, 600, 700, 800, 900]];

        // Auto-expand header for creation
        getState().isHeaderExpanded = true;
        renderHeaderExpansion();

        renderPaletteSidebar();
        update();
    };
}

/**
 * Checks if current state differs from the loaded palette (V 0.0.80)
 */
function checkDirty() {
    // V 0.0.90: Delegate to StateManager
    StateManager.checkDirty();
    updateButtonState();
}

/**
 * Updates the main action button text based on state (V 0.0.80)
 */
/**
 * Updates the Save Variables button text based on state (V 0.0.80)
 */


function computeUIState(): 'create-no-tokens' | 'default' | 'edit' | 'create-with-tokens' {
    const s = getState();
    const hasTokens = s.detectedPalettes.length > 0;
    const isExpanded = s.isHeaderExpanded;
    const hasSelection = !!s.selectedPaletteId;

    if (!hasTokens) {
        return 'create-no-tokens';
    } else if (!isExpanded) {
        return 'default';
    } else if (hasSelection) {
        return 'edit';
    } else {
        return 'create-with-tokens';
    }
}

function applyUIState() {
    const uiState = computeUIState();
    const s = getState();
    document.body.setAttribute('data-ui-state', uiState);

    if (!footerContainer) return;

    // Clear and re-render footer based on state
    footerContainer.innerHTML = '';
    const footerRow = document.createElement('div');
    footerRow.className = 'footer-row footer-state-active';

    if (uiState === 'default') {
        const btn = createButton({
            id: 'btn-footer-canvas-full',
            text: 'Create palette on canvas',
            icon: 'figma-logo',
            variant: 'secondary',
            className: 'w-full',
            onClick: () => (window as any).createSelectionOnCanvas()
        });
        footerRow.appendChild(btn);
    } else {
        // Multi-action: Canvas | Variables | Reset
        // Applicable for: create-no-tokens, edit, create-with-tokens

        const canvasBtn = createButton({
            id: 'btn-footer-canvas',
            text: 'Create on canvas',
            icon: 'figma-logo',
            variant: 'secondary',
            className: 'w-full',
            onClick: () => (window as any).createSelectionOnCanvas()
        });

        const variablesBtn = createButton({
            id: 'btn-footer-variables',
            text: uiState === 'edit' ? 'Update variables' : 'Create variables',
            icon: 'palette',
            variant: 'primary',
            className: 'w-full',
            disabled: uiState === 'edit' ? !s.isDirty : false,
            onClick: () => (window as any).exportToFigma()
        });

        // Reset Button Visibility Logic
        // State 1 (fresh): Explicitly NO reset button in design? Or maybe standard. Screenshot 4 has it.
        // State 3 (edit): Only if Dirty? Screenshot 3 "No changes" has NO reset button.
        // State 3 (edit, dirty): "Changes happen" has reset button.


        // Actually, screenshot 1 (Fresh) DOES show the reset circle.
        // Screenshot 3 (Edit Clean) does NOT show it.
        // Screenshot 3 (Edit Dirty) DOES show it.

        const shouldShowReset = uiState === 'edit' ? s.isDirty : true;

        footerRow.appendChild(canvasBtn);
        footerRow.appendChild(variablesBtn);

        if (shouldShowReset) {
            const resetBtn = createButton({
                id: 'btn-footer-reset',
                icon: 'refresh-cw',
                variant: 'ghost', // circle/ghost variant
                title: 'Discard changes',
                onClick: () => resetPlugin() // Use the safe reset
            });
            footerRow.appendChild(resetBtn);
        }
    }

    footerContainer.appendChild(footerRow);

    // Re-run Lucide on footer items
    createIcons({
        icons: { Palette, RefreshCw, Globe },
        nameAttr: 'data-lucide',
        attrs: { width: 16, height: 16 }
    });
}

function updateButtonState() {
    applyUIState();
}

// Add event listener helper for dynamic palette selector
// This is to ensure we don't rely only on inline onclicks if something strips them
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const pill = target.closest('.palette-pill');
    if (pill && (pill as HTMLElement).title) {
        // We handle this via inline onclick, but this is a backup / debug
        // console.log('Pill clicked via delegation:', (pill as HTMLElement).title);
    }
});




// ==============================================================================
// THEME TOGGLE HANDLER
// ==============================================================================

function setThemeUI(theme: 'light' | 'dark') {
    getState().theme = theme;
    document.body.classList.toggle('light-theme', theme === 'light');

    update();

    // Toggle visibility of moon/sun controllers
    requestAnimationFrame(() => {
        const moonController = document.getElementById('theme-thumb-moon');
        const sunController = document.getElementById('theme-thumb-sun');

        if (theme === 'light') {
            // Light mode: show sun, hide moon
            if (sunController) sunController.style.opacity = '1';
            if (moonController) moonController.style.opacity = '0';
        } else {
            // Dark mode: show moon, hide sun
            if (sunController) sunController.style.opacity = '0';
            if (moonController) moonController.style.opacity = '1';
        }
    });
}

function toggleTheme() {
    setThemeUI(getState().theme === 'dark' ? 'light' : 'dark');
}

if (themeToggleBtn) {
    (themeToggleBtn as HTMLButtonElement).onclick = toggleTheme;
}

// Initial Theme Check
setThemeUI(getState().theme);

// Reset handler removed (now in footer)

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

export function resetPlugin() {
    (window as any).resetPlugin = resetPlugin;
    const s = getState();

    // Context-Aware Reset: 
    // If editing -> Discard Changes (Revert to Synced State)
    // If creating -> Factory Reset

    if (s.selectedPaletteId && s.syncedState) {
        // Discard Changes Logic
        StateManager.reset();

        // We must re-render the UI based on the reverted state
        // restore inputs
        if (colorInput) colorInput.value = getState().baseColor;
        if (colorPicker) colorPicker.value = getState().baseColor;

        // Re-calculate sliders based on reverted OKLCH/BaseColor
        syncColorInputs('hex');
        initializeSliders();
        setMode(getState().paletteMode || 'oklch');

    } else {
        // Factory Reset (Creation Mode)
        StateManager.reset();

        getState().lastAddedStop = null;
        getState().activeStop = null;
        if (modal) modal.classList.add('hidden');

        // Reset DOM elements
        if (colorInput) colorInput.value = getState().baseColor;
        if (colorPicker) colorPicker.value = getState().baseColor;

        syncColorInputs('hex');
        setMode(getState().paletteMode || 'oklch');

        // Ensure theme UI matches
        setThemeUI(getState().theme);
    }

    // Common finalizer
    update();
}

// Tokens toggle removed

// Anchor Theme Toggle

// Initial mode and UI sync
if (typeof APP_VERSION !== 'undefined') {
    const versionEl = document.querySelector('.version-tag');
    if (versionEl) versionEl.textContent = `V ${APP_VERSION}`;
}

// V 0.0.91: System Theme Sync
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const initialTheme = systemDark.matches ? 'dark' : 'light';
setThemeUI(initialTheme);

systemDark.addEventListener('change', (e) => {
    const newTheme = e.matches ? 'dark' : 'light';
    setThemeUI(newTheme);
});

// Chevron Toggle Binding
if (editPaletteToggle) {
    editPaletteToggle.onclick = () => {
        const s = getState();
        const isExpanded = s.isHeaderExpanded;

        if (isExpanded) {
            // "Cancel" Action: Revert changes and collapse
            // Optionally discard dirty changes
            if (s.isDirty && s.syncedState) {
                StateManager.reset();
            }

            // Clear selection to return to View mode (State 2)
            s.selectedPaletteId = null;
            s.syncedState = null;
            s.originalPaletteData = null;
            s.isDirty = false;
            s.isHeaderExpanded = false;
        } else {
            // "Edit" Action: Expand (but don't select anything yet)
            s.isHeaderExpanded = true;
        }

        renderHeaderExpansion();
        update(); // Ensure full UI refresh
        renderPaletteSidebar(); // Sync sidebar visibility
    };
}

renderHeaderExpansion();
syncColorInputs('hex'); // Alignment hex -> sliders
initializeSliders(); // Initialize all sliders and UI elements with state values
// Request palettes on launch
parent.postMessage({ pluginMessage: { type: 'GET_PALETTES' } }, '*');

setMode(getState().paletteMode || 'oklch'); // This calls update() internally
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
