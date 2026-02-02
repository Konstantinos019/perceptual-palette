import { type SwatchResult } from '../../lib/tokens/types';

export interface PaletteRowProps {
    swatch: SwatchResult;
    isPerceptual: boolean;
    isNew: boolean;
    theme: 'light' | 'dark';
    onDelete?: (stop: number) => void;
    onClick?: (swatch: SwatchResult) => void;
}

export function createPaletteRow(props: PaletteRowProps): HTMLElement {
    const { swatch, isPerceptual, isNew, onDelete, onClick } = props;
    const hex = swatch.hex || '#000000';

    // Status Icon Helper
    const getStatusIcon = (passed: boolean) => passed ?
        `<span class="status-icon check"><i data-lucide="check-circle" class="icon-svg" style="width: 14px; height: 14px;"></i></span>` :
        `<span class="status-icon warning"><i data-lucide="alert-circle" class="icon-svg" style="width: 14px; height: 14px;"></i></span>`;

    const row = document.createElement('div');
    row.className = `list-row ${swatch.isAnchor ? 'is-anchor' : ''} ${isNew ? 'new-row' : ''}`;

    // Calculate passing based on contrast
    // Note: contrast is already pre-calculated in getSwatches and stored in swatch.contrastWithNext (renamed to currentContrast in state usage?)
    // Actually, in ui.ts it calculates it on the fly. We'll simplify and pass it in or calculate here.
    const isPass = swatch.contrastWithNext >= 4.5;

    const labelId = swatch.isAnchor ? `${swatch.stop} (Seed)` : swatch.stop.toString();
    const rowVal = isPerceptual ? (swatch.lch?.l.toFixed(2) || '0.00') : swatch.contrastWithNext.toFixed(2);

    row.innerHTML = `
        <div class="list-row__cell">
            ${rowVal} 
            ${getStatusIcon(isPass || swatch.isAnchor)}
        </div>
        <div class="list-row__cell cell-name">
            <span class="stop-number">${labelId}</span>
        </div>
        <div class="list-row__cell cell-color">
            <div class="color-pill" style="background-color: ${hex};"></div>
            ${onDelete ? `<span class="delete-stop-btn" title="Remove stop"><i data-lucide="trash-2" class="icon-svg" style="width: 14px; height: 14px;"></i></span>` : ''}
        </div>
    `;

    if (onDelete) {
        const delBtn = row.querySelector('.delete-stop-btn') as HTMLElement;
        if (delBtn) {
            delBtn.onclick = (e) => {
                e.stopPropagation();
                row.classList.add('removing');
                setTimeout(() => onDelete(swatch.stop), 250);
            };
        }
    }

    if (onClick) {
        row.onclick = () => onClick(swatch);
    }

    return row;
}
