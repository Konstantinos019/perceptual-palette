import { type DetectedPalette } from '../../lib/tokens/types';

export interface PaletteSelectorProps {
    palettes: DetectedPalette[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onCancel: () => void;
}

export function createPaletteSelector(props: PaletteSelectorProps): HTMLElement {
    const { palettes, selectedId, onSelect, onAdd, onCancel } = props;
    const isCreating = selectedId === null;

    // Outer container matches .color-tool row
    const container = document.createElement('div');
    container.className = `color-tool palette-selector-row ${isCreating ? 'palette-selector--creating' : ''}`;
    container.id = 'palette-sidebar'; // Keep ID for replacement in ui.ts

    // Label on the left - dynamic based on state
    const header = document.createElement('div');
    header.className = 'color-tool__header';
    header.innerHTML = `<span class="color-tool__label">${isCreating ? 'Creating new palette' : 'Color palettes'}</span>`;
    container.appendChild(header);

    // Body on the right
    const body = document.createElement('div');
    body.className = 'color-tool__body';

    if (isCreating) {
        // Show Cancel/Back button instead of pills
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-cancel-creation';
        cancelBtn.textContent = 'Go back';
        cancelBtn.onclick = onCancel;
        body.appendChild(cancelBtn);
    } else {
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
    }

    container.appendChild(body);

    return container;
}
