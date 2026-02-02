import { type SwatchResult, type Override } from '../../lib/tokens/types';

export interface RefineModalProps {
  swatch: SwatchResult;
  override: Override;
  activeMode: 'hsl' | 'hsb' | 'rgb';
  onClose: () => void;
  onReset: () => void;
  onSave: () => void;
  onModeSwitch: (mode: 'hsl' | 'hsb' | 'rgb') => void;
  onSliderInput: (key: string, value: number) => void;
}

export function createRefineModal(props: RefineModalProps): HTMLElement {
  const { swatch, onClose, onReset, onSave } = props;

  const modal = document.createElement('div');
  modal.id = 'refine-modal';
  modal.className = 'modal-overlay hidden';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.zIndex = '100';
  modal.style.display = 'none'; // Controlled by ui.ts
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';

  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <span id="modal-stop-title" class="modal-title">Refine stop ${swatch.stop}</span>
        <button id="close-modal" class="modal-close-btn"><i data-lucide="x" class="icon-svg"></i></button>
      </div>

      <div class="control-section" style="overflow-y: auto; flex: 1;">
        <div style="padding: 24px; border-bottom: 1px solid #ececec; position: relative;">
          <div class="comparison-preview" style="display: flex; height: 128px;">
            <div id="preview-before">
              <span id="hex-before-label">#000000</span>
              <span class="swatch-sublabel">Original</span>
            </div>
            <div id="preview-after">
              <span id="hex-after-label">#000000</span>
              <span class="swatch-sublabel">Refining</span>
            </div>
          </div>
          <div class="contrast-badge" id="modal-contrast-badge" style="display: none;">
            <span id="modal-contrast-value">1.00</span>
            <i data-lucide="alert-circle" class="warning-icon icon-svg" style="width: 16px; height: 16px;"></i>
          </div>
        </div>

        <div style="padding: 16px 24px 0 24px;">
           <!-- Segment Controller placeholder -->
           <div id="modal-mode-tabs-container"></div>
        </div>

        <div id="hsl-controls" class="mode-content">
          <div class="modal-row">
            <div class="modal-row-label">
              <span class="label-text">Hue</span>
              <div id="hsl-h-val" class="value-pill">0°</div>
            </div>
            <input type="range" id="hsl-h-slider" class="rainbow-slider refiner-slider" min="0" max="360" step="1" style="width: 100%;">
          </div>
          <div class="modal-row">
            <div class="modal-row-label">
              <span class="label-text">Saturation</span>
              <div id="hsl-s-val" class="value-pill">0%</div>
            </div>
            <input type="range" id="hsl-s-slider" class="refiner-slider" min="0" max="100" step="1" style="width: 100%;">
          </div>
          <div class="modal-row" style="border-bottom: none;">
            <div class="modal-row-label">
              <span class="label-text">Lightness</span>
              <div id="hsl-l-val" class="value-pill">0%</div>
            </div>
            <input type="range" id="hsl-l-slider" class="refiner-slider" min="0" max="100" step="1" style="width: 100%;">
          </div>
        </div>

        <div id="hsb-controls" class="mode-content">
          <div class="modal-row">
            <div class="modal-row-label">
              <span class="label-text">Hue</span>
              <div id="hsb-h-val" class="value-pill">0°</div>
            </div>
            <input type="range" id="hsb-h-slider" class="rainbow-slider refiner-slider" min="0" max="360" step="1" style="width: 100%;">
          </div>
          <div class="modal-row">
            <div class="modal-row-label">
              <span class="label-text">Saturation</span>
              <div id="hsb-s-val" class="value-pill">0%</div>
            </div>
            <input type="range" id="hsb-s-slider" class="refiner-slider" min="0" max="100" step="1" style="width: 100%;">
          </div>
          <div class="modal-row" style="border-bottom: none;">
            <div class="modal-row-label">
              <span class="label-text">Brightness</span>
              <div id="hsb-b-val" class="value-pill">0%</div>
            </div>
            <input type="range" id="hsb-b-slider" class="refiner-slider" min="0" max="100" step="1" style="width: 100%;">
          </div>
        </div>

        <div id="rgb-controls" class="mode-content">
          <div class="modal-row">
            <div class="modal-row-label">
              <span class="label-text">Red</span>
              <div id="rgb-r-val" class="value-pill">0</div>
            </div>
            <input type="range" id="rgb-r-slider" class="refiner-slider" min="0" max="255" step="1" style="width: 100%;">
          </div>
          <div class="modal-row">
            <div class="modal-row-label">
              <span class="label-text">Green</span>
              <div id="rgb-g-val" class="value-pill">0</div>
            </div>
            <input type="range" id="rgb-g-slider" class="refiner-slider" min="0" max="255" step="1" style="width: 100%;">
          </div>
          <div class="modal-row" style="border-bottom: none;">
            <div class="modal-row-label">
              <span class="label-text">Blue</span>
              <div id="rgb-b-val" class="value-pill">0</div>
            </div>
            <input type="range" id="rgb-b-slider" class="refiner-slider" min="0" max="255" step="1" style="width: 100%;">
          </div>
        </div>

        <div class="modal-footer">
          <button id="reset-override" class="btn-pill btn-pill-secondary">
            <i data-lucide="refresh-cw" class="icon-svg" style="margin-right: 4px;"></i>
            Reset
          </button>
          <button id="save-modal-btn" class="btn-pill btn-pill-primary">
            <i data-lucide="save" class="icon-svg" style="margin-right: 4px;"></i>
            Save changes
          </button>
        </div>
      </div>
    </div>
    `;

  // Re-attach listeners using IDs
  const closeBtn = modal.querySelector('#close-modal') as HTMLElement;
  if (closeBtn) closeBtn.onclick = onClose;

  const resetBtn = modal.querySelector('#reset-override') as HTMLElement;
  if (resetBtn) resetBtn.onclick = onReset;

  const saveBtn = modal.querySelector('#save-modal-btn') as HTMLElement;
  if (saveBtn) saveBtn.onclick = onSave;

  return modal;
}
