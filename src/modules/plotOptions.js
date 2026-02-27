import { Core } from '../core.js';
import { UI } from '../ui.js';
import { storage } from '../managers/StorageManager.js';
import { templateManager } from '../managers/TemplateManager.js';
import { DraggableWindow, windowManager } from '../components/index.js';

const XX_REGEX = /<xx>([\s\S]*?)<\/xx>/i;
const XX_FULL_REGEX = /<xx>[\s\S]*?<\/xx>/i;

const DEFAULT_PROMPT = `在正文后给<user>提供四个符合<user>人设的<user>的话和动作，用<xx>标签包裹，必须放在<auxiliary_tool>内。
Format:
<xx>
>选项一：[提供一个谨慎、观察性的行动选项]
>选项二：[提供一个积极、主动以推进任务的行动选项]
>选项三：[提供一个侧重于人际关系或私人互动的行动选项]
>选项四：[提供一个符合当下情景的，带有情色或挑逗意味的NSFW行动选项]
</xx>`;

const ICONS = ['\u{1F50D}', '\u{26A1}', '\u{1F4AC}', '\u{1F525}'];

let _optionsWindow = null;
let _settingsWindow = null;
let _processing = false;

function parseOptions(text) {
    const match = text.match(XX_REGEX);
    if (!match) return null;
    const options = [];
    const re = /^>选项[一二三四]：(.+)$/gm;
    let m;
    while ((m = re.exec(match[1])) !== null) {
        options.push(m[1].trim());
    }
    return options.length ? options : null;
}

function _renderOptionsContent(options) {
    const items = options.map((o, i) =>
        `<div class="stk-po-item" data-idx="${i}">${ICONS[i] || '\u25B6'} ${_.escape(o)}</div>`
    ).join('');

    return `
        <div class="stk-po-options">
            ${items}
        </div>
        <div class="stk-po-actions">
            <button class="stk-po-btn stk-po-cancel">关闭</button>
        </div>
    `;
}

function showOptions(options) {
    if (_optionsWindow) {
        _optionsWindow.close();
        _optionsWindow = null;
    }

    _optionsWindow = new DraggableWindow({
        id: 'stk-plot-options-window',
        title: '\u{1F3AD} 剧情推进',
        content: _renderOptionsContent(options),
        width: 400,
        height: 'auto',
        anchor: 'center',
        persistState: true,
        showClose: true,
        showMinimize: false,
        className: 'stk-plot-options-window',
        onClose: () => {
            _optionsWindow = null;
        }
    });

    _optionsWindow.show();

    _optionsWindow.$body.find('.stk-po-item').on('click', function() {
        const idx = $(this).data('idx');
        const text = options[idx];
        if (!text) return;

        _optionsWindow.close();
        _optionsWindow = null;

        $('#send_textarea').val(text).trigger('input');
        $('#send_but').trigger('click');
    });

    _optionsWindow.$body.find('.stk-po-cancel').on('click', () => {
        _optionsWindow.close();
        _optionsWindow = null;
    });
}

