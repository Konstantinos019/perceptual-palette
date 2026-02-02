export interface SegmentControllerProps {
    id?: string;
    options: { id: string; label: string }[];
    activeId: string;
    onChange: (id: string) => void;
}

export function createSegmentController(props: SegmentControllerProps): HTMLElement {
    const { id, options, activeId, onChange } = props;

    const container = document.createElement('div');
    if (id) container.id = id;
    container.className = 'mode-tabs';

    // Create thumb
    const thumb = document.createElement('div');
    thumb.className = 'mode-thumb';
    const activeIndex = options.findIndex(opt => opt.id === activeId);
    const widthPct = 100 / options.length;
    thumb.style.width = `calc(${widthPct}% - 4px)`;
    thumb.style.transform = `translateX(${activeIndex * 100}%)`;
    container.appendChild(thumb);

    options.forEach((opt, index) => {
        const tab = document.createElement('button');
        tab.className = `mode-tab ${opt.id === activeId ? 'active' : ''}`;
        tab.textContent = opt.label;
        tab.onclick = () => {
            // Update UI immediately (optimistic)
            container.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            thumb.style.transform = `translateX(${index * 100}%)`;

            onChange(opt.id);
        };
        container.appendChild(tab);
    });

    return container;
}
