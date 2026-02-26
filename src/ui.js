// @ts-nocheck
import { Core } from './core.js';

const SHARED_DEFAULTS = {
    use_preset: false,
    api_url: '',
    api_key: '',
    model_name: '',
    max_tokens: 2048,
    temperature: 0.7,
    stream: false,
};

export const UI = {
    getSharedAPI() {
        const s = Core.getSettings();
        if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
        const sh = s._shared;
        return {
            use_preset: sh.use_preset,
            url: sh.api_url,
            key: sh.api_key,
            model: sh.model_name,
            max_tokens: sh.max_tokens,
            temperature: sh.temperature,
            stream: sh.stream,
        };
    },

    render(modules) {
        const s = Core.getSettings();
        if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
        const sh = s._shared;

        let modulePanels = '';
        for (const m of modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            modulePanels += `<details style="border:1px dashed var(--SmartThemeBorderColor);border-radius:10px;padding:0.5rem 0.7rem;">
                <summary style="cursor:pointer;font-weight:600;">${m.name}</summary>
                <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">
                    ${m.renderUI(ms)}
                </div>
            </details>`;
        }

        const html = `<div class="inline-drawer" id="smart-toolkit-settings">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🧰 Smart Toolkit</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content" style="flex-direction:column;gap:0.75rem;padding-top:0.5rem;">
                <details style="border:1px dashed var(--SmartThemeBorderColor);border-radius:10px;padding:0.5rem 0.7rem;">
                    <summary style="cursor:pointer;font-weight:600;">🔌 共享 API 配置</summary>
                    <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">
                        <label class="checkbox_label">
                            <input type="checkbox" id="stk_use_preset" ${sh.use_preset ? 'checked' : ''} />
                            <span>使用当前预设</span>
                        </label>
                        <div id="stk_custom_api" style="display:${sh.use_preset ? 'none' : 'flex'};flex-direction:column;gap:0.4rem;">
                            <label>API 地址<input type="text" id="stk_api_url" class="text_pole" value="${sh.api_url || ''}" placeholder="http://localhost:1234/v1" /></label>
                            <label>API 密钥<input type="password" id="stk_api_key" class="text_pole" value="${sh.api_key || ''}" /></label>
                            <label>模型名称<input type="text" id="stk_model_name" class="text_pole" value="${sh.model_name || ''}" /></label>
                            <label>最大 token<input type="number" id="stk_max_tokens" class="text_pole" value="${sh.max_tokens}" min="256" max="8192" step="256" /></label>
                            <label>温度<input type="number" id="stk_temperature" class="text_pole" value="${sh.temperature}" min="0" max="2" step="0.1" /></label>
                            <label class="checkbox_label"><input type="checkbox" id="stk_stream" ${sh.stream ? 'checked' : ''} /><span>流式传输</span></label>
                        </div>
                    </div>
                </details>
                ${modulePanels}
            </div>
        </div>`;

        $('#extensions_settings2').append(html);

        // 共享 API 事件绑定
        const save = () => Core.saveSettings();
        $('#stk_use_preset').on('change', function () { sh.use_preset = this.checked; $('#stk_custom_api').toggle(!this.checked); save(); });
        $('#stk_api_url').on('input', function () { sh.api_url = this.value; save(); });
        $('#stk_api_key').on('input', function () { sh.api_key = this.value; save(); });
        $('#stk_model_name').on('input', function () { sh.model_name = this.value; save(); });
        $('#stk_max_tokens').on('input', function () { sh.max_tokens = Number(this.value); save(); });
        $('#stk_temperature').on('input', function () { sh.temperature = Number(this.value); save(); });
        $('#stk_stream').on('change', function () { sh.stream = this.checked; save(); });

        // 各模块 bindUI
        for (const m of modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            m.bindUI(ms, save);
        }
    },
};
