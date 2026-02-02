
import figmaLogoLight from '../assets/figma-logo-light.svg';
import figmaLogoDark from '../assets/figma-logo-dark.svg';

export interface ButtonProps {
    id?: string;
    text?: string;
    icon?: string; // Lucide icon name or SVG string
    variant: 'primary' | 'secondary' | 'ghost';
    className?: string;
    title?: string;
    onClick?: () => void;
    disabled?: boolean;
}

export function createButton(props: ButtonProps): HTMLButtonElement {
    const { id, text, icon, variant, className = '', title, onClick, disabled } = props;

    const btn = document.createElement('button');
    if (id) btn.id = id;
    if (title) btn.title = title;

    // Base class matching the naming convention in ui.css
    const variantClass = variant === 'primary' ? 'btn--primary-pill' :
        variant === 'secondary' ? 'btn--secondary-pill' :
            'btn--ghost-circle'; // Transparent/Ghost circle for Reset

    btn.className = `btn ${variantClass} ${className} ${disabled ? 'disabled' : ''}`;
    if (disabled) btn.disabled = true;

    let content = '';

    // Special case for Figma Logo in secondary button
    if (icon === 'figma-logo') {
        content += `
            <img src="${figmaLogoLight}" class="figma-img figma-logo-light" alt="Figma">
            <img src="${figmaLogoDark}" class="figma-img figma-logo-dark" alt="Figma">
        `;
    } else if (icon) {
        // Assume Lucide icon if not SVG
        if (icon.startsWith('<svg')) {
            content += icon;
        } else {
            content += `<i data-lucide="${icon}" class="btn-icon"></i>`;
        }
    }

    if (text) {
        content += `<span class="btn-text">${text}</span>`;
    }

    btn.innerHTML = content;

    if (onClick) {
        btn.onclick = onClick;
    }

    return btn;
}
