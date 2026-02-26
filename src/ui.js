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

const CSS = `
<style>
#stk-panel{position:fixed;top:0;right:-420px;width:400px;height:100vh;background:var(--SmartThemeBlurTintColor,#1a1a2e);border-left:1px solid var(--SmartThemeBorderColor);z-index:31000;transition:right .3s ease;display:flex;flex-direction:column;overflow:hidden;box-shadow:-4px 0 20px rgba(0,0,0,.3)}
#stk-panel.open{right:0}
#stk-panel-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--SmartThemeBorderColor);background:rgba(0,0,0,.15);flex-shrink:0}
#stk-panel-header h3{margin:0;font-size:14px;display:flex;align-items:center;gap:6px}
#stk-panel-body{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
#stk-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.3);z-index:30999;display:none}
#stk-overlay.open{display:block}
.stk-section{border:1px solid var(--SmartThemeBorderColor);border-radius:8px;overflow:hidden}
.stk-section-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;background:rgba(255,255,255,.03);user-select:none;font-weight:600;font-size:13px}
.stk-section-header:hover{background:rgba(255,255,255,.06)}
.stk-section-header .stk-arrow{transition:transform .2s;font-size:11px}
.stk-section-header.collapsed .stk-arrow{transform:rotate(-90deg)}
.stk-arrow.collapsed{transform:rotate(-90deg)}
.stk-section-body{padding:8px 12px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--SmartThemeBorderColor)}
.stk-section-body.hidden{display:none}
.stk-row{display:flex;align-items:center;gap:8px}
.stk-row label{font-size:12px;flex:1;display:flex;flex-direction:column;gap:2px}
.stk-row label>span{font-size:11px;opacity:.7}
.stk-row .text_pole{font-size:12px;padding:4px 8px}
.stk-row select.text_pole{padding:3px 6px}
.stk-row textarea.text_pole{font-family:monospace;font-size:11px;resize:vertical}
.stk-toggle{display:flex;align-items:center;gap:6px;font-size:12px}
.stk-toggle input[type=checkbox]{margin:0}
.stk-module-header{display:flex;align-items:center;gap:8px;flex:1}
.stk-module-controls{display:flex;align-items:center;gap:10px;font-size:12px}
.stk-btn{padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;text-align:center;border:1px solid var(--SmartThemeBorderColor);background:rgba(255,255,255,.05)}
.stk-btn:hover{background:rgba(255,255,255,.12)}
.stk-sub-section{border:1px dashed var(--SmartThemeBorderColor);border-radius:6px;overflow:hidden;margin-top:2px}
.stk-sub-header{padding:6px 10px;cursor:pointer;font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.02)}
.stk-sub-header:hover{background:rgba(255,255,255,.05)}
.stk-sub-body{padding:6px 10px;display:flex;flex-direction:column;gap:5px;border-top:1px solid rgba(255,255,255,.05)}
.stk-sub-body.hidden{display:none}
#stk-top-btn{cursor:pointer;opacity:.7;transition:opacity .2s}
#stk-top-btn:hover{opacity:1}
#stk-plot-options{position:fixed;bottom:80px;right:20px;width:340px;background:var(--SmartThemeBlurTintColor,#1a1a2e);border:1px solid var(--SmartThemeBorderColor);border-radius:12px;z-index:31001;box-shadow:0 8px 32px rgba(0,0,0,.4);overflow:hidden}
.stk-po-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--SmartThemeBorderColor);background:rgba(255,255,255,.03);cursor:move;user-select:none}
#stk-po-close{cursor:pointer;padding:4px;opacity:.7}
#stk-po-close:hover{opacity:1}
.stk-po-item{padding:10px 14px;cursor:pointer;font-size:12px;border-bottom:1px solid rgba(255,255,255,.05);transition:background .15s}
.stk-po-item:hover{background:rgba(255,255,255,.08)}
.stk-po-item:last-child{border-bottom:none}
</style>`;

