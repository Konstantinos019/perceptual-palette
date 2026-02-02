/**
 * SHARED_CONTRACT.ts
 * 
 * This contract defines the data structures, UI identifiers, and communication protocols
 * for the Perceptual Palette Figma Plugin.
 */

export interface Override {
    mode?: 'lch' | 'hsl' | 'rgb' | 'hsb';
    hue?: number; chroma?: number; lightness?: number;
    s?: number; // HSL/HSB Saturation
    v?: number; // HSB Brightness/Value
    r?: number; g?: number; b?: number; // RGB components
}

export interface PaletteConfig {
    baseColor: string;
    stops: number[];
    overrides: Record<number | string, Override>;
    showOriginal?: boolean;
    anchorStop?: number;
    paletteMode?: 'legacy' | 'oklch';
    oklchHue?: number;
    oklchVividness?: number;
    anchorTheme?: 'light' | 'dark';
}

/**
 * The core state of the application, representing the persistent model.
 */
export interface AppState extends PaletteConfig {
    // Domain-level state
}

export interface SwatchResult {
    stop: number;
    hex: string;
    lch: { l: number; c: number; h: number };
    contrastWithNext: number;
    isAnchor: boolean;
    isOriginal?: boolean;
}

export const DOM_IDS = {
    BASE_COLOR_INPUT: 'base-color-input',
    HEX_TEXT: 'hex-text',
    STOPS_CONTAINER: 'stops-container',
    REFINE_MODAL: 'refine-modal',
    GENERATE_BTN: 'generate-btn',
    EXPORT_BTN: 'export-btn',
} as const;

export type PluginMessageType =
    | 'GENERATE_PREVIEW'
    | 'EXPORT_TO_FIGMA';

export interface PluginMessage {
    type: PluginMessageType;
    payload?: any;
}

export interface FigmaExportPayload {
    name: string;
    createVariables: boolean;
    swatches: {
        stop: number;
        hex: string;
        color: { r: number, g: number, b: number };
        contrast: number;
        isPass: boolean;
        isAnchor: boolean;
        isOriginal?: boolean;
    }[];
    action?: 'create' | 'update';
    paletteId?: string;
    createFrame?: boolean;
}

export interface DetectedPalette {
    hueName: string;
    previewHex: string;
    stops: {
        stop: number;
        hex: string;
        variableId: string;
    }[];
}
