/**
 * SHARED_CONTRACT.ts
 * 
 * This contract defines the data structures, UI identifiers, and communication protocols
 * for the Perceptual Palette Figma Plugin.
 * 
 * CORE LOGIC:
 * - Anchor: User-selected base color (e.g., stop 500).
 * - Relative Stepping: Adjacent colors maintain a 1.35:1 contrast ratio.
 * - Contrast Formula: (L1 + 0.05) / (L2 + 0.05)
 * - Lighter Steps (towards 100): L_next = 1.35 * (L_prev + 0.05) - 0.05
 * - Darker Steps (towards 900): L_next = (L_prev + 0.05) / 1.35 - 0.05
 */

/**
 * Configuration for palette generation
 */
export interface Override {
    mode?: 'lch' | 'hsl' | 'rgb' | 'hsb';
    hue?: number; chroma?: number; lightness?: number;
    s?: number; // HSL/HSB Saturation
    v?: number; // HSB Brightness/Value
    r?: number; g?: number; b?: number; // RGB components
}

export interface PaletteConfig {
    /** Hex string of the anchor color */
    baseColor: string;
    /** The specific weights to generate (e.g., [100, 200, ..., 900]) */
    stops: number[];
    /** Manual overrides for specific stops to tweak aesthetics */
    // Key is stop number (e.g. 500) OR 'seed' for the base color
    overrides: Record<number | string, Override>;
    /** Whether to show the original input color as a separate swatch */
    showOriginal?: boolean;
    /** The specific stop to treat as the anchor/seed (defaults to 500) */
    anchorStop?: number;
    /** Palette generation mode: 'legacy' (seed-based) or 'oklch' (perceptual) */
    paletteMode?: 'legacy' | 'oklch';
    /** OKLCH hue value (0-360) - used when paletteMode is 'oklch' */
    oklchHue?: number;
    /** OKLCH vividness/chroma intensity (0-1) - used when paletteMode is 'oklch' */
    oklchVividness?: number;
    /** The target theme background for the anchor calculation (Legacy mode) */
    anchorTheme?: 'light' | 'dark';
}

/**
 * Calculated result for a single color stop
 */
export interface SwatchResult {
    /** The stop weight (e.g., 500) */
    stop: number;
    /** Resulting Hex string */
    hex: string;
    /** LCH representation for internal logic */
    lch: { l: number; c: number; h: number };
    /** Contrast ratio against the next darker stop (if any) */
    contrastWithNext: number;
    /** True if this stop was the user-defined base color */
    isAnchor: boolean;
    /** True if this is the original input color inserted into the scale */
    isOriginal?: boolean;
}

/**
 * DOM Element Identifiers for the Plugin UI
 */
export const DOM_IDS = {
    BASE_COLOR_INPUT: 'base-color-input',
    HEX_TEXT: 'hex-text',
    STOPS_CONTAINER: 'stops-container',
    REFINE_MODAL: 'refine-modal',
    GENERATE_BTN: 'generate-btn',
    EXPORT_BTN: 'export-btn',
} as const;

/**
 * Message types for communication between UI and Plugin Logic
 */
export type PluginMessageType =
    | 'GENERATE_PREVIEW'
    | 'EXPORT_TO_FIGMA';

export interface PluginMessage {
    type: PluginMessageType;
    payload?: any;
}

// FINAL PAYLOAD "DUMB RENDERER" CONTRACT
export interface FigmaExportPayload {
    name: string;
    createVariables: boolean;
    swatches: {
        stop: number;
        hex: string;
        color: { r: number, g: number, b: number }; // Figma RGB
        contrast: number;
        isPass: boolean;
        isAnchor: boolean;
        isOriginal?: boolean;
    }[];

    // V 0.0.80: Database Action
    action?: 'create' | 'update';
    paletteId?: string; // hueName
}

/**
 * Detected palette from Figma Variables
 * Used for sidebar display and editing
 */
export interface DetectedPalette {
    /** Hue name (e.g., 'neutral', 'amber', 'green') */
    hueName: string;
    /** Preview hex color (500 stop or center) */
    previewHex: string;
    /** All stops in this palette */
    stops: {
        stop: number;
        hex: string;
        variableId: string;
    }[];
}