function showSettingsWindow(settings, save) {
    if (_settingsWindow) {
        _settingsWindow.bringToFront();
        return;
    }

    const content = `
        <div class="stk-settings-content">
            <div class="stk-section">
                <div class="stk-section-title">\u2699\uFE0F 请求设置</div>
                <div class="stk-toggle">
                    <input type="checkbox" id="po_auto_new" ${settings.auto_request ? 'checked' : ''} />
                    <span>自动请求</span>
                </div>
                <div class="stk-row">
                    <label>请求方式
                        <select id="po_reqmode_new" class="text_pole">
                            <option value="sequential"${settings.request_mode === 'sequential' ? ' selected' : ''}>依次重试</option>
                            <option value="parallel"${settings.request_mode === 'parallel' ? ' selected' : ''}>同时请求</option>
                            <option value="hybrid"${settings.request_mode === 'hybrid' ? ' selected' : ''}>先一次后并行</option>
                        </select>
                    </label>
                </div>
                <div class="stk-row">
                    <label>重试次数
                        <input type="number" id="po_retries_new" class="text_pole" value="${settings.retry_count}" min="1" max="10" />
                    </label>
                </div>
                <div class="stk-toggle">
                    <input type="checkbox" id="po_notification_new" ${settings.notification ? 'checked' : ''} />
                    <span>显示通知</span>
                </div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u{1F527} 操作</div>
                <div class="stk-btn stk-po-retry-btn" style="text-align:center">\u{1F504} 手动生成/重试</div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u{1F4CB} 模板管理</div>
                <div class="stk-row">
                    <select id="po_template_select" class="text_pole" style="width:100%">
                        <option value="">-- 选择模板 --</option>
                    </select>
                </div>
                <div class="stk-row stk-template-actions">
                    <button class="stk-btn stk-po-save-template" style="flex:1">保存为模板</button>
                    <button class="stk-btn stk-po-export-template" style="flex:1">导出</button>
                </div>
            </div>
        </div>
    `;

    _settingsWindow = new DraggableWindow({
        id: 'stk-plot-options-settings',
        title: '\u{1F3AD} 剧情推进设置',
        content: content,
        width: 380,
        height: 'auto',
        anchor: 'top-right',
        offset: { x: 20, y: 100 },
        persistState: true,
        showClose: true,
        showMinimize: false,
        className: 'stk-settings-window',
        onClose: () => {
            _settingsWindow = null;
        }
    });

    _settingsWindow.show();

    const templates = templateManager.getAllTemplates();
    const $select = _settingsWindow.$body.find('#po_template_select');
    templates.forEach(t => {
        $select.append(`<option value="${t.id}">${t.name}</option>`);
    });

    const activeTemplate = templateManager.getActiveTemplate();
    if (activeTemplate) {
        $select.val(activeTemplate.id);
    }

    _settingsWindow.$body.find('#po_auto_new').on('change', function() {
        settings.auto_request = this.checked;
        save();
    });

    _settingsWindow.$body.find('#po_reqmode_new').on('change', function() {
        settings.request_mode = this.value;
        save();
    });

    _settingsWindow.$body.find('#po_retries_new').on('input', function() {
        settings.retry_count = Number(this.value);
        save();
    });

    _settingsWindow.$body.find('#po_notification_new').on('change', function() {
        settings.notification = this.checked;
        save();
    });

    const self = PlotOptionsModule;
    _settingsWindow.$body.find('.stk-po-retry-btn').on('click', async () => {
        const lastId = Core.getLastMessageId();
        if (lastId < 0) {
            toastr.warning('没有消息', '[PlotOptions]');
            return;
        }
        await self._runExtra(lastId, settings);
    });

    _settingsWindow.$body.find('#po_template_select').on('change', function() {
        const templateId = this.value;
        if (templateId) {
            templateManager.setActiveTemplate(templateId);
        }
    });

    _settingsWindow.$body.find('.stk-po-save-template').on('click', () => {
        self._saveCurrentPromptAsTemplate();
    });

    _settingsWindow.$body.find('.stk-po-export-template').on('click', () => {
        const active = templateManager.getActiveTemplate();
        if (active) {
            const json = templateManager.exportTemplate(active.id);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${active.name}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toastr.success('模板已导出', '[PlotOptions]');
        } else {
            toastr.warning('没有活动模板', '[PlotOptions]');
        }
    });
}

