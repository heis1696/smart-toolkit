// @ts-nocheck
// ============================================================
// Simple StatusBar - SillyTavern Extension (Optimized)
// ============================================================

(function () {
    const EXTENSION_NAME = 'simple-statusbar';
    const STATUS_REGEX = /<StatusBlock>([\s\S]*?)<\/StatusBlock>/i;
    const STATUS_FULL_REGEX = /<StatusBlock>[\s\S]*?<\/StatusBlock>/i;
    const PLACEHOLDER = '<StatusBarPlaceholder/>';

    // ============================================================
    // 提示词（精简版 - 只关注状态栏生成）
    // ============================================================
    const STATUSBAR_SYSTEM_PROMPT = `你是状态栏生成器。根据给定的正文内容和上一轮状态，输出更新后的状态栏。

【规则】
- 每个字段独立完整填写，禁止省略/指代
- 数值变化须符合剧情逻辑
- 只输出一个 <StatusBlock>...</StatusBlock>，不输出其他内容`;

    const STATUSBAR_FORMAT = `
<StatusBlock>
<environment>
⏰ [星期] - [年/月/日] - [时:分] | 📍 [位置-场所] | 🌤️ [天气/体感/温度]
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
🕹️ 性道具：[名称+位置+状态+档位]
</equipment>
</StatusBlock>`;

    // ============================================================
    // 默认设置
    // ============================================================
    const DEFAULT_SETTINGS = {
        enabled: true,
        update_mode: 'inline',
        notification: true,
        // 正文提取配置
        content_extraction: {
            enabled: true,
            // 用于提取正文的正则（从消息中提取有效内容）
            content_tag: 'content',  // 自定义XML标签名，如 <content>...</content>
            // 额外的清理正则列表（移除不需要的内容）
            cleanup_patterns: [
                '<StatusBlock>[\\s\\S]*?</StatusBlock>',
                '<StatusBarPlaceholder/>',
                '<UpdateVariable>[\\s\\S]*?</UpdateVariable>',
                '<StatusPlaceHolderImpl/>',
            ],
        },
        extra_model: {
            auto_request: true,
            use_preset: false,
            api_url: '',
            api_key: '',
            model_name: '',
            max_tokens: 2048,
            temperature: 0.7,
            retry_count: 3,
            request_mode: 'sequential',
            stream: false,
        },
    };

    // ============================================================
    // 设置管理
    // ============================================================
    function getSettings() {
        var ext = SillyTavern.getContext().extensionSettings;
        if (!ext[EXTENSION_NAME]) {
            ext[EXTENSION_NAME] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        var s = ext[EXTENSION_NAME];
        // 兼容旧版本
        if (!s.content_extraction) {
            s.content_extraction = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.content_extraction));
        }
        if (s.extra_model.stream === undefined) s.extra_model.stream = false;
        return s;
    }

    function saveSettings() {
        SillyTavern.getContext().saveSettingsDebounced();
    }

    // ============================================================
    // 正文提取（核心优化）
    // ============================================================

    /**
     * 从消息文本中提取有效正文内容
     * 1. 如果启用了 content_tag，优先提取 <tag>...</tag> 内的内容
     * 2. 用 cleanup_patterns 清理掉不需要的部分
     */
    function extractContent(text) {
        var settings = getSettings();
        var cfg = settings.content_extraction;
        if (!cfg || !cfg.enabled) return text;

        var result = text;

        // 尝试提取自定义标签内的内容
        if (cfg.content_tag) {
            var tagRe = new RegExp(
                '<' + cfg.content_tag + '>([\\s\\S]*?)<\\/' + cfg.content_tag + '>',
                'i'
            );
            var m = result.match(tagRe);
            if (m) {
                result = m[1];
            }
        }

        // 应用清理正则
        if (cfg.cleanup_patterns && cfg.cleanup_patterns.length > 0) {
            for (var i = 0; i < cfg.cleanup_patterns.length; i++) {
                var pattern = cfg.cleanup_patterns[i];
                if (!pattern) continue;
                try {
                    var re = new RegExp(pattern, 'gi');
                    result = result.replace(re, '');
                } catch (e) {
                    console.warn('[StatusBar] Invalid cleanup regex:', pattern, e);
                }
            }
        }

        return result.trim();
    }

    // ============================================================
    // 状态栏数据存取
    // ============================================================
    function getChat() {
        return SillyTavern.getContext().chat;
    }

    function getStatusData(messageId) {
        var chat = getChat();
        var msg = chat[messageId];
        if (!msg) return null;
        var swipeId = msg.swipe_id ?? 0;
        return _.get(msg, ['extra', 'statusbar', swipeId], null);
    }

    function setStatusData(messageId, data) {
        var chat = getChat();
        var msg = chat[messageId];
        if (!msg) return;
        var swipeId = msg.swipe_id ?? 0;
        if (!msg.extra) msg.extra = {};
        _.set(msg, ['extra', 'statusbar', swipeId], data);
    }

    function getLastStatusData(beforeMessageId) {
        var chat = getChat();
        for (var i = beforeMessageId; i >= 0; i--) {
            // 优先读已存储的
            var data = getStatusData(i);
            if (data) return data;

            // 回退：从消息原文中解析
            var msg = chat[i];
            if (msg && msg.mes) {
                var parsed = parseStatusBlock(msg.mes);
                if (parsed) {
                    setStatusData(i, parsed); // 顺便存上，下次就不用再解析
                    return parsed;
                }
            }
        }
        return null;
    }

    // ============================================================
    // 解析 StatusBlock
    // ============================================================
    function parseStatusBlock(text) {
        var match = text.match(STATUS_REGEX);
        if (!match) return null;

        var raw = match[1].trim();
        var result = { raw: raw };

        var sections = ['environment', 'charInspect', 'vital', 'equipment'];
        for (var idx = 0; idx < sections.length; idx++) {
            var section = sections[idx];
            var re = new RegExp('<' + section + '>([\\s\\S]*?)<\\/' + section + '>', 'i');
            var m = raw.match(re);
            result[section] = m ? m[1].trim() : '';
        }

        return result;
    }

    // ============================================================
    // 从消息中提取并存储状态栏
    // ============================================================
    function processMessage(messageId) {
        var chat = getChat();
        var msg = chat[messageId];
        if (!msg || msg.is_system) return false;

        var text = msg.mes || '';
        var statusData = parseStatusBlock(text);

        if (statusData) {
            setStatusData(messageId, statusData);
            if (text.indexOf(PLACEHOLDER) === -1) {
                msg.mes = text + '\n\n' + PLACEHOLDER;
            }
            SillyTavern.getContext().saveChat();
            return true;
        }
        return false;
    }

    // ============================================================
    // 额外模型解析（优化版：只发正文+上轮状态）
    // ============================================================
    function normalizeBaseURL(url) {
        url = (url || '').trim().replace(/\/+$/, '');
        if (!url) return '';
        if (url.endsWith('/v1')) return url;
        if (url.endsWith('/chat/completions')) return url.replace(/\/chat\/completions$/, '');
        return url + '/v1';
    }

    async function requestExtraModel(messageId) {
        var settings = getSettings();
        var config = settings.extra_model;
        var chat = getChat();
        var msg = chat[messageId];
        if (!msg) return null;

        // ===== 核心优化：只提取本轮正文 + 上轮状态 =====
        var currentContent = extractContent(msg.mes || '');
        var prevStatus = getLastStatusData(messageId - 1);
        var prevStatusBlock = prevStatus
            ? '<PreviousStatus>\n<StatusBlock>\n' + prevStatus.raw + '\n</StatusBlock>\n</PreviousStatus>'
            : '<PreviousStatus>无</PreviousStatus>';

        // 精简的用户消息：只包含必要信息
        var userMessage = prevStatusBlock
            + '\n\n<CurrentContent>\n' + currentContent + '\n</CurrentContent>'
            + '\n\n请根据以上正文内容和上轮状态，生成更新后的状态栏。';

        var systemPrompt = STATUSBAR_SYSTEM_PROMPT + '\n\n输出格式：\n' + STATUSBAR_FORMAT;

        // 使用当前预设
        if (config.use_preset) {
            try {
                var ctx = SillyTavern.getContext();
                return await ctx.generate({
                    user_input: userMessage,
                    max_chat_history: 0,  // 不需要历史，正文已在 user_input 中
                    should_stream: config.stream || false,
                    injects: [{
                        position: 'in_chat', depth: 0,
                        should_scan: false, role: 'system',
                        content: systemPrompt,
                    }],
                });
            } catch (e) {
                console.error('[StatusBar] generate failed:', e);
                return null;
            }
        }

        // 自定义 API
        var apiUrl = config.api_url
            ? normalizeBaseURL(config.api_url) + '/chat/completions'
            : null;

        if (!apiUrl) {
            try {
                var ctx2 = SillyTavern.getContext();
                if (typeof ctx2.generateRaw === 'function') {
                    return await ctx2.generateRaw({
                        user_input: userMessage,
                        max_chat_history: 0,
                        should_stream: config.stream || false,
                        ordered_prompts: [
                            { role: 'system', content: systemPrompt },
                            'user_input',
                        ],
                    });
                }
            } catch (e) {
                console.error('[StatusBar] generateRaw failed:', e);
            }
            return null;
        }

        // 直接调用 API（最精简：system + user 两条消息）
        var messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ];

        var headers = { 'Content-Type': 'application/json' };
        if (config.api_key) headers['Authorization'] = 'Bearer ' + config.api_key;

        try {
            var resp = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: config.model_name,
                    messages: messages,
                    max_tokens: config.max_tokens || 2048,
                    temperature: config.temperature || 0.7,
                    stream: config.stream || false,
                }),
            });

            if (config.stream) {
                var reader = resp.body.getReader();
                var decoder = new TextDecoder();
                var fullContent = '';
                while (true) {
                    var readResult = await reader.read();
                    if (readResult.done) break;
                    var chunk = decoder.decode(readResult.value, { stream: true });
                    var lines = chunk.split('\n');
                    for (var li = 0; li < lines.length; li++) {
                        var line = lines[li].trim();
                        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            try {
                                var jsonData = JSON.parse(line.slice(6));
                                var delta = jsonData.choices?.[0]?.delta?.content;
                                if (delta) fullContent += delta;
                            } catch (e) { }
                        }
                    }
                }
                return fullContent;
            } else {
                var json = await resp.json();
                return json.choices?.[0]?.message?.content ?? null;
            }
        } catch (e) {
            console.error('[StatusBar] API request failed:', e);
            return null;
        }
    }

    async function singleAttempt(messageId) {
        var response = await requestExtraModel(messageId);
        if (!response) return null;
        var statusData = parseStatusBlock(response);
        if (!statusData) return null;
        var fullMatch = response.match(STATUS_FULL_REGEX);
        return {
            statusData: statusData,
            rawBlock: fullMatch ? fullMatch[0] : '<StatusBlock>\n' + statusData.raw + '\n</StatusBlock>',
        };
    }

    async function runExtraModelParsing(messageId) {
        var settings = getSettings();
        var config = settings.extra_model;
        var maxRetries = config.retry_count || 3;

        if (settings.notification) toastr.info('正在生成状态栏...', '[StatusBar]');

        var result = null;

        if (config.request_mode === 'parallel') {
            try {
                result = await Promise.any(
                    Array.from({ length: maxRetries }, () =>
                        singleAttempt(messageId).then(r => { if (!r) throw new Error('empty'); return r; })
                    )
                );
            } catch (e) { }
        } else if (config.request_mode === 'hybrid') {
            result = await singleAttempt(messageId);
            if (!result && maxRetries > 1) {
                if (settings.notification) toastr.info('首次失败，并行重试...', '[StatusBar]');
                try {
                    result = await Promise.any(
                        Array.from({ length: maxRetries - 1 }, () =>
                            singleAttempt(messageId).then(r => { if (!r) throw new Error('empty'); return r; })
                        )
                    );
                } catch (e) { }
            }
        } else {
            for (var i = 0; i < maxRetries; i++) {
                result = await singleAttempt(messageId);
                if (result) break;
                if (i < maxRetries - 1 && settings.notification)
                    toastr.info('重试 ' + (i + 1) + '/' + maxRetries, '[StatusBar]');
            }
        }

        if (result) {
            setStatusData(messageId, result.statusData);
            var chat = getChat();
            var msg = chat[messageId];
            if (msg) {
                var text = (msg.mes || '')
                    .replace(STATUS_FULL_REGEX, '')
                    .replace(PLACEHOLDER, '')
                    .trimEnd();
                text += '\n\n' + result.rawBlock + '\n\n' + PLACEHOLDER;
                msg.mes = text;

                var ctx = SillyTavern.getContext();
                if (typeof ctx.setChatMessages === 'function') {
                    await ctx.setChatMessages(
                        [{ message_id: messageId, message: text }],
                        { refresh: 'affected' }
                    );
                } else {
                    ctx.saveChat();
                }
            }
            if (settings.notification) toastr.success('状态栏已更新', '[StatusBar]');
        } else {
            if (settings.notification) toastr.error('状态栏生成失败', '[StatusBar]');
        }
    }

    // ============================================================
    // 消息接收 & 清理
    // ============================================================
    var isProcessing = false;

    async function onMessageReceived(messageId) {
        var settings = getSettings();
        if (!settings.enabled || isProcessing) return;
        var chat = getChat();
        var msg = chat[messageId];
        if (!msg || msg.is_user) return;

        isProcessing = true;
        try {
            if (settings.update_mode === 'inline') {
                processMessage(messageId);
            } else if (settings.update_mode === 'extra_model') {
                var hasInline = processMessage(messageId);
                if (!hasInline && settings.extra_model.auto_request) {
                    await runExtraModelParsing(messageId);
                }
            }
        } catch (e) {
            console.error('[StatusBar] Error:', e);
        } finally {
            isProcessing = false;
        }
    }

    function onChatCompletionReady(data) {
        var settings = getSettings();
        if (!settings.enabled || !data?.messages) return;

        for (var i = 0; i < data.messages.length; i++) {
            if (typeof data.messages[i].content !== 'string') continue;
            data.messages[i].content = data.messages[i].content.replace(PLACEHOLDER, '');
        }

        var foundLast = false;
        for (var j = data.messages.length - 1; j >= 0; j--) {
            if (typeof data.messages[j].content !== 'string') continue;
            if (STATUS_FULL_REGEX.test(data.messages[j].content)) {
                if (foundLast) {
                    data.messages[j].content = data.messages[j].content.replace(STATUS_FULL_REGEX, '').trim();
                }
                foundLast = true;
            }
        }
    }

    // ============================================================
    // UI 面板（加入正则配置）
    // ============================================================
    function createSettingsPanel() {
        var settings = getSettings();
        var em = settings.extra_model;
        var ce = settings.content_extraction;

        var html = ''
            + '<div class="inline-drawer" id="statusbar-settings">'
            + '  <div class="inline-drawer-toggle inline-drawer-header">'
            + '    <b>Simple StatusBar</b>'
            + '    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>'
            + '  </div>'
            + '  <div class="inline-drawer-content" style="flex-direction:column;gap:0.75rem;padding-top:0.5rem;">'

            // 启用
            + '    <label class="checkbox_label">'
            + '      <input type="checkbox" id="ssb_enabled" ' + (settings.enabled ? 'checked' : '') + ' />'
            + '      <span>启用 StatusBar</span>'
            + '    </label>'

            // 更新方式
            + '    <div style="display:flex;flex-direction:column;gap:0.25rem;">'
            + '      <strong>更新方式</strong>'
            + '      <select id="ssb_update_mode" class="text_pole">'
            + '        <option value="inline"' + (settings.update_mode === 'inline' ? ' selected' : '') + '>随 AI 输出</option>'
            + '        <option value="extra_model"' + (settings.update_mode === 'extra_model' ? ' selected' : '') + '>额外模型解析</option>'
            + '      </select>'
            + '    </div>'

            // ===== 正文提取配置（新增） =====
            + '    <details style="border:1px dashed var(--SmartThemeBorderColor);border-radius:10px;padding:0.5rem 0.7rem;">'
            + '      <summary style="cursor:pointer;font-weight:600;">📝 正文提取 & 正则裁剪</summary>'
            + '      <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">'
            + '        <label class="checkbox_label">'
            + '          <input type="checkbox" id="ssb_ce_enabled" ' + (ce.enabled ? 'checked' : '') + ' />'
            + '          <span>启用正文提取</span>'
            + '        </label>'
            + '        <label>正文 XML 标签名 <small style="opacity:0.7;">(如填 content 则提取 &lt;content&gt;...&lt;/content&gt;)</small>'
            + '          <input type="text" id="ssb_content_tag" class="text_pole" value="' + (ce.content_tag || '') + '" placeholder="content" />'
            + '        </label>'
            + '        <label>清理正则 <small style="opacity:0.7;">(每行一个正则，用于移除不需要的内容)</small>'
            + '          <textarea id="ssb_cleanup_patterns" class="text_pole" rows="5" style="font-family:monospace;font-size:0.85em;">' + (ce.cleanup_patterns || []).join('\n') + '</textarea>'
            + '        </label>'
            + '        <div class="menu_button menu_button_icon interactable" id="ssb_test_extract" style="text-align:center;font-size:0.9em;">'
            + '          🧪 测试提取（取最新消息）'
            + '        </div>'
            + '      </div>'
            + '    </details>'

            // 额外模型配置
            + '    <div id="ssb_extra_config" style="display:' + (settings.update_mode === 'extra_model' ? 'flex' : 'none') + ';flex-direction:column;gap:0.5rem;border:1px dashed var(--SmartThemeBorderColor);border-radius:10px;padding:0.5rem 0.7rem;">'
            + '      <strong>额外模型配置</strong>'
            + '      <label class="checkbox_label">'
            + '        <input type="checkbox" id="ssb_auto_request" ' + (em.auto_request ? 'checked' : '') + ' />'
            + '        <span>自动请求</span>'
            + '      </label>'
            + '      <label class="checkbox_label">'
            + '        <input type="checkbox" id="ssb_use_preset" ' + (em.use_preset ? 'checked' : '') + ' />'
            + '        <span>使用当前预设</span>'
            + '      </label>'
            + '      <div id="ssb_custom_api" style="display:' + (em.use_preset ? 'none' : 'flex') + ';flex-direction:column;gap:0.4rem;">'
            + '        <label>API 地址<input type="text" id="ssb_api_url" class="text_pole" value="' + (em.api_url || '') + '" placeholder="http://localhost:1234/v1" /></label>'
            + '        <label>API 密钥<input type="password" id="ssb_api_key" class="text_pole" value="' + (em.api_key || '') + '" /></label>'
            + '        <label>模型名称<input type="text" id="ssb_model_name" class="text_pole" value="' + (em.model_name || '') + '" /></label>'
            + '      </div>'
            + '      <label>请求方式<select id="ssb_request_mode" class="text_pole">'
            + '        <option value="sequential"' + (em.request_mode === 'sequential' ? ' selected' : '') + '>依次重试</option>'
            + '        <option value="parallel"' + (em.request_mode === 'parallel' ? ' selected' : '') + '>同时请求</option>'
            + '        <option value="hybrid"' + (em.request_mode === 'hybrid' ? ' selected' : '') + '>先一次后并行</option>'
            + '      </select></label>'
            + '      <label>请求次数<input type="number" id="ssb_retry_count" class="text_pole" value="' + em.retry_count + '" min="1" max="10" /></label>'
            + '      <details style="border:1px solid var(--SmartThemeBorderColor);border-radius:8px;padding:0.4rem;">'
            + '        <summary style="cursor:pointer;font-weight:600;">🎛️ 生成参数</summary>'
            + '        <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">'
            + '          <label>最大回复 token<input type="number" id="ssb_max_tokens" class="text_pole" value="' + em.max_tokens + '" min="256" max="8192" step="256" /></label>'
            + '          <label>温度<input type="number" id="ssb_temperature" class="text_pole" value="' + em.temperature + '" min="0" max="2" step="0.1" /></label>'
            + '          <label class="checkbox_label"><input type="checkbox" id="ssb_stream" ' + (em.stream ? 'checked' : '') + ' /><span>流式传输</span></label>'
            + '        </div>'
            + '      </details>'
            + '    </div>'

            // 通知
            + '    <label class="checkbox_label">'
            + '      <input type="checkbox" id="ssb_notification" ' + (settings.notification ? 'checked' : '') + ' />'
            + '      <span>显示通知</span>'
            + '    </label>'

            // 手动按钮
            + '    <div class="menu_button menu_button_icon interactable" id="ssb_retry_btn" style="text-align:center;">'
            + '      🔄 手动生成/重试状态栏'
            + '    </div>'

            + '  </div>'
            + '</div>';

        $('#extensions_settings2').append(html);

        // ========== 绑定事件 ==========

        $('#ssb_enabled').on('change', function () {
            settings.enabled = this.checked; saveSettings();
        });
        $('#ssb_update_mode').on('change', function () {
            settings.update_mode = this.value;
            $('#ssb_extra_config').toggle(this.value === 'extra_model');
            saveSettings();
        });
        $('#ssb_auto_request').on('change', function () {
            settings.extra_model.auto_request = this.checked; saveSettings();
        });
        $('#ssb_use_preset').on('change', function () {
            settings.extra_model.use_preset = this.checked;
            $('#ssb_custom_api').toggle(!this.checked);
            saveSettings();
        });
        $('#ssb_notification').on('change', function () {
            settings.notification = this.checked; saveSettings();
        });
        $('#ssb_api_url').on('input', function () {
            settings.extra_model.api_url = this.value; saveSettings();
        });
        $('#ssb_api_key').on('input', function () {
            settings.extra_model.api_key = this.value; saveSettings();
        });
        $('#ssb_model_name').on('input', function () {
            settings.extra_model.model_name = this.value; saveSettings();
        });
        $('#ssb_request_mode').on('change', function () {
            settings.extra_model.request_mode = this.value; saveSettings();
        });
        $('#ssb_retry_count').on('input', function () {
            settings.extra_model.retry_count = Number(this.value); saveSettings();
        });
        $('#ssb_max_tokens').on('input', function () {
            settings.extra_model.max_tokens = Number(this.value); saveSettings();
        });
        $('#ssb_temperature').on('input', function () {
            settings.extra_model.temperature = Number(this.value); saveSettings();
        });
        $('#ssb_stream').on('change', function () {
            settings.extra_model.stream = this.checked; saveSettings();
        });

        // ===== 正文提取配置事件 =====
        $('#ssb_ce_enabled').on('change', function () {
            settings.content_extraction.enabled = this.checked; saveSettings();
        });
        $('#ssb_content_tag').on('input', function () {
            settings.content_extraction.content_tag = this.value.trim(); saveSettings();
        });
        $('#ssb_cleanup_patterns').on('input', function () {
            settings.content_extraction.cleanup_patterns = this.value
                .split('\n')
                .map(function (l) { return l.trim(); })
                .filter(Boolean);
            saveSettings();
        });

        // 测试提取按钮
        $('#ssb_test_extract').on('click', function () {
            var chat = getChat();
            var lastMsg = chat[chat.length - 1];
            if (!lastMsg) {
                toastr.warning('没有消息', '[StatusBar]');
                return;
            }
            var original = lastMsg.mes || '';
            var extracted = extractContent(original);

            var prevStatus = getLastStatusData(chat.length - 2);
            var prevText = prevStatus ? prevStatus.raw.substring(0, 200) + '...' : '(无)';

            // 弹窗展示提取结果
            var popupHtml = '<div style="font-family:monospace;white-space:pre-wrap;max-height:60vh;overflow:auto;">'
                + '<h4>📄 原始消息 (' + original.length + ' 字符)</h4>'
                + '<div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">'
                + _.escape(original.substring(0, 500)) + (original.length > 500 ? '\n...(截断)' : '')
                + '</div>'
                + '<h4>✂️ 提取后 (' + extracted.length + ' 字符, 节省 '
                + Math.round((1 - extracted.length / Math.max(original.length, 1)) * 100) + '%)</h4>'
                + '<div style="background:rgba(0,100,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">'
                + _.escape(extracted.substring(0, 500)) + (extracted.length > 500 ? '\n...(截断)' : '')
                + '</div>'
                + '<h4>📊 上轮状态栏</h4>'
                + '<div style="background:rgba(0,0,100,0.2);padding:8px;border-radius:6px;max-height:10vh;overflow:auto;">'
                + _.escape(prevText)
                + '</div>'
                + '<h4>💡 实际发送给AI的内容 = 系统提示词 + 上轮状态 + 提取后正文</h4>'
                + '</div>';

            var ctx = SillyTavern.getContext();
            if (typeof ctx.callPopup === 'function') {
                ctx.callPopup(popupHtml, 'text', '', { wide: true });
            } else if (typeof SillyTavern.callGenericPopup === 'function') {
                SillyTavern.callGenericPopup(popupHtml, 1, '', { wide: true, allowVerticalScrolling: true });
            } else {
                alert('提取后 (' + extracted.length + ' 字符):\n' + extracted.substring(0, 300));
            }
        });

        // 手动按钮
        $('#ssb_retry_btn').on('click', async function () {
            var chat = getChat();
            var lastId = chat.length - 1;
            if (lastId < 0) { toastr.warning('没有消息', '[StatusBar]'); return; }
            await runExtraModelParsing(lastId);
        });
    }

    // ============================================================
    // 初始化
    // ============================================================
    var eventListeners = [];

    function listen(event, handler) {
        var ctx = SillyTavern.getContext();
        ctx.eventSource.on(event, handler);
        eventListeners.push(function () {
            ctx.eventSource.removeListener(event, handler);
        });
    }

    jQuery(async function () {
        var ctx = SillyTavern.getContext();
        createSettingsPanel();

        var throttledHandler = _.throttle(onMessageReceived, 3000);
        listen(ctx.eventTypes.MESSAGE_RECEIVED, throttledHandler);
        listen(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onChatCompletionReady);

        if (getSettings().notification) toastr.info('StatusBar 插件已加载', '[StatusBar]');
        console.log('[StatusBar] Plugin initialized');
    });

})();
