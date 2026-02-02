import type { PaletteConfig, SwatchResult } from '../tokens/types';
import { generateSwatches as generateLegacy } from './colorLogic';
import { generatePerceptualV2 } from './perceptual_v2';

export type AlgorithmFn = (config: PaletteConfig) => SwatchResult[];

export interface AlgorithmDefinition {
    id: string;
    name: string;
    description: string;
    fn: AlgorithmFn;
}

const registry: Record<string, AlgorithmDefinition> = {
    legacy: {
        id: 'legacy',
        name: 'Legacy (WCAG 2.1)',
        description: 'Uses standard WCAG 2.1 contrast ratios for stepping.',
        fn: generateLegacy
    },
    perceptual_v2: {
        id: 'perceptual_v2',
        name: 'Perceptual V2 (Uniform Contrast)',
        description: 'Ensures equal perceptual steps between every stop.',
        fn: generatePerceptualV2
    }
};

export const AlgorithmManager = {
    register: (def: AlgorithmDefinition) => {
        registry[def.id] = def;
    },
    get: (id: string) => registry[id],
    getAll: () => Object.values(registry),
    run: (id: string, config: PaletteConfig): SwatchResult[] => {
        const alg = registry[id];
        if (!alg) throw new Error(`Algorithm ${id} not found`);
        return alg.fn(config);
    }
};