export const UI = {
    getSharedAPI() {
        const s = Core.getSettings();
        if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
        const sh = s._shared;
        return {
            use_preset: sh.use_preset, url: sh.api_url, key: sh.api_key,
            model: sh.model_name, max_tokens: sh.max_tokens,
            temperature: sh.temperature, stream: sh.stream,
        };
    },

    render(modules) {
        const s = Core.getSettings();
        if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
        const sh = s._shared;

        // 注入CSS
        $('head').append(CSS);

        // 顶栏按钮
        const topBtn = $('<div id="stk-top-btn" class="fa-solid fa-toolbox interactable" title="Smart Toolkit" tabindex="0"></div>');
        $('#top-settings-holder').append(topBtn);

        // 模块总览（启用/更新方式）
        let moduleOverviewHtml = '';
        for (const m of modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            moduleOverviewHtml += `
            <div class="stk-row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">
                <div class="stk-toggle">
                    <input type="checkbox" id="stk_mod_${m.id}_enabled" ${ms.enabled ? 'checked' : ''} />
                    <span style="font-weight:500">${m.name}</span>
                </div>
                ${m.defaultSettings.update_mode !== undefined ? `
                <select id="stk_mod_${m.id}_mode" class="text_pole" style="width:auto;font-size:11px;padding:2px 4px;">
                    <option value="inline"${ms.update_mode === 'inline' ? ' selected' : ''}>随AI输出</option>
                    <option value="extra_model"${ms.update_mode === 'extra_model' ? ' selected' : ''}>额外模型</option>
                </select>` : ''}
            </div>`;
        }

        // 模块详细设置面板
        let modulePanelsHtml = '';
        for (const m of modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            modulePanelsHtml += `
            <div class="stk-section" id="stk_module_${m.id}">
                <div class="stk-section-header collapsed">
                    <span>${m.name} 设置</span>
                    <span class="stk-arrow fa-solid fa-chevron-down"></span>
                </div>
                <div class="stk-section-body hidden">
                    ${m.renderUI(ms)}
                </div>
            </div>`;
        }

        // 面板HTML
        const panelHtml = `
        <div id="stk-overlay"></div>
        <div id="stk-panel">
            <div id="stk-panel-header">
                <h3>🧰 Smart Toolkit</h3>
                <div id="stk-panel-close" class="fa-solid fa-xmark interactable" style="cursor:pointer;font-size:16px;padding:4px" title="关闭"></div>
            </div>
            <div id="stk-panel-body">
                <!-- 共享API配置 + 模块总览 -->
                <div class="stk-section">
                    <div class="stk-section-header collapsed">
                        <span>🔌 共享 API 配置</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body hidden">
                        <!-- 模块启用/更新方式 -->
                        <div class="stk-sub-section">
                            <div class="stk-sub-header">
                                <span class="stk-arrow fa-solid fa-chevron-down collapsed" style="font-size:10px"></span>
                                📋 模块管理
                            </div>
                            <div class="stk-sub-body hidden">
                                ${moduleOverviewHtml}
                            </div>
                        </div>
                        <!-- API设置 -->
                        <div class="stk-sub-section">
                            <div class="stk-sub-header">
                                <span class="stk-arrow fa-solid fa-chevron-down collapsed" style="font-size:10px"></span>
                                🔗 API 连接
                            </div>
                            <div class="stk-sub-body hidden">
                                <div class="stk-toggle">
                                    <input type="checkbox" id="stk_use_preset" ${sh.use_preset ? 'checked' : ''} />
                                    <span>使用当前预设</span>
                                </div>
                                <div id="stk_custom_api" style="display:${sh.use_preset ? 'none' : 'flex'};flex-direction:column;gap:6px;">
                                    <div class="stk-row"><label>API 地址<input type="text" id="stk_api_url" class="text_pole" value="${sh.api_url || ''}" placeholder="http://localhost:1234/v1" /></label></div>
                                    <div class="stk-row"><label>API 密钥<input type="password" id="stk_api_key" class="text_pole" value="${sh.api_key || ''}" /></label></div>
                                    <div class="stk-row"><label>模型名称<input type="text" id="stk_model_name" class="text_pole" value="${sh.model_name || ''}" /></label></div>
                                    <div class="stk-row" style="gap:12px">
                                        <label>最大token<input type="number" id="stk_max_tokens" class="text_pole" value="${sh.max_tokens}" min="256" max="8192" step="256" /></label>
                                        <label>温度<input type="number" id="stk_temperature" class="text_pole" value="${sh.temperature}" min="0" max="2" step="0.1" /></label>
                                    </div>
                                    <div class="stk-toggle">
                                        <input type="checkbox" id="stk_stream" ${sh.stream ? 'checked' : ''} />
                                        <span>流式传输</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 模板提示词 -->
                <div class="stk-section">
                    <div class="stk-section-header collapsed">
                        <span>📝 模板提示词（世界书）</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body hidden" id="stk_prompts_body">
                        <div style="font-size:11px;opacity:.6;margin-bottom:4px;">提示词存储在世界书「${Core.WORLD_BOOK}」中，修改后自动同步。</div>
                        ${modules.map(m => {
                            if (!m.templatePrompts) return '';
                            return Object.entries(m.templatePrompts).map(([key, def]) => `
                                <div class="stk-sub-section">
                                    <div class="stk-sub-header">
                                        <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                                        ${m.name} - ${key}
                                    </div>
                                    <div class="stk-sub-body hidden">
                                        <textarea id="stk_prompt_${key}" class="text_pole" rows="8" style="font-family:monospace;font-size:11px;white-space:pre;resize:vertical">${_.escape(def)}</textarea>
                                        <div class="stk-btn stk_prompt_save" data-key="${key}" style="align-self:flex-end">💾 保存到世界书</div>
                                    </div>
                                </div>
                            `).join('');
                        }).join('')}
                    </div>
                </div>

                <!-- 各模块详细设置 -->
                ${modulePanelsHtml}
            </div>
        </div>`;

        $('body').append(panelHtml);

        // ===== 事件绑定 =====
        const togglePanel = () => { $('#stk-panel, #stk-overlay').toggleClass('open'); };
        topBtn.on('click', togglePanel);
        $('#stk-panel-close, #stk-overlay').on('click', togglePanel);

        // 折叠/展开
        $(document).on('click', '.stk-section-header', function () {
            $(this).toggleClass('collapsed').next('.stk-section-body').toggleClass('hidden');
        });
        $(document).on('click', '.stk-sub-header', function () {
            $(this).find('.stk-arrow').toggleClass('collapsed');
            $(this).next('.stk-sub-body').toggleClass('hidden');
        });

        // 共享API事件
        const save = () => Core.saveSettings();
        $('#stk_use_preset').on('change', function () { sh.use_preset = this.checked; $('#stk_custom_api').toggle(!this.checked); save(); });
        $('#stk_api_url').on('input', function () { sh.api_url = this.value; save(); });
        $('#stk_api_key').on('input', function () { sh.api_key = this.value; save(); });
        $('#stk_model_name').on('input', function () { sh.model_name = this.value; save(); });
        $('#stk_max_tokens').on('input', function () { sh.max_tokens = Number(this.value); save(); });
        $('#stk_temperature').on('input', function () { sh.temperature = Number(this.value); save(); });
        $('#stk_stream').on('change', function () { sh.stream = this.checked; save(); });

        // 模块总览事件（启用/更新方式）
        for (const m of modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            $(`#stk_mod_${m.id}_enabled`).on('change', function () { ms.enabled = this.checked; save(); });
            if (m.defaultSettings.update_mode !== undefined) {
                $(`#stk_mod_${m.id}_mode`).on('change', function () { ms.update_mode = this.value; save(); });
            }
        }

        // 模板提示词保存
        $('.stk_prompt_save').on('click', async function () {
            const key = $(this).data('key');
            const content = $(`#stk_prompt_${key}`).val();
            await Core.setWorldBookEntry(key, content);
            toastr.success(`已保存到世界书`, key);
        });

        // 各模块bindUI
        for (const m of modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            m.bindUI(ms, save);
        }
    },
};
