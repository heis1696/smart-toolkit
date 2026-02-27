import { DraggableWindow } from './DraggableWindow.js';
import { Core } from '../core.js';

class OptionsBarWindow {
    static _instance = null;
    _window = null;
    _modules = [];

    static getInstance() {
        if (!OptionsBarWindow._instance) {
            OptionsBarWindow._instance = new OptionsBarWindow();
        }
        return OptionsBarWindow._instance;
    }

    setModules(modules) {
        this._modules = modules;
    }

    show() {
        if (this._window) {
            this._window.bringToFront();
            return;
        }

        this._window = new DraggableWindow({
            id: 'stk-options-bar',
            title: '⚙️ 快捷选项',
            content: this._renderContent(),
            width: 280,
            height: 'auto',
            anchor: 'bottom-right',
            offset: { x: 20, y: 150 },
            persistState: true,
            showClose: true,
            showMinimize: false,
            className: 'stk-options-bar-window',
            onClose: () => { this._window = null; }
        });

        this._window.show();
        this._bindEvents();
    }

    _renderContent() {
        let html = '<div class="stk-options-content" style="padding:8px;">';
        for (const m of this._modules) {
            const s = Core.getModuleSettings(m.id, m.defaultSettings);
            html += `
                <div class="stk-options-item" style="padding:6px 0;border-bottom:1px solid var(--SmartThemeBorderColor)">
                    <div class="stk-toggle" style="display:flex;align-items:center;gap:6px">
                        <input type="checkbox" id="stk_opt_${m.id}_enabled" ${s.enabled ? 'checked' : ''} />
                        <span style="font-size:12px">${m.name}</span>
                    </div>
                </div>`;
        }
        html += '</div>';
        return html;
    }

    _bindEvents() {
        for (const m of this._modules) {
            const s = Core.getModuleSettings(m.id, m.defaultSettings);
            this._window.$body.find(`#stk_opt_${m.id}_enabled`).on('change', function () {
                s.enabled = this.checked;
                Core.saveSettings();
            });
        }
    }

    close() {
        if (this._window) {
            this._window.close();
            this._window = null;
        }
    }
}

export { OptionsBarWindow };
export const optionsBarWindow = OptionsBarWindow.getInstance();
