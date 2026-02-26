// @ts-nocheck
const PLUGIN_NAME = 'smart-toolkit';

export const Core = {
    PLUGIN_NAME,

    // ===== 设置管理 =====
    getSettings() {
        const ext = SillyTavern.getContext().extensionSettings;
        if (!ext[PLUGIN_NAME]) ext[PLUGIN_NAME] = {};
        return ext[PLUGIN_NAME];
    },

    saveSettings() {
        SillyTavern.getContext().saveSettingsDebounced();
    },

    getModuleSettings(moduleId, defaults) {
        const settings = this.getSettings();
        if (!settings[moduleId]) settings[moduleId] = {};
        const s = settings[moduleId];
        for (const [k, v] of Object.entries(defaults)) {
            if (s[k] === undefined) s[k] = JSON.parse(JSON.stringify(v));
        }
        return s;
    },

    // ===== 消息工具 =====
    getChat() {
        return SillyTavern.getContext().chat;
    },

    getLastMessageId() {
        return this.getChat().length - 1;
    },

    // ===== 正文提取 =====
    extractContent(text, options) {
        let result = text;
        if (options?.contentTag) {
            const re = new RegExp('<' + options.contentTag + '>([\\s\\S]*?)<\\/' + options.contentTag + '>', 'i');
            const m = result.match(re);
            if (m) result = m[1];
        }
        if (options?.cleanupPatterns) {
            for (const p of options.cleanupPatterns) {
                if (!p) continue;
                try { result = result.replace(new RegExp(p, 'gi'), ''); } catch (e) { }
            }
        }
        return result.trim();
    },

    // ===== 额外模型请求 =====
    normalizeBaseURL(url) {
        url = (url || '').trim().replace(/\/+$/, '');
        if (!url) return '';
        if (url.endsWith('/v1')) return url;
        if (url.endsWith('/chat/completions')) return url.replace(/\/chat\/completions$/, '');
        return url + '/v1';
    },

    async requestExtraModel(opts) {
        const { systemPrompt, userMessage, api, validate, retries = 3, requestMode = 'sequential', onRetry } = opts;

        const attempt = async () => {
            const text = await this._rawRequest(systemPrompt, userMessage, api);
            if (!text) return null;
            const result = validate?.(text);
            return result || null;
        };

        const throwIfNull = async () => {
            const r = await attempt();
            if (!r) throw new Error('empty');
            return r;
        };

        if (requestMode === 'parallel') {
            try {
                return await Promise.any(Array.from({ length: retries }, throwIfNull));
            } catch { return null; }
        }

        if (requestMode === 'hybrid') {
            const first = await attempt();
            if (first) return first;
            if (retries > 1) {
                onRetry?.(1, retries);
                try {
                    return await Promise.any(Array.from({ length: retries - 1 }, throwIfNull));
                } catch { return null; }
            }
            return null;
        }

        // sequential
        for (let i = 0; i < retries; i++) {
            const r = await attempt();
            if (r) return r;
            if (i < retries - 1) onRetry?.(i + 1, retries);
        }
        return null;
    },

    async _rawRequest(systemPrompt, userMessage, api) {
        const ctx = SillyTavern.getContext();
        try {
            if (api.use_preset) {
                return await ctx.generate({
                    user_input: userMessage,
                    max_chat_history: 0,
                    should_stream: api.stream || false,
                    injects: [{ position: 'in_chat', depth: 0, should_scan: false, role: 'system', content: systemPrompt }],
                });
            }

            if (!api.url) {
                return await ctx.generateRaw({
                    user_input: userMessage,
                    max_chat_history: 0,
                    should_stream: api.stream || false,
                    ordered_prompts: [{ role: 'system', content: systemPrompt }, 'user_input'],
                });
            }

            const url = this.normalizeBaseURL(api.url) + '/chat/completions';
            const headers = { 'Content-Type': 'application/json' };
            if (api.key) headers['Authorization'] = 'Bearer ' + api.key;

            const resp = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: api.model,
                    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
                    max_tokens: api.max_tokens || 2048,
                    temperature: api.temperature ?? 0.7,
                    stream: api.stream || false,
                }),
            });

            if (api.stream) {
                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let content = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                            try {
                                const delta = JSON.parse(trimmed.slice(6)).choices?.[0]?.delta?.content;
                                if (delta) content += delta;
                            } catch { }
                        }
                    }
                }
                return content;
            }

            const json = await resp.json();
            return json.choices?.[0]?.message?.content ?? null;
        } catch (e) {
            console.error('[SmartToolkit] _rawRequest failed:', e);
            return null;
        }
    },
};
