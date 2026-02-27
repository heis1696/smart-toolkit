import { DraggableWindow } from './DraggableWindow.js';
import { Core } from '../core.js';
import { apiPresetManager } from '../managers/index.js';

const SHARED_DEFAULTS = {
    use_preset: false,
    api_url: '',
    api_key: '',
    model_name: '',
    max_tokens: 2048,
    temperature: 0.7,
    stream: false,
};

export class SidebarWindow {
    _modules = null;
    _window = null;
    _$content = null;

    constructor(modules) {
        this._modules = modules;
    }

    show() {
        if (this._window) {
            this._window.bringToFront();
            return;
        }

        this._window = new DraggableWindow({
            id: 'stk-sidebar-window',
            title: '🧰 Smart Toolkit',
            content: this._renderContent(),
            width: 480,
            height: 650,
            anchor: 'top-right',
            offset: { x: 20, y: 50 },
            persistState: true,
            showClose: true,
            showMinimize: true,
            resizable: true,
            className: 'stk-sidebar-window',
            onClose: () => { this._window = null; }
        });

        this._window.show();
        this._bindEvents();
    }

    _renderContent() {
        const s = Core.getSettings();
        if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
        const sh = s._shared;

        let moduleOverviewHtml = '';
        for (const m of this._modules) {
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

        let modulePanelsHtml = '';
        for (const m of this._modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            modulePanelsHtml += `
            <div class="stk-section" id="stk_module_${m.id}">
                <div class="stk-section-header interactable collapsed" tabindex="0">
                    <span>${m.name} 设置</span>
                    <span class="stk-arrow fa-solid fa-chevron-down"></span>
                </div>
                <div class="stk-section-body stk-hidden">
                    ${m.renderUI(ms)}
                </div>
            </div>`;
        }

        return `
            <div class="stk-sidebar-body" style="padding:10px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;height:100%;">
                <div class="stk-section">
                    <div class="stk-section-header interactable collapsed" tabindex="0">
                        <span>🔌 共享 API 配置</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body stk-hidden">
                        <div class="stk-sub-section">
                            <div class="stk-sub-header interactable" tabindex="0">
                                <span class="stk-arrow fa-solid fa-chevron-down collapsed" style="font-size:10px"></span>
                                📋 模块管理
                            </div>
                            <div class="stk-sub-body stk-hidden">
                                ${moduleOverviewHtml}
                            </div>
                        </div>
                        <div class="stk-sub-section">
                            <div class="stk-sub-header interactable" tabindex="0">
                                <span class="stk-arrow fa-solid fa-chevron-down collapsed" style="font-size:10px"></span>
                                🔗 API 连接
                            </div>
                            <div class="stk-sub-body stk-hidden">
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
                                    <div class="stk-row" style="gap:8px;margin-top:4px">
                                        <div class="stk-btn" id="stk_test_connection">测试连接</div>
                                        <div class="stk-btn" id="stk_fetch_models">获取模型</div>
                                    </div>
                                    <div class="stk-row">
                                        <label>模型选择
                                            <select id="stk_model_select" class="text_pole">
                                                <option value="">-- 手动输入或获取模型列表 --</option>
                                            </select>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="stk-section">
                    <div class="stk-section-header interactable collapsed" tabindex="0">
                        <span>📝 模板提示词（世界书）</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body stk-hidden" id="stk_prompts_body">
                        <div style="font-size:11px;opacity:.6;margin-bottom:4px;">提示词存储在世界书「${Core.WORLD_BOOK}」中，修改后自动同步。</div>
                        ${this._modules.map(m => {
                            if (!m.templatePrompts) return '';
                            return Object.entries(m.templatePrompts).map(([key, def]) => `
                                <div class="stk-sub-section">
                                    <div class="stk-sub-header interactable" tabindex="0">
                                        <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                                        ${m.name} - ${key}
                                    </div>
                                    <div class="stk-sub-body stk-hidden">
                                        <textarea id="stk_prompt_${key}" class="text_pole" rows="8" style="font-family:monospace;font-size:11px;white-space:pre;resize:vertical">${_.escape(def)}</textarea>
                                        <div class="stk-row" style="justify-content:flex-end;gap:8px;margin-top:6px">
                                            <div class="stk-btn stk_prompt_reset" data-key="${key}" data-default="${_.escape(def)}">重置默认</div>
                                            <div class="stk-btn stk_prompt_save" data-key="${key}">保存</div>
                                        </div>
                                    </div>
                                </div>
                            `).join('');
                        }).join('')}
                    </div>
                </div>

                ${modulePanelsHtml}
            </div>
        `;
    }

    _bindEvents() {
        const $el = this._window.$el;
        const s = Core.getSettings();
        const sh = s._shared;
        const save = () => Core.saveSettings();

        $el.on('click', '.stk-section-header', function (e) {
            e.stopPropagation();
            $(this).toggleClass('collapsed').next('.stk-section-body').toggleClass('stk-hidden');
        });

        $el.on('click', '.stk-sub-header', function (e) {
            e.stopPropagation();
            $(this).find('.stk-arrow').toggleClass('collapsed');
            $(this).next('.stk-sub-body').toggleClass('stk-hidden');
        });

        $el.find('#stk_use_preset').on('change', function () {
            sh.use_preset = this.checked;
            $el.find('#stk_custom_api').toggle(!this.checked);
            save();
        });
        $el.find('#stk_api_url').on('input', function () { sh.api_url = this.value; save(); });
        $el.find('#stk_api_key').on('input', function () { sh.api_key = this.value; save(); });
        $el.find('#stk_model_name').on('input', function () { sh.model_name = this.value; save(); });
        $el.find('#stk_max_tokens').on('input', function () { sh.max_tokens = Number(this.value); save(); });
        $el.find('#stk_temperature').on('input', function () { sh.temperature = Number(this.value); save(); });
        $el.find('#stk_stream').on('change', function () { sh.stream = this.checked; save(); });

        $el.find('#stk_test_connection').on('click', async function () {
            const $btn = $(this).text('测试中...').prop('disabled', true);
            try {
                const result = await apiPresetManager.testConnectionFromConfig({
                    baseUrl: sh.api_url,
                    apiKey: sh.api_key,
                    model: sh.model_name
                });
                if (result.success) {
                    toastr.success('API 连接成功', '测试结果');
                } else {
                    toastr.error(result.error || '连接失败', '测试结果');
                }
            } catch (e) {
                toastr.error(e.message, '测试失败');
            } finally {
                $btn.text('测试连接').prop('disabled', false);
            }
        });

        $el.find('#stk_fetch_models').on('click', async function () {
            const $btn = $(this).text('获取中...').prop('disabled', true);
            try {
                const models = await apiPresetManager.fetchModelsFromConfig({
                    baseUrl: sh.api_url,
                    apiKey: sh.api_key
                });
                if (models && models.length > 0) {
                    const $select = $el.find('#stk_model_select').empty().append('<option value="">-- 选择模型 --</option>');
                    models.forEach(m => {
                        const id = typeof m === 'string' ? m : m.id;
                        $select.append(`<option value="${id}">${id}</option>`);
                    });
                    if (sh.model_name) {
                        $select.val(sh.model_name);
                    }
                    toastr.success(`获取到 ${models.length} 个模型`, '成功');
                } else {
                    toastr.warning('未获取到模型列表', '结果');
                }
            } catch (e) {
                toastr.error(e.message, '获取失败');
            } finally {
                $btn.text('获取模型').prop('disabled', false);
            }
        });

        $el.find('#stk_model_select').on('change', function () {
            if (this.value) {
                sh.model_name = this.value;
                $el.find('#stk_model_name').val(this.value);
                save();
            }
        });

        for (const m of this._modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            $el.find(`#stk_mod_${m.id}_enabled`).on('change', function () { ms.enabled = this.checked; save(); });
            if (m.defaultSettings.update_mode !== undefined) {
                $el.find(`#stk_mod_${m.id}_mode`).on('change', function () { ms.update_mode = this.value; save(); });
            }
        }

        $el.find('.stk_prompt_reset').on('click', async function () {
            const key = $(this).data('key');
            const defaultPrompt = $(this).data('default');
            $el.find(`#stk_prompt_${key}`).val(defaultPrompt);
            await Core.setWorldBookEntry(key, defaultPrompt);
            toastr.success('已重置为默认', key);
        });

        $el.find('.stk_prompt_save').on('click', async function () {
            const key = $(this).data('key');
            const content = $el.find(`#stk_prompt_${key}`).val();
            await Core.setWorldBookEntry(key, content);
            toastr.success(`已保存到世界书`, key);
        });

        for (const m of this._modules) {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            m.bindUI(ms, save);
        }
    }

    close() {
        if (this._window) {
            this._window.close();
            this._window = null;
        }
    }
}
