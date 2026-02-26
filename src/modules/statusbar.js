// @ts-nocheck
import { Core } from '../core.js';
import { UI } from '../ui.js';

const STATUS_REGEX = /<StatusBlock>([\s\S]*?)<\/StatusBlock>/i;
const STATUS_FULL_REGEX = /<StatusBlock>[\s\S]*?<\/StatusBlock>/i;
const PLACEHOLDER = '<StatusBarPlaceholder/>';

const DEFAULT_SYSTEM_PROMPT = `你是状态栏生成器。根据正文和上轮状态输出更新后的状态栏。
规则：每字段独立完整填写，禁止使用"同上""无变化"等省略。只输出 <StatusBlock>...</StatusBlock>，不输出其他内容。

输出格式：
<StatusBlock>
<environment>
⏰ [星期]-[年/月/日]-[时:分] | 📍 [位置-场所] | 🌤️ [天气/体感/温度]
</environment>
<charInspect>
🎬 场景动态：[第三人称三视图描述角色在场景中的画面]
👤 面部：[表情/眼神/嘴唇/脸颊等]
🦵 腿部：[大腿/膝盖/小腿/站姿]
🦶 足部：[脚掌/脚趾/鞋袜状态]
💫 背部：[脊椎/肩胛骨/腰窝/皮肤]
🍒 胸部：[形态/状态/敏感度/衣物遮蔽]
🍑 性器：[外观/湿润度/敏感度/衣物遮蔽]
🍑 臀部：[形状/衣物包裹/肌肉状态]
🌸 后庭：[括约肌/润滑度/扩张度]
🦴 特殊部位：[尾巴/翅膀/兽耳等，无则写"无"]
</charInspect>
<vital>
🚽 膀胱：[XX]/100｜[尿意感受]
😊 情绪：[主导+次要情绪]｜[微表情]
🩸 生理期：[状态]
</vital>
<equipment>
👔 上衣：[款式+颜色+完整度+湿润度]
👙 胸衣：[款式+颜色+位置+遮蔽度]
👖 下装：[款式+颜色+状态+褶皱+污渍]
🩲 内裤：[款式+颜色+位置偏移+湿润度]
🧦 腿袜：[类型+颜色+长度+破损]
👠 鞋履：[类型+颜色+穿着状态]
🎀 配饰：[饰品/道具]
🕹️ 性道具：[名称+位置+状态+档位，无则写"无"]
</equipment>
</StatusBlock>`;

const SECTIONS = ['environment', 'charInspect', 'vital', 'equipment'];

function parseBlock(text) {
    const match = text.match(STATUS_REGEX);
    if (!match) return null;
    const raw = match[1].trim();
    const result = { raw };
    for (const sec of SECTIONS) {
        const m = raw.match(new RegExp('<' + sec + '>([\\s\\S]*?)<\\/' + sec + '>', 'i'));
        result[sec] = m ? m[1].trim() : '';
    }
    return result;
}

function getStatusData(msgId) {
    const msg = Core.getChat()[msgId];
    if (!msg) return null;
    return _.get(msg, ['extra', 'statusbar', msg.swipe_id ?? 0], null);
}

function setStatusData(msgId, data) {
    const msg = Core.getChat()[msgId];
    if (!msg) return;
    if (!msg.extra) msg.extra = {};
    _.set(msg, ['extra', 'statusbar', msg.swipe_id ?? 0], data);
}

function getLastStatus(beforeId) {
    const chat = Core.getChat();
    for (let i = beforeId; i >= 0; i--) {
        let data = getStatusData(i);
        if (data) return data;
        const msg = chat[i];
        if (msg?.mes) {
            data = parseBlock(msg.mes);
            if (data) { setStatusData(i, data); return data; }
        }
    }
    return null;
}

let _processing = false;

