import { type DetectedPalette } from '../../lib/tokens/types';

export interface PaletteSelectorProps {
    palettes: DetectedPalette[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
}

export function createPaletteSelector(props: PaletteSelectorProps): HTMLElement {
    const { palettes, selectedId, onSelect, onAdd } = props;

    // Outer container matches .color-tool row
    const container = document.createElement('div');
    container.className = `color-tool palette-selector-row`;
    container.id = 'palette-sidebar'; // Keep ID for replacement in ui.ts

    // Label on the left - Always "Color palettes" per design
    const header = document.createElement('div');
    header.className = 'color-tool__header';
    header.innerHTML = `<span class="color-tool__label">Color palettes</span>`;
    container.appendChild(header);

    // Body on the right
    const body = document.createElement('div');
    body.className = 'color-tool__body';

    const pillsContainer = document.createElement('div');
    pillsContainer.className = 'palette-pills';

    palettes.forEach(palette => {
        const isActive = selectedId === palette.hueName;

        if (isActive) {
            const ring = document.createElement('div');
            ring.className = 'palette-pill-ring palette-pill--active-ring';
            ring.style.borderColor = palette.previewHex;

            const pill = document.createElement('button');
            pill.className = 'palette-pill';
            pill.title = palette.hueName;
            pill.style.backgroundColor = palette.previewHex;
            pill.onclick = () => onSelect(palette.hueName);

            ring.appendChild(pill);
            pillsContainer.appendChild(ring);
        } else {
            const pill = document.createElement('button');
            pill.className = 'palette-pill';
            pill.title = palette.hueName;
            pill.style.backgroundColor = palette.previewHex;
            pill.onclick = () => onSelect(palette.hueName);
            pillsContainer.appendChild(pill);
        }
    });

    body.appendChild(pillsContainer);

    const addBtn = document.createElement('button');
    addBtn.className = 'palette-pill--add';
    addBtn.title = 'Create New Palette';
    addBtn.innerHTML = `+`;
    addBtn.onclick = onAdd;
    body.appendChild(addBtn);

    body.appendChild(pillsContainer);
    // Ensure both are appended correctly
    body.innerHTML = '';
    body.appendChild(pillsContainer);
    body.appendChild(addBtn);

    container.appendChild(body);

    return container;
}
