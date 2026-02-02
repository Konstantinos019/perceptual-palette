import type { AppState, SwatchResult, DetectedPalette } from '../lib/tokens/types';

export interface UIState extends AppState {
    theme: 'dark' | 'light';
    activeStop: number | 'seed' | null;
    lastAddedStop: number | null;
    lastSwatches: SwatchResult[];
    detectedPalettes: DetectedPalette[];
    selectedPaletteId: string | null;
    // V 0.0.90: Strict Source of Truth
    originalPaletteData: { stop: number; hex: string }[] | null; // Legacy Snapshot (Simple)
    syncedState: AppState | null; // Full Deep Snapshot of Figma State
    isDirty: boolean;
    isHeaderExpanded: boolean;
}

const STANDARD_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const INITIAL_STATE: UIState = {
    baseColor: '#9600FF',
    stops: [...STANDARD_STOPS],
    overrides: {},
    showOriginal: false,
    anchorStop: 500,
    paletteMode: 'oklch', // Fixed to OKLCH
    oklchHue: 297,
    oklchVividness: 1,
    theme: 'light',
    activeStop: null,
    lastAddedStop: null,
    lastSwatches: [],
    detectedPalettes: [],
    selectedPaletteId: null,
    originalPaletteData: null,
    syncedState: null,
    isDirty: false,
    isHeaderExpanded: false // Start in "Viewing Mode" (Collapsed)
};

let state: UIState = { ...INITIAL_STATE };

// Helper to deep compare critical state fields
function isStateDifferent(a: AppState, b: AppState): boolean {
    if (a.baseColor.toLowerCase() !== b.baseColor.toLowerCase()) return true;
    if (a.stops.length !== b.stops.length) return true;
    if (!a.stops.every((s, i) => s === b.stops[i])) return true;
    if (a.paletteMode !== b.paletteMode) return true;
    if (a.oklchHue !== b.oklchHue) return true;
    if (a.oklchVividness !== b.oklchVividness) return true;

    // Deep compare overrides
    const aKeys = Object.keys(a.overrides);
    const bKeys = Object.keys(b.overrides);
    if (aKeys.length !== bKeys.length) return true;

    // Naive JSON stringify for overrides is sufficient for now given structure
    return JSON.stringify(a.overrides) !== JSON.stringify(b.overrides);
}

export const StateManager = {
    getState: () => state,
    setState: (newState: Partial<UIState>) => {
        state = { ...state, ...newState };
        return state;
    },
    // Context-Aware Reset
    reset: () => {
        if (state.selectedPaletteId && state.syncedState) {
            // Revert to Figma State
            state = {
                ...state,
                ...state.syncedState,
                isDirty: false
            };
        } else {
            // Factory Reset - but preserve palettes and theme
            const palettes = state.detectedPalettes;
            const theme = state.theme;
            state = { ...INITIAL_STATE, detectedPalettes: palettes, theme };
        }
        return state;
    },
    // Commit current state as the new "Synced" state (after Save)
    commit: () => {
        const { theme, activeStop, lastAddedStop, lastSwatches, detectedPalettes, selectedPaletteId, originalPaletteData, syncedState, isDirty, isHeaderExpanded, ...appState } = state;
        state.syncedState = JSON.parse(JSON.stringify(appState)); // Deep Clone
        state.isDirty = false;
        return state;
    },
    checkDirty: () => {
        const { theme, activeStop, lastAddedStop, lastSwatches, detectedPalettes, selectedPaletteId, originalPaletteData, syncedState, isDirty, isHeaderExpanded, ...currentState } = state;

        // Baseline: Synced State (Editing) OR Initial State (Creating)
        const baseline = state.syncedState || {
            baseColor: INITIAL_STATE.baseColor,
            stops: INITIAL_STATE.stops,
            overrides: INITIAL_STATE.overrides,
            // Add other critical fields that are part of AppState
            paletteMode: INITIAL_STATE.paletteMode,
            oklchHue: INITIAL_STATE.oklchHue,
            oklchVividness: INITIAL_STATE.oklchVividness,
            anchorStop: INITIAL_STATE.anchorStop,
            showOriginal: INITIAL_STATE.showOriginal
        };

        const hasChanged = isStateDifferent(currentState, baseline);
        state.isDirty = hasChanged;
        return hasChanged;
    }
};