export const StatusBarModule = {
    id: 'statusbar',
    name: '📊 状态栏',
    defaultSettings: {
        enabled: true,
        update_mode: 'extra_model',
        auto_request: true,
        retry_count: 3,
        request_mode: 'sequential',
        content_tag: '',
        cleanup_patterns: [
            '<StatusBlock>[\\s\\S]*?</StatusBlock>',
            '<StatusBarPlaceholder/>',
            '<UpdateVariable>[\\s\\S]*?</UpdateVariable>',
            '<StatusPlaceHolderImpl/>',
        ],
        notification: true,
    },

    // 模板提示词（会同步到世界书）
    templatePrompts: {
        statusbar_system_prompt: DEFAULT_SYSTEM_PROMPT,
    },

    init() {},

    async onMessage(messageId) {
        const s = Core.getModuleSettings(this.id, this.defaultSettings);
        if (!s.enabled || _processing) return;
        const msg = Core.getChat()[messageId];
        if (!msg || msg.is_user) return;

        _processing = true;
        try {
            const hasInline = this._processInline(messageId);
            if (!hasInline && s.update_mode === 'extra_model' && s.auto_request) {
                await this._runExtra(messageId, s);
            }
        } finally { _processing = false; }
    },

    onChatReady(data) {
        const s = Core.getModuleSettings(this.id, this.defaultSettings);
        if (!s.enabled || !data?.messages) return;
        for (const m of data.messages) {
            if (typeof m.content === 'string') m.content = m.content.replace(PLACEHOLDER, '');
        }
    },

    _processInline(msgId) {
        const msg = Core.getChat()[msgId];
        if (!msg?.mes) return false;
        const data = parseBlock(msg.mes);
        if (!data) return false;
        setStatusData(msgId, data);
        if (msg.mes.indexOf(PLACEHOLDER) === -1) msg.mes += '\n\n' + PLACEHOLDER;
        SillyTavern.getContext().saveChat();
        return true;
    },

    async _getSystemPrompt() {
        const wb = await Core.getWorldBookEntry('statusbar_system_prompt');
        return wb || DEFAULT_SYSTEM_PROMPT;
    },

    async _runExtra(msgId, settings) {
        const msg = Core.getChat()[msgId];
        if (!msg) return;
        if (settings.notification) toastr.info('正在生成状态栏...', '[StatusBar]');

        const content = Core.extractContent(msg.mes || '', {
            contentTag: settings.content_tag,
            cleanupPatterns: settings.cleanup_patterns,
        });
        const prev = getLastStatus(msgId - 1);
        const prevBlock = prev
            ? '<PreviousStatus>\n<StatusBlock>\n' + prev.raw + '\n</StatusBlock>\n</PreviousStatus>'
            : '<PreviousStatus>无</PreviousStatus>';

        const userMessage = prevBlock
            + '\n\n<CurrentContent>\n' + content + '\n</CurrentContent>'
            + '\n\n请生成更新后的状态栏。';

        const systemPrompt = await this._getSystemPrompt();
        const api = UI.getSharedAPI();
        const result = await Core.requestExtraModel({
            systemPrompt,
            userMessage,
            api,
            validate: parseBlock,
            retries: settings.retry_count,
            requestMode: settings.request_mode,
            onRetry: (i, max) => { if (settings.notification) toastr.info(`重试 ${i}/${max}`, '[StatusBar]'); },
        });

        if (result) {
            setStatusData(msgId, result);
            let text = (msg.mes || '').replace(STATUS_FULL_REGEX, '').replace(PLACEHOLDER, '').trimEnd();
            text += '\n\n<StatusBlock>\n' + result.raw + '\n</StatusBlock>\n\n' + PLACEHOLDER;
            msg.mes = text;
            const ctx = SillyTavern.getContext();
            if (typeof ctx.setChatMessages === 'function') {
                await ctx.setChatMessages([{ message_id: msgId, message: text }], { refresh: 'affected' });
            } else {
                ctx.saveChat();
            }
            if (settings.notification) toastr.success('状态栏已更新', '[StatusBar]');
        } else {
            if (settings.notification) toastr.error('状态栏生成失败', '[StatusBar]');
        }
    },

    renderUI(s) {
        return `
            <!-- 请求设置 -->
            <div class="stk-sub-section">
                <div class="stk-sub-header">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    ⚙️ 请求设置
                </div>
                <div class="stk-sub-body">
                    <div class="stk-toggle"><input type="checkbox" id="sb_auto" ${s.auto_request ? 'checked' : ''} /><span>自动请求</span></div>
                    <div class="stk-row"><label>请求方式<select id="sb_reqmode" class="text_pole">
                        <option value="sequential"${s.request_mode === 'sequential' ? ' selected' : ''}>依次重试</option>
                        <option value="parallel"${s.request_mode === 'parallel' ? ' selected' : ''}>同时请求</option>
                        <option value="hybrid"${s.request_mode === 'hybrid' ? ' selected' : ''}>先一次后并行</option>
                    </select></label></div>
                    <div class="stk-row"><label>重试次数<input type="number" id="sb_retries" class="text_pole" value="${s.retry_count}" min="1" max="10" /></label></div>
                    <div class="stk-toggle"><input type="checkbox" id="sb_notification" ${s.notification ? 'checked' : ''} /><span>显示通知</span></div>
                </div>
            </div>
            <!-- 内容处理 -->
            <div class="stk-sub-section">
                <div class="stk-sub-header">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    ✂️ 内容处理
                </div>
                <div class="stk-sub-body">
                    <div class="stk-row"><label>正文标签名 <span>(空=不提取)</span><input type="text" id="sb_tag" class="text_pole" value="${s.content_tag || ''}" /></label></div>
                    <div class="stk-row"><label>清理正则 <span>(每行一个)</span><textarea id="sb_cleanup" class="text_pole" rows="4">${(s.cleanup_patterns || []).join('\n')}</textarea></label></div>
                </div>
            </div>
            <!-- 操作 -->
            <div class="stk-sub-section">
                <div class="stk-sub-header">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    🔧 操作
                </div>
                <div class="stk-sub-body">
                    <div class="stk-btn" id="sb_retry_btn" style="text-align:center">🔄 手动生成/重试</div>
                    <div class="stk-btn" id="sb_test_btn" style="text-align:center">🧪 测试提取</div>
                </div>
            </div>`;
    },

    bindUI(s, save) {
        $('#sb_auto').on('change', function () { s.auto_request = this.checked; save(); });
        $('#sb_reqmode').on('change', function () { s.request_mode = this.value; save(); });
        $('#sb_retries').on('input', function () { s.retry_count = Number(this.value); save(); });
        $('#sb_notification').on('change', function () { s.notification = this.checked; save(); });
        $('#sb_tag').on('input', function () { s.content_tag = this.value.trim(); save(); });
        $('#sb_cleanup').on('input', function () { s.cleanup_patterns = this.value.split('\n').map(l => l.trim()).filter(Boolean); save(); });

        const self = this;
        $('#sb_retry_btn').on('click', async () => {
            const lastId = Core.getLastMessageId();
            if (lastId < 0) { toastr.warning('没有消息', '[StatusBar]'); return; }
            await self._runExtra(lastId, s);
        });

        $('#sb_test_btn').on('click', () => {
            const chat = Core.getChat();
            const last = chat[chat.length - 1];
            if (!last) { toastr.warning('没有消息', '[StatusBar]'); return; }
            const original = last.mes || '';
            const extracted = Core.extractContent(original, { contentTag: s.content_tag, cleanupPatterns: s.cleanup_patterns });
            const prev = getLastStatus(chat.length - 2);
            const prevText = prev ? prev.raw.substring(0, 200) + '...' : '(无)';
            const ratio = Math.round((1 - extracted.length / Math.max(original.length, 1)) * 100);

            const popupHtml = `<div style="font-family:monospace;white-space:pre-wrap;max-height:60vh;overflow:auto;">
                <h4>📄 原文 (${original.length} 字符)</h4>
                <div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">${_.escape(original.substring(0, 500))}${original.length > 500 ? '\n...(截断)' : ''}</div>
                <h4>✂️ 提取后 (${extracted.length} 字符, 节省 ${ratio}%)</h4>
                <div style="background:rgba(0,100,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">${_.escape(extracted.substring(0, 500))}${extracted.length > 500 ? '\n...(截断)' : ''}</div>
                <h4>📊 上轮状态栏</h4>
                <div style="background:rgba(0,0,100,0.2);padding:8px;border-radius:6px;max-height:10vh;overflow:auto;">${_.escape(prevText)}</div>
            </div>`;

            const ctx = SillyTavern.getContext();
            if (typeof ctx.callPopup === 'function') {
                ctx.callPopup(popupHtml, 'text', '', { wide: true });
            } else if (typeof SillyTavern.callGenericPopup === 'function') {
                SillyTavern.callGenericPopup(popupHtml, 1, '', { wide: true, allowVerticalScrolling: true });
            } else {
                alert('提取后 (' + extracted.length + ' 字符):\n' + extracted.substring(0, 300));
            }
        });
    },
};