export const PlotOptionsModule = {
    id: 'plot_options',
    name: '\u{1F3AD} 剧情推进',
    defaultSettings: {
        enabled: true,
        update_mode: 'inline',
        auto_request: true,
        retry_count: 3,
        request_mode: 'sequential',
        content_tag: '',
        cleanup_patterns: [
            '<xx>[\\s\\S]*?</xx>',
            '<auxiliary_tool>[\\s\\S]*?</auxiliary_tool>',
        ],
        notification: true,
    },

    templatePrompts: {
        plot_options_prompt: DEFAULT_PROMPT,
    },

    init() {
        this._initDefaultTemplate();
    },

    _initDefaultTemplate() {
        const templates = templateManager.getAllTemplates();
        const hasDefault = templates.some(t => t.metadata.isDefault);
        if (!hasDefault) {
            templateManager.createTemplate({
                id: 'default-plot-options',
                name: '默认剧情推进',
                description: '默认的剧情推进提示词模板',
                data: {
                    prompt: DEFAULT_PROMPT
                },
                metadata: {
                    isDefault: true,
                    module: 'plot_options'
                }
            });
        }
    },

    async onMessage(msgId) {
        const s = Core.getModuleSettings(this.id, this.defaultSettings);
        if (!s.enabled || _processing) return;
        const msg = Core.getChat()[msgId];
        if (!msg || msg.is_user) return;

        _processing = true;
        try {
            const options = parseOptions(msg.mes || '');
            if (options) {
                msg.mes = msg.mes.replace(XX_FULL_REGEX, '').trim();
                SillyTavern.getContext().saveChat();
                showOptions(options);
                return;
            }
            if (s.update_mode === 'extra_model' && s.auto_request) {
                await this._runExtra(msgId, s);
            }
        } finally {
            _processing = false;
        }
    },

    onChatReady() {},

    async _getSystemPrompt() {
        const activeTemplate = templateManager.getActiveTemplate();
        if (activeTemplate && activeTemplate.data.prompt) {
            return activeTemplate.data.prompt;
        }

        const wb = await Core.getWorldBookEntry('plot_options_prompt');
        return wb || DEFAULT_PROMPT;
    },

    async _runExtra(msgId, settings) {
        const msg = Core.getChat()[msgId];
        if (!msg) return;
        if (settings.notification) toastr.info('正在生成剧情选项...', '[PlotOptions]');

        const content = Core.extractContent(msg.mes || '', {
            contentTag: settings.content_tag,
            cleanupPatterns: settings.cleanup_patterns,
        });

        const systemPrompt = await this._getSystemPrompt();
        const api = UI.getSharedAPI();
        const result = await Core.requestExtraModel({
            systemPrompt,
            userMessage: content + '\n\n请根据以上正文生成四个剧情推进选项。',
            api,
            validate: parseOptions,
            retries: settings.retry_count,
            requestMode: settings.request_mode,
            onRetry: (i, max) => {
                if (settings.notification) toastr.info(`重试 ${i}/${max}`, '[PlotOptions]');
            },
        });

        if (result) {
            showOptions(result);
            if (settings.notification) toastr.success('剧情选项已生成', '[PlotOptions]');
        } else {
            if (settings.notification) toastr.error('剧情选项生成失败', '[PlotOptions]');
        }
    },

    async _saveCurrentPromptAsTemplate() {
        const currentPrompt = await this._getSystemPrompt();
        const name = prompt('输入模板名称:', `模板 ${Date.now()}`);
        if (!name) return;

        templateManager.createTemplate({
            name,
            description: '用户创建的剧情推进模板',
            data: {
                prompt: currentPrompt
            },
            metadata: {
                module: 'plot_options'
            }
        });

        toastr.success('模板已保存', '[PlotOptions]');

        if (_settingsWindow) {
            const $select = _settingsWindow.$body.find('#po_template_select');
            $select.empty().append('<option value="">-- 选择模板 --</option>');
            templateManager.getAllTemplates().forEach(t => {
                $select.append(`<option value="${t.id}">${t.name}</option>`);
            });
        }
    },

    renderUI(s) {
        return `
            <div class="stk-sub-section">
                <div class="stk-sub-header interactable" tabindex="0">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u2699\uFE0F 请求设置
                </div>
                <div class="stk-sub-body">
                    <div class="stk-toggle"><input type="checkbox" id="po_auto" ${s.auto_request ? 'checked' : ''} /><span>自动请求</span></div>
                    <div class="stk-row"><label>请求方式<select id="po_reqmode" class="text_pole">
                        <option value="sequential"${s.request_mode === 'sequential' ? ' selected' : ''}>依次重试</option>
                        <option value="parallel"${s.request_mode === 'parallel' ? ' selected' : ''}>同时请求</option>
                        <option value="hybrid"${s.request_mode === 'hybrid' ? ' selected' : ''}>先一次后并行</option>
                    </select></label></div>
                    <div class="stk-row"><label>重试次数<input type="number" id="po_retries" class="text_pole" value="${s.retry_count}" min="1" max="10" /></label></div>
                    <div class="stk-toggle"><input type="checkbox" id="po_notification" ${s.notification ? 'checked' : ''} /><span>显示通知</span></div>
                </div>
            </div>
            <div class="stk-sub-section">
                <div class="stk-sub-header interactable" tabindex="0">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u{1F527} 操作
                </div>
                <div class="stk-sub-body">
                    <div class="stk-btn" id="po_retry_btn" style="text-align:center">\u{1F504} 手动生成/重试</div>
                    <div class="stk-btn" id="po_settings_btn" style="text-align:center;margin-top:8px">\u{1F4CB} 打开设置窗口</div>
                </div>
            </div>`;
    },

    bindUI(s, save) {
        $('#po_auto').on('change', function () { s.auto_request = this.checked; save(); });
        $('#po_reqmode').on('change', function () { s.request_mode = this.value; save(); });
        $('#po_retries').on('input', function () { s.retry_count = Number(this.value); save(); });
        $('#po_notification').on('change', function () { s.notification = this.checked; save(); });

        const self = this;
        $('#po_retry_btn').on('click', async () => {
            const lastId = Core.getLastMessageId();
            if (lastId < 0) { toastr.warning('没有消息', '[PlotOptions]'); return; }
            await self._runExtra(lastId, s);
        });

        $('#po_settings_btn').on('click', () => {
            showSettingsWindow(s, save);
        });
    },

    openSettings() {
        const s = Core.getModuleSettings(this.id, this.defaultSettings);
        showSettingsWindow(s, () => {
            Core.saveModuleSettings(this.id, s);
        });
    },

    closeAllWindows() {
        if (_optionsWindow) {
            _optionsWindow.close();
            _optionsWindow = null;
        }
        if (_settingsWindow) {
            _settingsWindow.close();
            _settingsWindow = null;
        }
    }
};
