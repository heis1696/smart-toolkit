// @ts-nocheck
import { Core } from '../core.js';
import { UI } from '../ui.js';

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

function showOptions(options) {
    $('#stk-plot-options').remove();
    const items = options.map((o, i) =>
        `<div class="stk-po-item" data-idx="${i}">${ICONS[i] || '\u25B6'} ${_.escape(o)}</div>`
    ).join('');

    $('body').append(`
        <div id="stk-plot-options">
            <div class="stk-po-header">
                <span>\u{1F3AD} 剧情推进</span>
                <span id="stk-po-close" class="fa-solid fa-xmark"></span>
            </div>
            ${items}
        </div>
    `);

    // Make draggable
    let isDragging = false, offsetX, offsetY;
    $('#stk-plot-options .stk-po-header').on('mousedown', function (e) {
        if ($(e.target).is('#stk-po-close')) return;
        isDragging = true;
        const rect = $('#stk-plot-options')[0].getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        e.preventDefault();
    });
    $(document).on('mousemove.stkpo', function (e) {
        if (!isDragging) return;
        $('#stk-plot-options').css({
            left: e.clientX - offsetX + 'px',
            top: e.clientY - offsetY + 'px',
            right: 'auto', bottom: 'auto',
        });
    });
    $(document).on('mouseup.stkpo', function () {
        isDragging = false;
    });

    $('#stk-po-close').on('click', () => {
        $('#stk-plot-options').remove();
        $(document).off('.stkpo');
    });

    $('.stk-po-item').on('click', function () {
        const text = options[$(this).data('idx')];
        $('#stk-plot-options').remove();
        $(document).off('.stkpo');
        if (!text) return;
        $('#send_textarea').val(text).trigger('input');
        $('#send_but').trigger('click');
    });
}

let _processing = false;

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

    init() {},

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
    },
};
