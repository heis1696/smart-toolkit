(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/core.js
  var PLUGIN_NAME = "smart-toolkit";
  var WORLD_BOOK = "\u5DE5\u5177\u4E66";
  var Core = {
    PLUGIN_NAME,
    WORLD_BOOK,
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
        if (s[k] === void 0) s[k] = JSON.parse(JSON.stringify(v));
      }
      return s;
    },
    // ===== 世界书管理 =====
    async ensureWorldBook(modules2) {
      const ctx = SillyTavern.getContext();
      try {
        const headers = ctx.getRequestHeaders?.() || { "Content-Type": "application/json" };
        await fetch("/api/worldinfo/create", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: WORLD_BOOK })
        });
        await ctx.executeSlashCommandsWithOptions(`/world silent=true ${WORLD_BOOK}`);
        for (const m of modules2) {
          if (!m.templatePrompts) continue;
          for (const [key, def] of Object.entries(m.templatePrompts)) {
            await this._ensureEntry(key, def);
          }
        }
        console.log("[SmartToolkit] \u4E16\u754C\u4E66\u5DF2\u5C31\u7EEA");
      } catch (e) {
        console.warn("[SmartToolkit] \u4E16\u754C\u4E66\u521D\u59CB\u5316\u5931\u8D25:", e);
      }
    },
    async _ensureEntry(key, defaultContent) {
      const ctx = SillyTavern.getContext();
      try {
        const find = await ctx.executeSlashCommandsWithOptions(`/findentry file=${WORLD_BOOK} field=key ${key}`);
        if (find?.pipe) return;
      } catch {
      }
      try {
        await ctx.executeSlashCommandsWithOptions(
          `/createentry file=${WORLD_BOOK} key=${key} ${defaultContent}`
        );
      } catch (e) {
        console.warn(`[SmartToolkit] \u521B\u5EFA\u6761\u76EE ${key} \u5931\u8D25:`, e);
      }
    },
    async getWorldBookEntry(key) {
      const ctx = SillyTavern.getContext();
      try {
        const find = await ctx.executeSlashCommandsWithOptions(`/findentry file=${WORLD_BOOK} field=key ${key}`);
        if (!find?.pipe) return null;
        const get = await ctx.executeSlashCommandsWithOptions(`/getentryfield file=${WORLD_BOOK} field=content ${find.pipe}`);
        return get?.pipe || null;
      } catch {
        return null;
      }
    },
    async setWorldBookEntry(key, content) {
      const ctx = SillyTavern.getContext();
      try {
        const find = await ctx.executeSlashCommandsWithOptions(`/findentry file=${WORLD_BOOK} field=key ${key}`);
        if (find?.pipe) {
          await ctx.executeSlashCommandsWithOptions(
            `/setentryfield file=${WORLD_BOOK} uid=${find.pipe} field=content ${content}`
          );
        }
      } catch (e) {
        console.warn(`[SmartToolkit] \u66F4\u65B0\u6761\u76EE ${key} \u5931\u8D25:`, e);
      }
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
        const re = new RegExp("<" + options.contentTag + ">([\\s\\S]*?)<\\/" + options.contentTag + ">", "i");
        const m = result.match(re);
        if (m) result = m[1];
      }
      if (options?.cleanupPatterns) {
        for (const p of options.cleanupPatterns) {
          if (!p) continue;
          try {
            result = result.replace(new RegExp(p, "gi"), "");
          } catch (e) {
          }
        }
      }
      return result.trim();
    },
    // ===== 额外模型请求 =====
    normalizeBaseURL(url) {
      url = (url || "").trim().replace(/\/+$/, "");
      if (!url) return "";
      if (url.endsWith("/v1")) return url;
      if (url.endsWith("/chat/completions")) return url.replace(/\/chat\/completions$/, "");
      return url + "/v1";
    },
    async requestExtraModel(opts) {
      const { systemPrompt, userMessage, api, validate, retries = 3, requestMode = "sequential", onRetry } = opts;
      const attempt = async () => {
        const text = await this._rawRequest(systemPrompt, userMessage, api);
        if (!text) return null;
        const result = validate?.(text);
        return result || null;
      };
      const throwIfNull = async () => {
        const r = await attempt();
        if (!r) throw new Error("empty");
        return r;
      };
      if (requestMode === "parallel") {
        try {
          return await Promise.any(Array.from({ length: retries }, throwIfNull));
        } catch {
          return null;
        }
      }
      if (requestMode === "hybrid") {
        const first = await attempt();
        if (first) return first;
        if (retries > 1) {
          onRetry?.(1, retries);
          try {
            return await Promise.any(Array.from({ length: retries - 1 }, throwIfNull));
          } catch {
            return null;
          }
        }
        return null;
      }
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
            injects: [{ position: "in_chat", depth: 0, should_scan: false, role: "system", content: systemPrompt }]
          });
        }
        if (!api.url) {
          return await ctx.generateRaw({
            user_input: userMessage,
            max_chat_history: 0,
            should_stream: api.stream || false,
            ordered_prompts: [{ role: "system", content: systemPrompt }, "user_input"]
          });
        }
        const url = this.normalizeBaseURL(api.url) + "/chat/completions";
        const headers = { "Content-Type": "application/json" };
        if (api.key) headers["Authorization"] = "Bearer " + api.key;
        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: api.model,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
            max_tokens: api.max_tokens || 2048,
            temperature: api.temperature ?? 0.7,
            stream: api.stream || false
          })
        });
        if (api.stream) {
          const reader = resp.body.getReader();
          const decoder = new TextDecoder();
          let content = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const line of decoder.decode(value, { stream: true }).split("\n")) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
                try {
                  const delta = JSON.parse(trimmed.slice(6)).choices?.[0]?.delta?.content;
                  if (delta) content += delta;
                } catch {
                }
              }
            }
          }
          return content;
        }
        const json = await resp.json();
        return json.choices?.[0]?.message?.content ?? null;
      } catch (e) {
        console.error("[SmartToolkit] _rawRequest failed:", e);
        return null;
      }
    }
  };

  // src/ui.js
  var SHARED_DEFAULTS = {
    use_preset: false,
    api_url: "",
    api_key: "",
    model_name: "",
    max_tokens: 2048,
    temperature: 0.7,
    stream: false
  };
  var CSS = `
<style>
#stk-panel{position:fixed;top:0;right:-420px;width:400px;height:100vh;background:var(--SmartThemeBlurTintColor);border-left:1px solid var(--SmartThemeBorderColor);z-index:31000;transition:right .3s ease;display:flex;flex-direction:column;overflow:hidden;box-shadow:-2px 0 8px rgba(0,0,0,.1)}
#stk-panel.open{right:0}
#stk-panel-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--SmartThemeBorderColor);flex-shrink:0}
#stk-panel-header h3{margin:0;font-size:var(--mainFontSize);display:flex;align-items:center;gap:6px;color:var(--SmartThemeBodyColor)}
#stk-panel-body{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
#stk-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.3);z-index:30999;display:none}
#stk-overlay.open{display:block}
.stk-section{border:1px solid var(--SmartThemeBorderColor);border-radius:8px;overflow:hidden}
.stk-section-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;user-select:none;font-weight:600;font-size:13px;color:var(--SmartThemeBodyColor);pointer-events:auto}
.stk-section-header:hover{background:var(--black30a)}
.stk-section-header .stk-arrow{transition:transform .2s;font-size:11px}
.stk-section-header.collapsed .stk-arrow{transform:rotate(-90deg)}
.stk-arrow.collapsed{transform:rotate(-90deg)}
.stk-section-body{padding:8px 12px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--SmartThemeBorderColor)}
.stk-section-body.stk-hidden{display:none}
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
.stk-btn{padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;text-align:center;border:1px solid var(--SmartThemeBorderColor);background:var(--SmartThemeBlurTintColor);pointer-events:auto}
.stk-btn:hover{background:var(--black30a)}
.stk-sub-section{border:1px dashed var(--SmartThemeBorderColor);border-radius:6px;overflow:hidden;margin-top:2px}
.stk-sub-header{padding:6px 10px;cursor:pointer;font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px;pointer-events:auto}
.stk-sub-header:hover{background:var(--black30a)}
.stk-sub-body{padding:6px 10px;display:flex;flex-direction:column;gap:5px;border-top:1px solid var(--SmartThemeBorderColor)}
.stk-sub-body.stk-hidden{display:none}
#stk-top-btn{cursor:pointer;opacity:.7;transition:opacity .2s;display:flex;align-items:center;justify-content:center;height:var(--topBarBlockSize);width:var(--topBarBlockSize);font-size:var(--topbarIconSize)}
#stk-top-btn:hover{opacity:1}
#stk-plot-options{position:fixed;bottom:80px;right:20px;width:340px;background:var(--SmartThemeBlurTintColor,#1a1a2e);border:1px solid var(--SmartThemeBorderColor);border-radius:12px;z-index:31001;box-shadow:0 8px 32px rgba(0,0,0,.4);overflow:hidden}
.stk-po-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--SmartThemeBorderColor);cursor:move;user-select:none}
#stk-po-close{cursor:pointer;padding:4px;opacity:.7}
#stk-po-close:hover{opacity:1}
.stk-po-item{padding:10px 14px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--SmartThemeBorderColor);transition:background .15s;pointer-events:auto}
.stk-po-item:hover{background:var(--black30a)}
.stk-po-item:last-child{border-bottom:none}
</style>`;
  var UI = {
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
        stream: sh.stream
      };
    },
    render(modules2) {
      const s = Core.getSettings();
      if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
      const sh = s._shared;
      $("head").append(CSS);
      const topBtn = $('<div id="stk-top-btn" class="fa-solid fa-toolbox interactable" title="Smart Toolkit" tabindex="0"></div>');
      const $holder = $("#top-settings-holder");
      if ($holder.children().length > 1) {
        $holder.children().eq(-2).after(topBtn);
      } else {
        $holder.append(topBtn);
      }
      let moduleOverviewHtml = "";
      for (const m of modules2) {
        const ms = Core.getModuleSettings(m.id, m.defaultSettings);
        moduleOverviewHtml += `
            <div class="stk-row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">
                <div class="stk-toggle">
                    <input type="checkbox" id="stk_mod_${m.id}_enabled" ${ms.enabled ? "checked" : ""} />
                    <span style="font-weight:500">${m.name}</span>
                </div>
                ${m.defaultSettings.update_mode !== void 0 ? `
                <select id="stk_mod_${m.id}_mode" class="text_pole" style="width:auto;font-size:11px;padding:2px 4px;">
                    <option value="inline"${ms.update_mode === "inline" ? " selected" : ""}>\u968FAI\u8F93\u51FA</option>
                    <option value="extra_model"${ms.update_mode === "extra_model" ? " selected" : ""}>\u989D\u5916\u6A21\u578B</option>
                </select>` : ""}
            </div>`;
      }
      let modulePanelsHtml = "";
      for (const m of modules2) {
        const ms = Core.getModuleSettings(m.id, m.defaultSettings);
        modulePanelsHtml += `
            <div class="stk-section" id="stk_module_${m.id}">
                <div class="stk-section-header interactable collapsed" tabindex="0">
                    <span>${m.name} \u8BBE\u7F6E</span>
                    <span class="stk-arrow fa-solid fa-chevron-down"></span>
                </div>
                <div class="stk-section-body stk-hidden">
                    ${m.renderUI(ms)}
                </div>
            </div>`;
      }
      const panelHtml = `
        <div id="stk-overlay"></div>
        <div id="stk-panel">
            <div id="stk-panel-header">
                <h3>\u{1F9F0} Smart Toolkit</h3>
                <div id="stk-panel-close" class="fa-solid fa-xmark interactable" style="cursor:pointer;font-size:16px;padding:4px" title="\u5173\u95ED"></div>
            </div>
            <div id="stk-panel-body">
                <!-- \u5171\u4EABAPI\u914D\u7F6E + \u6A21\u5757\u603B\u89C8 -->
                <div class="stk-section">
                    <div class="stk-section-header interactable collapsed" tabindex="0">
                        <span>\u{1F50C} \u5171\u4EAB API \u914D\u7F6E</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body stk-hidden">
                        <!-- \u6A21\u5757\u542F\u7528/\u66F4\u65B0\u65B9\u5F0F -->
                        <div class="stk-sub-section">
                            <div class="stk-sub-header interactable" tabindex="0">
                                <span class="stk-arrow fa-solid fa-chevron-down collapsed" style="font-size:10px"></span>
                                \u{1F4CB} \u6A21\u5757\u7BA1\u7406
                            </div>
                            <div class="stk-sub-body stk-hidden">
                                ${moduleOverviewHtml}
                            </div>
                        </div>
                        <!-- API\u8BBE\u7F6E -->
                        <div class="stk-sub-section">
                            <div class="stk-sub-header interactable" tabindex="0">
                                <span class="stk-arrow fa-solid fa-chevron-down collapsed" style="font-size:10px"></span>
                                \u{1F517} API \u8FDE\u63A5
                            </div>
                            <div class="stk-sub-body stk-hidden">
                                <div class="stk-toggle">
                                    <input type="checkbox" id="stk_use_preset" ${sh.use_preset ? "checked" : ""} />
                                    <span>\u4F7F\u7528\u5F53\u524D\u9884\u8BBE</span>
                                </div>
                                <div id="stk_custom_api" style="display:${sh.use_preset ? "none" : "flex"};flex-direction:column;gap:6px;">
                                    <div class="stk-row"><label>API \u5730\u5740<input type="text" id="stk_api_url" class="text_pole" value="${sh.api_url || ""}" placeholder="http://localhost:1234/v1" /></label></div>
                                    <div class="stk-row"><label>API \u5BC6\u94A5<input type="password" id="stk_api_key" class="text_pole" value="${sh.api_key || ""}" /></label></div>
                                    <div class="stk-row"><label>\u6A21\u578B\u540D\u79F0<input type="text" id="stk_model_name" class="text_pole" value="${sh.model_name || ""}" /></label></div>
                                    <div class="stk-row" style="gap:12px">
                                        <label>\u6700\u5927token<input type="number" id="stk_max_tokens" class="text_pole" value="${sh.max_tokens}" min="256" max="8192" step="256" /></label>
                                        <label>\u6E29\u5EA6<input type="number" id="stk_temperature" class="text_pole" value="${sh.temperature}" min="0" max="2" step="0.1" /></label>
                                    </div>
                                    <div class="stk-toggle">
                                        <input type="checkbox" id="stk_stream" ${sh.stream ? "checked" : ""} />
                                        <span>\u6D41\u5F0F\u4F20\u8F93</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- \u6A21\u677F\u63D0\u793A\u8BCD -->
                <div class="stk-section">
                    <div class="stk-section-header interactable collapsed" tabindex="0">
                        <span>\u{1F4DD} \u6A21\u677F\u63D0\u793A\u8BCD\uFF08\u4E16\u754C\u4E66\uFF09</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body stk-hidden" id="stk_prompts_body">
                        <div style="font-size:11px;opacity:.6;margin-bottom:4px;">\u63D0\u793A\u8BCD\u5B58\u50A8\u5728\u4E16\u754C\u4E66\u300C${Core.WORLD_BOOK}\u300D\u4E2D\uFF0C\u4FEE\u6539\u540E\u81EA\u52A8\u540C\u6B65\u3002</div>
                        ${modules2.map((m) => {
        if (!m.templatePrompts) return "";
        return Object.entries(m.templatePrompts).map(([key, def]) => `
                                <div class="stk-sub-section">
                                    <div class="stk-sub-header interactable" tabindex="0">
                                        <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                                        ${m.name} - ${key}
                                    </div>
                                    <div class="stk-sub-body stk-hidden">
                                        <textarea id="stk_prompt_${key}" class="text_pole" rows="8" style="font-family:monospace;font-size:11px;white-space:pre;resize:vertical">${_.escape(def)}</textarea>
                                        <div class="stk-btn interactable stk_prompt_save" data-key="${key}" style="align-self:flex-end" tabindex="0">\u{1F4BE} \u4FDD\u5B58\u5230\u4E16\u754C\u4E66</div>
                                    </div>
                                </div>
                            `).join("");
      }).join("")}
                    </div>
                </div>

                <!-- \u5404\u6A21\u5757\u8BE6\u7EC6\u8BBE\u7F6E -->
                ${modulePanelsHtml}
            </div>
        </div>`;
      $("body").append(panelHtml);
      const togglePanel = () => {
        $("#stk-panel, #stk-overlay").toggleClass("open");
      };
      topBtn.on("click", togglePanel);
      $("#stk-panel-close, #stk-overlay").on("click", togglePanel);
      $("#stk-panel").on("click", ".stk-section-header", function(e) {
        e.stopPropagation();
        $(this).toggleClass("collapsed").next(".stk-section-body").toggleClass("stk-hidden");
      });
      $("#stk-panel").on("click", ".stk-sub-header", function(e) {
        e.stopPropagation();
        $(this).find(".stk-arrow").toggleClass("collapsed");
        $(this).next(".stk-sub-body").toggleClass("stk-hidden");
      });
      const save = () => Core.saveSettings();
      $("#stk_use_preset").on("change", function() {
        sh.use_preset = this.checked;
        $("#stk_custom_api").toggle(!this.checked);
        save();
      });
      $("#stk_api_url").on("input", function() {
        sh.api_url = this.value;
        save();
      });
      $("#stk_api_key").on("input", function() {
        sh.api_key = this.value;
        save();
      });
      $("#stk_model_name").on("input", function() {
        sh.model_name = this.value;
        save();
      });
      $("#stk_max_tokens").on("input", function() {
        sh.max_tokens = Number(this.value);
        save();
      });
      $("#stk_temperature").on("input", function() {
        sh.temperature = Number(this.value);
        save();
      });
      $("#stk_stream").on("change", function() {
        sh.stream = this.checked;
        save();
      });
      for (const m of modules2) {
        const ms = Core.getModuleSettings(m.id, m.defaultSettings);
        $(`#stk_mod_${m.id}_enabled`).on("change", function() {
          ms.enabled = this.checked;
          save();
        });
        if (m.defaultSettings.update_mode !== void 0) {
          $(`#stk_mod_${m.id}_mode`).on("change", function() {
            ms.update_mode = this.value;
            save();
          });
        }
      }
      $(".stk_prompt_save").on("click", async function() {
        const key = $(this).data("key");
        const content = $(`#stk_prompt_${key}`).val();
        await Core.setWorldBookEntry(key, content);
        toastr.success(`\u5DF2\u4FDD\u5B58\u5230\u4E16\u754C\u4E66`, key);
      });
      for (const m of modules2) {
        const ms = Core.getModuleSettings(m.id, m.defaultSettings);
        m.bindUI(ms, save);
      }
    }
  };

  // src/managers/StorageManager.js
  var PLUGIN_NAME2 = "smart-toolkit";
  var DB_NAME = "smart-toolkit-cache";
  var DB_VERSION = 1;
  var STORE_NAME = "config";
  var _StorageManager = class _StorageManager {
    constructor() {
      __publicField(this, "_db", null);
      __publicField(this, "_cache", /* @__PURE__ */ new Map());
      __publicField(this, "_initialized", false);
      __publicField(this, "_initPromise", null);
    }
    static getInstance() {
      if (!_StorageManager._instance) {
        _StorageManager._instance = new _StorageManager();
      }
      return _StorageManager._instance;
    }
    async init() {
      if (this._initialized) return;
      if (this._initPromise) return this._initPromise;
      this._initPromise = this._doInit();
      await this._initPromise;
      this._initPromise = null;
    }
    async _doInit() {
      const cachedData = await this._loadFromIndexedDB();
      if (cachedData) {
        for (const [key, value] of Object.entries(cachedData)) {
          this._cache.set(key, value);
        }
      }
      this._initialized = true;
    }
    async _loadFromIndexedDB() {
      return new Promise((resolve) => {
        if (!window.indexedDB) {
          resolve(null);
          return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => resolve(null);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "key" });
          }
        };
        request.onsuccess = (event) => {
          this._db = event.target.result;
          const transaction = this._db.transaction(STORE_NAME, "readonly");
          const store = transaction.objectStore(STORE_NAME);
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            const result = {};
            for (const item of getAllRequest.result) {
              result[item.key] = item.value;
            }
            resolve(result);
          };
          getAllRequest.onerror = () => resolve(null);
        };
      });
    }
    _getTavernSettings() {
      try {
        const ctx = SillyTavern?.getContext?.();
        if (ctx?.extensionSettings?.[PLUGIN_NAME2]) {
          return ctx.extensionSettings[PLUGIN_NAME2];
        }
      } catch {
      }
      return null;
    }
    _persistTavernSettings() {
      try {
        const ctx = SillyTavern?.getContext?.();
        if (ctx?.saveSettingsDebounced) {
          ctx.saveSettingsDebounced();
        }
      } catch {
      }
    }
    get(key) {
      const tavernSettings = this._getTavernSettings();
      if (tavernSettings && Object.prototype.hasOwnProperty.call(tavernSettings, key)) {
        return tavernSettings[key];
      }
      if (this._cache.has(key)) {
        return this._cache.get(key);
      }
      return null;
    }
    set(key, value) {
      const strValue = typeof value === "string" ? value : JSON.stringify(value);
      const tavernSettings = this._getTavernSettings();
      if (tavernSettings !== null) {
        tavernSettings[key] = strValue;
        this._persistTavernSettings();
      }
      this._cache.set(key, strValue);
      this._saveToIndexedDB(key, strValue);
    }
    _saveToIndexedDB(key, value) {
      if (!this._db) return;
      try {
        const transaction = this._db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.put({ key, value });
      } catch {
      }
    }
    getObject(key) {
      const value = this.get(key);
      if (value === null) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    setObject(key, value) {
      this.set(key, JSON.stringify(value));
    }
    delete(key) {
      const tavernSettings = this._getTavernSettings();
      if (tavernSettings && Object.prototype.hasOwnProperty.call(tavernSettings, key)) {
        delete tavernSettings[key];
        this._persistTavernSettings();
      }
      this._cache.delete(key);
      if (this._db) {
        try {
          const transaction = this._db.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          store.delete(key);
        } catch {
        }
      }
    }
    getModuleSettings(moduleId, defaults) {
      const settings = this.getObject(moduleId) || {};
      const result = { ...defaults };
      for (const [key, defaultValue] of Object.entries(defaults)) {
        if (settings[key] !== void 0) {
          result[key] = settings[key];
        } else {
          result[key] = JSON.parse(JSON.stringify(defaultValue));
        }
      }
      return result;
    }
    saveModuleSettings(moduleId, settings) {
      this.setObject(moduleId, settings);
    }
    getSettings() {
      return this._getTavernSettings() || {};
    }
    saveSettings() {
      this._persistTavernSettings();
    }
  };
  __publicField(_StorageManager, "_instance", null);
  var StorageManager = _StorageManager;
  var storage = StorageManager.getInstance();

  // src/managers/TemplateManager.js
  var TEMPLATES_KEY = "stk-templates";
  var ACTIVE_TEMPLATE_KEY = "stk-active-template";
  var _TemplateManager = class _TemplateManager {
    constructor() {
      __publicField(this, "templates", /* @__PURE__ */ new Map());
      __publicField(this, "activeTemplateId", null);
      __publicField(this, "onTemplateChange", null);
      this._loadTemplates();
    }
    static getInstance() {
      if (!_TemplateManager._instance) {
        _TemplateManager._instance = new _TemplateManager();
      }
      return _TemplateManager._instance;
    }
    _loadTemplates() {
      const templatesData = storage.getObject(TEMPLATES_KEY) || {};
      const activeId = storage.get(ACTIVE_TEMPLATE_KEY);
      for (const [id, template] of Object.entries(templatesData)) {
        this.templates.set(id, template);
      }
      if (activeId && this.templates.has(activeId)) {
        this.activeTemplateId = activeId;
      } else if (this.templates.size > 0) {
        this.activeTemplateId = this.templates.keys().next().value;
      }
    }
    _saveTemplates() {
      const templatesData = {};
      this.templates.forEach((template, id) => {
        templatesData[id] = template;
      });
      storage.setObject(TEMPLATES_KEY, templatesData);
      if (this.activeTemplateId) {
        storage.set(ACTIVE_TEMPLATE_KEY, this.activeTemplateId);
      }
    }
    createTemplate(options) {
      const id = options.id || `template-${Date.now()}`;
      const template = {
        id,
        name: options.name || "\u672A\u547D\u540D\u6A21\u677F",
        description: options.description || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: options.data || {},
        metadata: options.metadata || {}
      };
      this.templates.set(id, template);
      this._saveTemplates();
      return template;
    }
    getTemplate(id) {
      return this.templates.get(id);
    }
    getActiveTemplate() {
      if (!this.activeTemplateId) return null;
      return this.templates.get(this.activeTemplateId);
    }
    setActiveTemplate(id) {
      if (!this.templates.has(id)) {
        console.warn(`TemplateManager: Template ${id} not found`);
        return false;
      }
      this.activeTemplateId = id;
      this._saveTemplates();
      if (this.onTemplateChange) {
        this.onTemplateChange(this.getTemplate(id));
      }
      return true;
    }
    updateTemplate(id, updates) {
      const template = this.templates.get(id);
      if (!template) return false;
      const updatedTemplate = {
        ...template,
        ...updates,
        id: template.id,
        createdAt: template.createdAt,
        updatedAt: Date.now()
      };
      this.templates.set(id, updatedTemplate);
      this._saveTemplates();
      if (this.activeTemplateId === id && this.onTemplateChange) {
        this.onTemplateChange(updatedTemplate);
      }
      return true;
    }
    updateTemplateData(id, data) {
      return this.updateTemplate(id, { data });
    }
    deleteTemplate(id) {
      if (!this.templates.has(id)) return false;
      this.templates.delete(id);
      this._saveTemplates();
      if (this.activeTemplateId === id) {
        this.activeTemplateId = this.templates.size > 0 ? this.templates.keys().next().value : null;
        if (this.onTemplateChange) {
          this.onTemplateChange(this.getActiveTemplate());
        }
      }
      return true;
    }
    duplicateTemplate(id, newName) {
      const template = this.templates.get(id);
      if (!template) return null;
      return this.createTemplate({
        name: newName || `${template.name} (\u526F\u672C)`,
        description: template.description,
        data: JSON.parse(JSON.stringify(template.data)),
        metadata: JSON.parse(JSON.stringify(template.metadata))
      });
    }
    getAllTemplates() {
      const result = [];
      this.templates.forEach((template) => {
        result.push(template);
      });
      return result.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    exportTemplate(id) {
      const template = this.templates.get(id);
      if (!template) return null;
      return JSON.stringify({
        version: "1.0",
        exportedAt: Date.now(),
        template: {
          name: template.name,
          description: template.description,
          data: template.data,
          metadata: template.metadata
        }
      }, null, 2);
    }
    importTemplate(jsonString) {
      try {
        const imported = JSON.parse(jsonString);
        if (!imported.template || !imported.template.data) {
          throw new Error("Invalid template format");
        }
        return this.createTemplate({
          name: imported.template.name || "\u5BFC\u5165\u7684\u6A21\u677F",
          description: imported.template.description || "",
          data: imported.template.data,
          metadata: imported.template.metadata || {}
        });
      } catch (error) {
        console.error("TemplateManager: Import failed", error);
        return null;
      }
    }
    exportAllTemplates() {
      const exportData = {
        version: "1.0",
        exportedAt: Date.now(),
        templates: []
      };
      this.templates.forEach((template) => {
        exportData.templates.push({
          id: template.id,
          name: template.name,
          description: template.description,
          data: template.data,
          metadata: template.metadata
        });
      });
      return JSON.stringify(exportData, null, 2);
    }
    importAllTemplates(jsonString, merge = true) {
      try {
        const imported = JSON.parse(jsonString);
        if (!imported.templates || !Array.isArray(imported.templates)) {
          throw new Error("Invalid templates format");
        }
        if (!merge) {
          this.templates.clear();
        }
        let importedCount = 0;
        for (const templateData of imported.templates) {
          if (templateData.data) {
            this.createTemplate({
              id: merge ? void 0 : templateData.id,
              name: templateData.name,
              description: templateData.description,
              data: templateData.data,
              metadata: templateData.metadata
            });
            importedCount++;
          }
        }
        this._saveTemplates();
        return importedCount;
      } catch (error) {
        console.error("TemplateManager: Import all failed", error);
        return 0;
      }
    }
    async syncToWorldBook(templateId, worldBookData) {
      const template = this.templates.get(templateId);
      if (!template) return false;
      template.data = {
        ...template.data,
        worldBook: worldBookData
      };
      template.updatedAt = Date.now();
      this._saveTemplates();
      return true;
    }
    getTemplateCount() {
      return this.templates.size;
    }
    searchTemplates(query) {
      const lowerQuery = query.toLowerCase();
      const results = [];
      this.templates.forEach((template) => {
        if (template.name.toLowerCase().includes(lowerQuery) || template.description.toLowerCase().includes(lowerQuery)) {
          results.push(template);
        }
      });
      return results.sort((a, b) => b.updatedAt - a.updatedAt);
    }
  };
  __publicField(_TemplateManager, "_instance", null);
  var TemplateManager = _TemplateManager;
  var templateManager = TemplateManager.getInstance();

  // src/components/WindowManager.js
  var WINDOW_STATE_KEY = "stk-window-states";
  var _WindowManager = class _WindowManager {
    constructor() {
      __publicField(this, "windows", /* @__PURE__ */ new Map());
      __publicField(this, "topZIndex", 1e3);
      __publicField(this, "activeWindowId", null);
      this._loadStates();
    }
    static getInstance() {
      if (!_WindowManager._instance) {
        _WindowManager._instance = new _WindowManager();
      }
      return _WindowManager._instance;
    }
    _loadStates() {
      const states = storage.getObject(WINDOW_STATE_KEY) || {};
      if (states.topZIndex) {
        this.topZIndex = states.topZIndex;
      }
    }
    _saveStates() {
      const states = {
        topZIndex: this.topZIndex,
        windows: {}
      };
      this.windows.forEach((win, id) => {
        if (win.persistState) {
          states.windows[id] = {
            position: win.position,
            size: win.size,
            collapsed: win.collapsed
          };
        }
      });
      storage.setObject(WINDOW_STATE_KEY, states);
    }
    register(windowInstance) {
      const id = windowInstance.id;
      if (this.windows.has(id)) {
        console.warn(`WindowManager: Window ${id} already registered`);
        return;
      }
      this.windows.set(id, windowInstance);
      const savedState = this._getSavedWindowState(id);
      if (savedState && windowInstance.persistState) {
        windowInstance.restoreState(savedState);
      }
      this._bindWindowEvents(windowInstance);
    }
    _getSavedWindowState(id) {
      const states = storage.getObject(WINDOW_STATE_KEY) || {};
      return states.windows ? states.windows[id] : null;
    }
    _bindWindowEvents(windowInstance) {
      const originalOnFocus = windowInstance.onFocus;
      windowInstance.onFocus = () => {
        this.bringToFront(windowInstance.id);
        if (originalOnFocus) originalOnFocus.call(windowInstance);
      };
      const originalOnClose = windowInstance.onClose;
      windowInstance.onClose = () => {
        this.unregister(windowInstance.id);
        if (originalOnClose) originalOnClose.call(windowInstance);
      };
    }
    unregister(id) {
      if (this.windows.has(id)) {
        const win = this.windows.get(id);
        if (win.persistState) {
          this._saveStates();
        }
        this.windows.delete(id);
        if (this.activeWindowId === id) {
          this.activeWindowId = null;
        }
      }
    }
    bringToFront(id) {
      const win = this.windows.get(id);
      if (!win) return;
      this.topZIndex++;
      win.setZIndex(this.topZIndex);
      this.activeWindowId = id;
      this.windows.forEach((w, wid) => {
        if (wid !== id && w.$el) {
          w.$el.removeClass("stk-window-active");
        }
      });
      if (win.$el) {
        win.$el.addClass("stk-window-active");
      }
    }
    getWindow(id) {
      return this.windows.get(id);
    }
    hideAll() {
      this.windows.forEach((win) => {
        if (win.hide) {
          win.hide();
        }
      });
    }
    showAll() {
      this.windows.forEach((win) => {
        if (win.show) {
          win.show();
        }
      });
    }
    closeAll() {
      const windowsToClose = Array.from(this.windows.values());
      windowsToClose.forEach((win) => {
        if (win.close) {
          win.close();
        }
      });
    }
    getActiveWindow() {
      return this.activeWindowId ? this.windows.get(this.activeWindowId) : null;
    }
    saveAllStates() {
      this._saveStates();
    }
  };
  __publicField(_WindowManager, "_instance", null);
  var WindowManager = _WindowManager;
  var windowManager = WindowManager.getInstance();

  // src/components/DraggableWindow.js
  var DraggableWindow = class {
    constructor(options) {
      this.id = options.id || `stk-window-${Date.now()}`;
      this.title = options.title || "";
      this.content = options.content || "";
      this.width = options.width || 340;
      this.height = options.height || "auto";
      this.minWidth = options.minWidth || 200;
      this.minHeight = options.minHeight || 100;
      this.position = options.position || { x: null, y: null };
      this.anchor = options.anchor || "bottom-right";
      this.offset = options.offset || { x: 20, y: 20 };
      this.resizable = options.resizable !== false;
      this.draggable = options.draggable !== false;
      this.showClose = options.showClose !== false;
      this.showMinimize = options.showMinimize || false;
      this.persistState = options.persistState !== false;
      this.onShow = options.onShow || null;
      this.onHide = options.onHide || null;
      this.onClose = options.onClose || null;
      this.onFocus = options.onFocus || null;
      this.onResize = options.onResize || null;
      this.className = options.className || "";
      this.$el = null;
      this.$header = null;
      this.$body = null;
      this.isVisible = false;
      this.collapsed = false;
      this.size = { width: this.width, height: this.height };
      this._dragOffset = { x: 0, y: 0 };
      this._isDragging = false;
      this._isResizing = false;
    }
    render() {
      const positionStyle = this._calculatePosition();
      const sizeStyle = `width: ${this.size.width}px;`;
      const heightStyle = this.size.height !== "auto" ? `height: ${this.size.height}px;` : "";
      const resizeClass = this.resizable ? "stk-window-resizable" : "";
      const customClass = this.className ? ` ${this.className}` : "";
      const minimizeBtnHtml = this.showMinimize ? '<button class="stk-window-btn stk-window-minimize interactable" tabindex="0"><span class="fa-solid fa-minus"></span></button>' : "";
      const closeBtnHtml = this.showClose ? '<button class="stk-window-btn stk-window-close interactable" tabindex="0"><span class="fa-solid fa-xmark"></span></button>' : "";
      return `
            <div class="stk-window ${resizeClass}${customClass}" id="${this.id}" style="${positionStyle}${sizeStyle}${heightStyle}">
                <div class="stk-window-header interactable">
                    <span class="stk-window-title">${this.title}</span>
                    <div class="stk-window-buttons">
                        ${minimizeBtnHtml}
                        ${closeBtnHtml}
                    </div>
                </div>
                <div class="stk-window-body">
                    ${typeof this.content === "string" ? this.content : ""}
                </div>
                ${this.resizable ? '<div class="stk-window-resize-handle"></div>' : ""}
            </div>
        `;
    }
    _calculatePosition() {
      if (this.position.x !== null && this.position.y !== null) {
        return `left: ${this.position.x}px; top: ${this.position.y}px;`;
      }
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = this.size.width;
      const height = typeof this.size.height === "number" ? this.size.height : 300;
      let x, y;
      switch (this.anchor) {
        case "top-left":
          x = this.offset.x;
          y = this.offset.y;
          break;
        case "top-right":
          x = viewportWidth - width - this.offset.x;
          y = this.offset.y;
          break;
        case "bottom-left":
          x = this.offset.x;
          y = viewportHeight - height - this.offset.y;
          break;
        case "bottom-right":
        default:
          x = viewportWidth - width - this.offset.x;
          y = viewportHeight - height - this.offset.y;
          break;
        case "center":
          x = (viewportWidth - width) / 2;
          y = (viewportHeight - height) / 2;
          break;
      }
      this.position = { x: Math.max(0, x), y: Math.max(0, y) };
      return `left: ${this.position.x}px; top: ${this.position.y}px;`;
    }
    show(parentSelector = "body") {
      if (this.$el) {
        this.$el.removeClass("stk-window-hidden");
        this.isVisible = true;
        windowManager.bringToFront(this.id);
        if (this.onShow) this.onShow();
        return;
      }
      const html = this.render();
      $(parentSelector).append(html);
      this.$el = $(`#${this.id}`);
      this.$header = this.$el.find(".stk-window-header");
      this.$body = this.$el.find(".stk-window-body");
      this._bindEvents();
      windowManager.register(this);
      windowManager.bringToFront(this.id);
      this.isVisible = true;
      if (this.onShow) {
        this.onShow();
      }
    }
    _bindEvents() {
      this.$header.on("mousedown", (e) => {
        if ($(e.target).closest(".stk-window-buttons").length) return;
        if (!this.draggable) return;
        this._isDragging = true;
        this._dragOffset = {
          x: e.clientX - this.position.x,
          y: e.clientY - this.position.y
        };
        this.$el.addClass("stk-window-dragging");
        $(document).on("mousemove.stk-window", (e2) => {
          if (!this._isDragging) return;
          this.position.x = e2.clientX - this._dragOffset.x;
          this.position.y = e2.clientY - this._dragOffset.y;
          this.position.x = Math.max(0, Math.min(this.position.x, window.innerWidth - this.$el.outerWidth()));
          this.position.y = Math.max(0, Math.min(this.position.y, window.innerHeight - this.$el.outerHeight()));
          this.$el.css({
            left: this.position.x,
            top: this.position.y
          });
        });
        $(document).on("mouseup.stk-window", () => {
          this._isDragging = false;
          this.$el.removeClass("stk-window-dragging");
          $(document).off("mousemove.stk-window mouseup.stk-window");
          windowManager.saveAllStates();
        });
      });
      this.$header.on("click", () => {
        windowManager.bringToFront(this.id);
        if (this.onFocus) this.onFocus();
      });
      this.$el.find(".stk-window-close").on("click", () => {
        this.close();
      });
      this.$el.find(".stk-window-minimize").on("click", () => {
        this.toggleCollapse();
      });
      if (this.resizable) {
        const $handle = this.$el.find(".stk-window-resize-handle");
        $handle.on("mousedown", (e) => {
          e.preventDefault();
          this._isResizing = true;
          const startX = e.clientX;
          const startY = e.clientY;
          const startWidth = this.$el.outerWidth();
          const startHeight = this.$el.outerHeight();
          $(document).on("mousemove.stk-resize", (e2) => {
            if (!this._isResizing) return;
            const newWidth = Math.max(this.minWidth, startWidth + (e2.clientX - startX));
            const newHeight = Math.max(this.minHeight, startHeight + (e2.clientY - startY));
            this.size.width = newWidth;
            this.size.height = newHeight;
            this.$el.css({
              width: newWidth,
              height: newHeight
            });
          });
          $(document).on("mouseup.stk-resize", () => {
            this._isResizing = false;
            $(document).off("mousemove.stk-resize mouseup.stk-resize");
            windowManager.saveAllStates();
            if (this.onResize) this.onResize(this.size);
          });
        });
      }
    }
    hide() {
      if (this.$el) {
        this.$el.addClass("stk-window-hidden");
        this.isVisible = false;
        if (this.onHide) {
          this.onHide();
        }
      }
    }
    close() {
      if (this.onClose) {
        this.onClose();
      }
      if (this.$el) {
        this.$el.remove();
        this.$el = null;
        this.$header = null;
        this.$body = null;
        this.isVisible = false;
      }
      windowManager.unregister(this.id);
    }
    toggleCollapse() {
      this.collapsed = !this.collapsed;
      if (this.$el) {
        this.$el.toggleClass("stk-window-collapsed", this.collapsed);
      }
    }
    setContent(content) {
      this.content = content;
      if (this.$body) {
        this.$body.html(typeof content === "string" ? content : "");
      }
    }
    setTitle(title) {
      this.title = title;
      if (this.$header) {
        this.$header.find(".stk-window-title").text(title);
      }
    }
    setZIndex(zIndex) {
      if (this.$el) {
        this.$el.css("z-index", zIndex);
      }
    }
    restoreState(state) {
      if (state.position) {
        this.position = state.position;
      }
      if (state.size) {
        this.size = state.size;
      }
      if (state.collapsed !== void 0) {
        this.collapsed = state.collapsed;
      }
    }
    getState() {
      return {
        position: { ...this.position },
        size: { ...this.size },
        collapsed: this.collapsed
      };
    }
    destroy() {
      this.close();
    }
  };

  // src/modules/statusbar.js
  var STATUS_REGEX = /<StatusBlock>([\s\S]*?)<\/StatusBlock>/i;
  var STATUS_FULL_REGEX = /<StatusBlock>[\s\S]*?<\/StatusBlock>/i;
  var PLACEHOLDER = "<StatusBarPlaceholder/>";
  var DEFAULT_SYSTEM_PROMPT = `\u4F60\u662F\u72B6\u6001\u680F\u751F\u6210\u5668\u3002\u6839\u636E\u6B63\u6587\u548C\u4E0A\u8F6E\u72B6\u6001\u8F93\u51FA\u66F4\u65B0\u540E\u7684\u72B6\u6001\u680F\u3002
\u89C4\u5219\uFF1A\u6BCF\u5B57\u6BB5\u72EC\u7ACB\u5B8C\u6574\u586B\u5199\uFF0C\u7981\u6B62\u4F7F\u7528"\u540C\u4E0A""\u65E0\u53D8\u5316"\u7B49\u7701\u7565\u3002\u53EA\u8F93\u51FA <StatusBlock>...</StatusBlock>\uFF0C\u4E0D\u8F93\u51FA\u5176\u4ED6\u5185\u5BB9\u3002

\u8F93\u51FA\u683C\u5F0F\uFF1A
<StatusBlock>
<environment>
\u23F0 [\u661F\u671F]-[\u5E74/\u6708/\u65E5]-[\u65F6:\u5206] | \u{1F4CD} [\u4F4D\u7F6E-\u573A\u6240] | \u{1F324}\uFE0F [\u5929\u6C14/\u4F53\u611F/\u6E29\u5EA6]
</environment>
<charInspect>
\u{1F3AC} \u573A\u666F\u52A8\u6001\uFF1A[\u7B2C\u4E09\u4EBA\u79F0\u4E09\u89C6\u56FE\u63CF\u8FF0\u89D2\u8272\u5728\u573A\u666F\u4E2D\u7684\u753B\u9762]
\u{1F464} \u9762\u90E8\uFF1A[\u8868\u60C5/\u773C\u795E/\u5634\u5507/\u8138\u988A\u7B49]
\u{1F9B5} \u817F\u90E8\uFF1A[\u5927\u817F/\u819D\u76D6/\u5C0F\u817F/\u7AD9\u59FF]
\u{1F9B6} \u8DB3\u90E8\uFF1A[\u811A\u638C/\u811A\u8DBE/\u978B\u889C\u72B6\u6001]
\u{1F4AB} \u80CC\u90E8\uFF1A[\u810A\u690E/\u80A9\u80DB\u9AA8/\u8170\u7A9D/\u76AE\u80A4]
\u{1F352} \u80F8\u90E8\uFF1A[\u5F62\u6001/\u72B6\u6001/\u654F\u611F\u5EA6/\u8863\u7269\u906E\u853D]
\u{1F351} \u6027\u5668\uFF1A[\u5916\u89C2/\u6E7F\u6DA6\u5EA6/\u654F\u611F\u5EA6/\u8863\u7269\u906E\u853D]
\u{1F351} \u81C0\u90E8\uFF1A[\u5F62\u72B6/\u8863\u7269\u5305\u88F9/\u808C\u8089\u72B6\u6001]
\u{1F338} \u540E\u5EAD\uFF1A[\u62EC\u7EA6\u808C/\u6DA6\u6ED1\u5EA6/\u6269\u5F20\u5EA6]
\u{1F9B4} \u7279\u6B8A\u90E8\u4F4D\uFF1A[\u5C3E\u5DF4/\u7FC5\u8180/\u517D\u8033\u7B49\uFF0C\u65E0\u5219\u5199"\u65E0"]
</charInspect>
<vital>
\u{1F6BD} \u8180\u80F1\uFF1A[XX]/100\uFF5C[\u5C3F\u610F\u611F\u53D7]
\u{1F60A} \u60C5\u7EEA\uFF1A[\u4E3B\u5BFC+\u6B21\u8981\u60C5\u7EEA]\uFF5C[\u5FAE\u8868\u60C5]
\u{1FA78} \u751F\u7406\u671F\uFF1A[\u72B6\u6001]
</vital>
<equipment>
\u{1F454} \u4E0A\u8863\uFF1A[\u6B3E\u5F0F+\u989C\u8272+\u5B8C\u6574\u5EA6+\u6E7F\u6DA6\u5EA6]
\u{1F459} \u80F8\u8863\uFF1A[\u6B3E\u5F0F+\u989C\u8272+\u4F4D\u7F6E+\u906E\u853D\u5EA6]
\u{1F456} \u4E0B\u88C5\uFF1A[\u6B3E\u5F0F+\u989C\u8272+\u72B6\u6001+\u8936\u76B1+\u6C61\u6E0D]
\u{1FA72} \u5185\u88E4\uFF1A[\u6B3E\u5F0F+\u989C\u8272+\u4F4D\u7F6E\u504F\u79FB+\u6E7F\u6DA6\u5EA6]
\u{1F9E6} \u817F\u889C\uFF1A[\u7C7B\u578B+\u989C\u8272+\u957F\u5EA6+\u7834\u635F]
\u{1F460} \u978B\u5C65\uFF1A[\u7C7B\u578B+\u989C\u8272+\u7A7F\u7740\u72B6\u6001]
\u{1F380} \u914D\u9970\uFF1A[\u9970\u54C1/\u9053\u5177]
\u{1F579}\uFE0F \u6027\u9053\u5177\uFF1A[\u540D\u79F0+\u4F4D\u7F6E+\u72B6\u6001+\u6863\u4F4D\uFF0C\u65E0\u5219\u5199"\u65E0"]
</equipment>
</StatusBlock>`;
  var SECTIONS = ["environment", "charInspect", "vital", "equipment"];
  var _settingsWindow = null;
  var _previewWindow = null;
  var _processing = false;
  function parseBlock(text) {
    const match = text.match(STATUS_REGEX);
    if (!match) return null;
    const raw = match[1].trim();
    const result = { raw };
    for (const sec of SECTIONS) {
      const m = raw.match(new RegExp("<" + sec + ">([\\s\\S]*?)<\\/" + sec + ">", "i"));
      result[sec] = m ? m[1].trim() : "";
    }
    return result;
  }
  function getStatusData(msgId) {
    const msg = Core.getChat()[msgId];
    if (!msg) return null;
    return _.get(msg, ["extra", "statusbar", msg.swipe_id ?? 0], null);
  }
  function setStatusData(msgId, data) {
    const msg = Core.getChat()[msgId];
    if (!msg) return;
    if (!msg.extra) msg.extra = {};
    _.set(msg, ["extra", "statusbar", msg.swipe_id ?? 0], data);
  }
  function getLastStatus(beforeId) {
    const chat = Core.getChat();
    for (let i = beforeId; i >= 0; i--) {
      let data = getStatusData(i);
      if (data) return data;
      const msg = chat[i];
      if (msg?.mes) {
        data = parseBlock(msg.mes);
        if (data) {
          setStatusData(i, data);
          return data;
        }
      }
    }
    return null;
  }
  function showSettingsWindow(settings, save) {
    if (_settingsWindow) {
      _settingsWindow.bringToFront();
      return;
    }
    const content = `
        <div class="stk-settings-content">
            <div class="stk-section">
                <div class="stk-section-title">\u2699\uFE0F \u8BF7\u6C42\u8BBE\u7F6E</div>
                <div class="stk-toggle">
                    <input type="checkbox" id="sb_auto_new" ${settings.auto_request ? "checked" : ""} />
                    <span>\u81EA\u52A8\u8BF7\u6C42</span>
                </div>
                <div class="stk-row">
                    <label>\u8BF7\u6C42\u65B9\u5F0F
                        <select id="sb_reqmode_new" class="text_pole">
                            <option value="sequential"${settings.request_mode === "sequential" ? " selected" : ""}>\u4F9D\u6B21\u91CD\u8BD5</option>
                            <option value="parallel"${settings.request_mode === "parallel" ? " selected" : ""}>\u540C\u65F6\u8BF7\u6C42</option>
                            <option value="hybrid"${settings.request_mode === "hybrid" ? " selected" : ""}>\u5148\u4E00\u6B21\u540E\u5E76\u884C</option>
                        </select>
                    </label>
                </div>
                <div class="stk-row">
                    <label>\u91CD\u8BD5\u6B21\u6570
                        <input type="number" id="sb_retries_new" class="text_pole" value="${settings.retry_count}" min="1" max="10" />
                    </label>
                </div>
                <div class="stk-toggle">
                    <input type="checkbox" id="sb_notification_new" ${settings.notification ? "checked" : ""} />
                    <span>\u663E\u793A\u901A\u77E5</span>
                </div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u2702\uFE0F \u5185\u5BB9\u5904\u7406</div>
                <div class="stk-row">
                    <label>\u6B63\u6587\u6807\u7B7E\u540D <span>(\u7A7A=\u4E0D\u63D0\u53D6)</span>
                        <input type="text" id="sb_tag_new" class="text_pole" value="${settings.content_tag || ""}" />
                    </label>
                </div>
                <div class="stk-row">
                    <label>\u6E05\u7406\u6B63\u5219 <span>(\u6BCF\u884C\u4E00\u4E2A)</span>
                        <textarea id="sb_cleanup_new" class="text_pole" rows="4">${(settings.cleanup_patterns || []).join("\n")}</textarea>
                    </label>
                </div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u{1F527} \u64CD\u4F5C</div>
                <div class="stk-btn stk-sb-retry-btn" style="text-align:center">\u{1F504} \u624B\u52A8\u751F\u6210/\u91CD\u8BD5</div>
                <div class="stk-btn stk-sb-test-btn" style="text-align:center;margin-top:8px">\u{1F9EA} \u6D4B\u8BD5\u63D0\u53D6</div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u{1F4CB} \u6A21\u677F\u7BA1\u7406</div>
                <div class="stk-row">
                    <select id="sb_template_select" class="text_pole" style="width:100%">
                        <option value="">-- \u9009\u62E9\u6A21\u677F --</option>
                    </select>
                </div>
                <div class="stk-row stk-template-actions">
                    <button class="stk-btn stk-sb-save-template" style="flex:1">\u4FDD\u5B58\u4E3A\u6A21\u677F</button>
                    <button class="stk-btn stk-sb-export-template" style="flex:1">\u5BFC\u51FA</button>
                </div>
            </div>
        </div>
    `;
    _settingsWindow = new DraggableWindow({
      id: "stk-statusbar-settings",
      title: "\u{1F4CA} \u72B6\u6001\u680F\u8BBE\u7F6E",
      content,
      width: 400,
      height: "auto",
      anchor: "top-right",
      offset: { x: 20, y: 150 },
      persistState: true,
      showClose: true,
      showMinimize: false,
      className: "stk-settings-window",
      onClose: () => {
        _settingsWindow = null;
      }
    });
    _settingsWindow.show();
    const templates = templateManager.getAllTemplates().filter((t) => t.metadata.module === "statusbar");
    const $select = _settingsWindow.$body.find("#sb_template_select");
    templates.forEach((t) => {
      $select.append(`<option value="${t.id}">${t.name}</option>`);
    });
    const activeTemplate = templateManager.getActiveTemplate();
    if (activeTemplate && activeTemplate.metadata.module === "statusbar") {
      $select.val(activeTemplate.id);
    }
    _settingsWindow.$body.find("#sb_auto_new").on("change", function() {
      settings.auto_request = this.checked;
      save();
    });
    _settingsWindow.$body.find("#sb_reqmode_new").on("change", function() {
      settings.request_mode = this.value;
      save();
    });
    _settingsWindow.$body.find("#sb_retries_new").on("input", function() {
      settings.retry_count = Number(this.value);
      save();
    });
    _settingsWindow.$body.find("#sb_notification_new").on("change", function() {
      settings.notification = this.checked;
      save();
    });
    _settingsWindow.$body.find("#sb_tag_new").on("input", function() {
      settings.content_tag = this.value.trim();
      save();
    });
    _settingsWindow.$body.find("#sb_cleanup_new").on("input", function() {
      settings.cleanup_patterns = this.value.split("\n").map((l) => l.trim()).filter(Boolean);
      save();
    });
    const self = StatusBarModule;
    _settingsWindow.$body.find(".stk-sb-retry-btn").on("click", async () => {
      const lastId = Core.getLastMessageId();
      if (lastId < 0) {
        toastr.warning("\u6CA1\u6709\u6D88\u606F", "[StatusBar]");
        return;
      }
      await self._runExtra(lastId, settings);
    });
    _settingsWindow.$body.find(".stk-sb-test-btn").on("click", () => {
      self._showTestResult(settings);
    });
    _settingsWindow.$body.find("#sb_template_select").on("change", function() {
      const templateId = this.value;
      if (templateId) {
        templateManager.setActiveTemplate(templateId);
      }
    });
    _settingsWindow.$body.find(".stk-sb-save-template").on("click", () => {
      self._saveCurrentPromptAsTemplate();
    });
    _settingsWindow.$body.find(".stk-sb-export-template").on("click", () => {
      const active = templateManager.getActiveTemplate();
      if (active && active.metadata.module === "statusbar") {
        const json = templateManager.exportTemplate(active.id);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${active.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toastr.success("\u6A21\u677F\u5DF2\u5BFC\u51FA", "[StatusBar]");
      } else {
        toastr.warning("\u6CA1\u6709\u6D3B\u52A8\u6A21\u677F", "[StatusBar]");
      }
    });
  }
  var StatusBarModule = {
    id: "statusbar",
    name: "\u{1F4CA} \u72B6\u6001\u680F",
    defaultSettings: {
      enabled: true,
      update_mode: "extra_model",
      auto_request: true,
      retry_count: 3,
      request_mode: "sequential",
      content_tag: "",
      cleanup_patterns: [
        "<StatusBlock>[\\s\\S]*?</StatusBlock>",
        "<StatusBarPlaceholder/>",
        "<UpdateVariable>[\\s\\S]*?</UpdateVariable>",
        "<StatusPlaceHolderImpl/>",
        "<auxiliary_tool>[\\s\\S]*?</auxiliary_tool>"
      ],
      notification: true
    },
    templatePrompts: {
      statusbar_system_prompt: DEFAULT_SYSTEM_PROMPT
    },
    init() {
      this._initDefaultTemplate();
    },
    _initDefaultTemplate() {
      const templates = templateManager.getAllTemplates();
      const hasDefault = templates.some((t) => t.metadata.isDefault && t.metadata.module === "statusbar");
      if (!hasDefault) {
        templateManager.createTemplate({
          id: "default-statusbar",
          name: "\u9ED8\u8BA4\u72B6\u6001\u680F",
          description: "\u9ED8\u8BA4\u7684\u72B6\u6001\u680F\u63D0\u793A\u8BCD\u6A21\u677F",
          data: {
            prompt: DEFAULT_SYSTEM_PROMPT
          },
          metadata: {
            isDefault: true,
            module: "statusbar"
          }
        });
      }
    },
    async onMessage(messageId) {
      const s = Core.getModuleSettings(this.id, this.defaultSettings);
      if (!s.enabled || _processing) return;
      const msg = Core.getChat()[messageId];
      if (!msg || msg.is_user) return;
      _processing = true;
      try {
        const hasInline = this._processInline(messageId);
        if (!hasInline && s.update_mode === "extra_model" && s.auto_request) {
          await this._runExtra(messageId, s);
        }
      } finally {
        _processing = false;
      }
    },
    onChatReady(data) {
      const s = Core.getModuleSettings(this.id, this.defaultSettings);
      if (!s.enabled || !data?.messages) return;
      for (const m of data.messages) {
        if (typeof m.content === "string") m.content = m.content.replace(PLACEHOLDER, "");
      }
    },
    _processInline(msgId) {
      const msg = Core.getChat()[msgId];
      if (!msg?.mes) return false;
      const data = parseBlock(msg.mes);
      if (!data) return false;
      setStatusData(msgId, data);
      if (msg.mes.indexOf(PLACEHOLDER) === -1) msg.mes += "\n\n" + PLACEHOLDER;
      SillyTavern.getContext().saveChat();
      return true;
    },
    async _getSystemPrompt() {
      const activeTemplate = templateManager.getActiveTemplate();
      if (activeTemplate && activeTemplate.metadata.module === "statusbar" && activeTemplate.data.prompt) {
        return activeTemplate.data.prompt;
      }
      const wb = await Core.getWorldBookEntry("statusbar_system_prompt");
      return wb || DEFAULT_SYSTEM_PROMPT;
    },
    async _runExtra(msgId, settings) {
      const msg = Core.getChat()[msgId];
      if (!msg) return;
      if (settings.notification) toastr.info("\u6B63\u5728\u751F\u6210\u72B6\u6001\u680F...", "[StatusBar]");
      const content = Core.extractContent(msg.mes || "", {
        contentTag: settings.content_tag,
        cleanupPatterns: settings.cleanup_patterns
      });
      const prev = getLastStatus(msgId - 1);
      const prevBlock = prev ? "<PreviousStatus>\n<StatusBlock>\n" + prev.raw + "\n</StatusBlock>\n</PreviousStatus>" : "<PreviousStatus>\u65E0</PreviousStatus>";
      const userMessage = prevBlock + "\n\n<CurrentContent>\n" + content + "\n</CurrentContent>\n\n\u8BF7\u751F\u6210\u66F4\u65B0\u540E\u7684\u72B6\u6001\u680F\u3002";
      const systemPrompt = await this._getSystemPrompt();
      const api = UI.getSharedAPI();
      const result = await Core.requestExtraModel({
        systemPrompt,
        userMessage,
        api,
        validate: parseBlock,
        retries: settings.retry_count,
        requestMode: settings.request_mode,
        onRetry: (i, max) => {
          if (settings.notification) toastr.info(`\u91CD\u8BD5 ${i}/${max}`, "[StatusBar]");
        }
      });
      if (result) {
        setStatusData(msgId, result);
        let text = (msg.mes || "").replace(STATUS_FULL_REGEX, "").replace(PLACEHOLDER, "").trimEnd();
        text += "\n\n<StatusBlock>\n" + result.raw + "\n</StatusBlock>\n\n" + PLACEHOLDER;
        msg.mes = text;
        const ctx = SillyTavern.getContext();
        if (typeof ctx.setChatMessages === "function") {
          await ctx.setChatMessages([{ message_id: msgId, message: text }], { refresh: "affected" });
        } else {
          ctx.saveChat();
        }
        if (settings.notification) toastr.success("\u72B6\u6001\u680F\u5DF2\u66F4\u65B0", "[StatusBar]");
      } else {
        if (settings.notification) toastr.error("\u72B6\u6001\u680F\u751F\u6210\u5931\u8D25", "[StatusBar]");
      }
    },
    async _saveCurrentPromptAsTemplate() {
      const currentPrompt = await this._getSystemPrompt();
      const name = prompt("\u8F93\u5165\u6A21\u677F\u540D\u79F0:", `\u72B6\u6001\u680F\u6A21\u677F ${Date.now()}`);
      if (!name) return;
      templateManager.createTemplate({
        name,
        description: "\u7528\u6237\u521B\u5EFA\u7684\u72B6\u6001\u680F\u6A21\u677F",
        data: {
          prompt: currentPrompt
        },
        metadata: {
          module: "statusbar"
        }
      });
      toastr.success("\u6A21\u677F\u5DF2\u4FDD\u5B58", "[StatusBar]");
      if (_settingsWindow) {
        const $select = _settingsWindow.$body.find("#sb_template_select");
        $select.empty().append('<option value="">-- \u9009\u62E9\u6A21\u677F --</option>');
        templateManager.getAllTemplates().filter((t) => t.metadata.module === "statusbar").forEach((t) => {
          $select.append(`<option value="${t.id}">${t.name}</option>`);
        });
      }
    },
    _showTestResult(settings) {
      const chat = Core.getChat();
      const last = chat[chat.length - 1];
      if (!last) {
        toastr.warning("\u6CA1\u6709\u6D88\u606F", "[StatusBar]");
        return;
      }
      const original = last.mes || "";
      const extracted = Core.extractContent(original, { contentTag: settings.content_tag, cleanupPatterns: settings.cleanup_patterns });
      const prev = getLastStatus(chat.length - 2);
      const prevText = prev ? prev.raw.substring(0, 200) + "..." : "(\u65E0)";
      const ratio = Math.round((1 - extracted.length / Math.max(original.length, 1)) * 100);
      if (_previewWindow) {
        _previewWindow.close();
        _previewWindow = null;
      }
      const previewContent = `
            <div class="stk-preview-content" style="font-family:monospace;white-space:pre-wrap;">
                <h4>\u{1F4C4} \u539F\u6587 (${original.length} \u5B57\u7B26)</h4>
                <div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">${_.escape(original.substring(0, 500))}${original.length > 500 ? "\n...(\u622A\u65AD)" : ""}</div>
                <h4>\u2702\uFE0F \u63D0\u53D6\u540E (${extracted.length} \u5B57\u7B26, \u8282\u7701 ${ratio}%)</h4>
                <div style="background:rgba(0,100,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">${_.escape(extracted.substring(0, 500))}${extracted.length > 500 ? "\n...(\u622A\u65AD)" : ""}</div>
                <h4>\u{1F4CA} \u4E0A\u8F6E\u72B6\u6001\u680F</h4>
                <div style="background:rgba(0,0,100,0.2);padding:8px;border-radius:6px;max-height:10vh;overflow:auto;">${_.escape(prevText)}</div>
            </div>
        `;
      _previewWindow = new DraggableWindow({
        id: "stk-statusbar-preview",
        title: "\u{1F9EA} \u63D0\u53D6\u6D4B\u8BD5\u7ED3\u679C",
        content: previewContent,
        width: 500,
        height: "auto",
        anchor: "center",
        persistState: false,
        showClose: true,
        showMinimize: false,
        className: "stk-preview-window",
        onClose: () => {
          _previewWindow = null;
        }
      });
      _previewWindow.show();
    },
    renderUI(s) {
      return `
            <div class="stk-sub-section">
                <div class="stk-sub-header interactable" tabindex="0">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u2699\uFE0F \u8BF7\u6C42\u8BBE\u7F6E
                </div>
                <div class="stk-sub-body">
                    <div class="stk-toggle"><input type="checkbox" id="sb_auto" ${s.auto_request ? "checked" : ""} /><span>\u81EA\u52A8\u8BF7\u6C42</span></div>
                    <div class="stk-row"><label>\u8BF7\u6C42\u65B9\u5F0F<select id="sb_reqmode" class="text_pole">
                        <option value="sequential"${s.request_mode === "sequential" ? " selected" : ""}>\u4F9D\u6B21\u91CD\u8BD5</option>
                        <option value="parallel"${s.request_mode === "parallel" ? " selected" : ""}>\u540C\u65F6\u8BF7\u6C42</option>
                        <option value="hybrid"${s.request_mode === "hybrid" ? " selected" : ""}>\u5148\u4E00\u6B21\u540E\u5E76\u884C</option>
                    </select></label></div>
                    <div class="stk-row"><label>\u91CD\u8BD5\u6B21\u6570<input type="number" id="sb_retries" class="text_pole" value="${s.retry_count}" min="1" max="10" /></label></div>
                    <div class="stk-toggle"><input type="checkbox" id="sb_notification" ${s.notification ? "checked" : ""} /><span>\u663E\u793A\u901A\u77E5</span></div>
                </div>
            </div>
            <div class="stk-sub-section">
                <div class="stk-sub-header interactable" tabindex="0">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u2702\uFE0F \u5185\u5BB9\u5904\u7406
                </div>
                <div class="stk-sub-body">
                    <div class="stk-row"><label>\u6B63\u6587\u6807\u7B7E\u540D <span>(\u7A7A=\u4E0D\u63D0\u53D6)</span><input type="text" id="sb_tag" class="text_pole" value="${s.content_tag || ""}" /></label></div>
                    <div class="stk-row"><label>\u6E05\u7406\u6B63\u5219 <span>(\u6BCF\u884C\u4E00\u4E2A)</span><textarea id="sb_cleanup" class="text_pole" rows="4">${(s.cleanup_patterns || []).join("\n")}</textarea></label></div>
                </div>
            </div>
            <div class="stk-sub-section">
                <div class="stk-sub-header interactable" tabindex="0">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u{1F527} \u64CD\u4F5C
                </div>
                <div class="stk-sub-body">
                    <div class="stk-btn" id="sb_retry_btn" style="text-align:center">\u{1F504} \u624B\u52A8\u751F\u6210/\u91CD\u8BD5</div>
                    <div class="stk-btn" id="sb_test_btn" style="text-align:center;margin-top:8px">\u{1F9EA} \u6D4B\u8BD5\u63D0\u53D6</div>
                    <div class="stk-btn" id="sb_settings_btn" style="text-align:center;margin-top:8px">\u{1F4CB} \u6253\u5F00\u8BBE\u7F6E\u7A97\u53E3</div>
                </div>
            </div>`;
    },
    bindUI(s, save) {
      $("#sb_auto").on("change", function() {
        s.auto_request = this.checked;
        save();
      });
      $("#sb_reqmode").on("change", function() {
        s.request_mode = this.value;
        save();
      });
      $("#sb_retries").on("input", function() {
        s.retry_count = Number(this.value);
        save();
      });
      $("#sb_notification").on("change", function() {
        s.notification = this.checked;
        save();
      });
      $("#sb_tag").on("input", function() {
        s.content_tag = this.value.trim();
        save();
      });
      $("#sb_cleanup").on("input", function() {
        s.cleanup_patterns = this.value.split("\n").map((l) => l.trim()).filter(Boolean);
        save();
      });
      const self = this;
      $("#sb_retry_btn").on("click", async () => {
        const lastId = Core.getLastMessageId();
        if (lastId < 0) {
          toastr.warning("\u6CA1\u6709\u6D88\u606F", "[StatusBar]");
          return;
        }
        await self._runExtra(lastId, s);
      });
      $("#sb_test_btn").on("click", () => {
        self._showTestResult(s);
      });
      $("#sb_settings_btn").on("click", () => {
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
      if (_settingsWindow) {
        _settingsWindow.close();
        _settingsWindow = null;
      }
      if (_previewWindow) {
        _previewWindow.close();
        _previewWindow = null;
      }
    }
  };

  // src/modules/plotOptions.js
  var XX_REGEX = /<xx>([\s\S]*?)<\/xx>/i;
  var XX_FULL_REGEX = /<xx>[\s\S]*?<\/xx>/i;
  var DEFAULT_PROMPT = `\u5728\u6B63\u6587\u540E\u7ED9<user>\u63D0\u4F9B\u56DB\u4E2A\u7B26\u5408<user>\u4EBA\u8BBE\u7684<user>\u7684\u8BDD\u548C\u52A8\u4F5C\uFF0C\u7528<xx>\u6807\u7B7E\u5305\u88F9\uFF0C\u5FC5\u987B\u653E\u5728<auxiliary_tool>\u5185\u3002
Format:
<xx>
>\u9009\u9879\u4E00\uFF1A[\u63D0\u4F9B\u4E00\u4E2A\u8C28\u614E\u3001\u89C2\u5BDF\u6027\u7684\u884C\u52A8\u9009\u9879]
>\u9009\u9879\u4E8C\uFF1A[\u63D0\u4F9B\u4E00\u4E2A\u79EF\u6781\u3001\u4E3B\u52A8\u4EE5\u63A8\u8FDB\u4EFB\u52A1\u7684\u884C\u52A8\u9009\u9879]
>\u9009\u9879\u4E09\uFF1A[\u63D0\u4F9B\u4E00\u4E2A\u4FA7\u91CD\u4E8E\u4EBA\u9645\u5173\u7CFB\u6216\u79C1\u4EBA\u4E92\u52A8\u7684\u884C\u52A8\u9009\u9879]
>\u9009\u9879\u56DB\uFF1A[\u63D0\u4F9B\u4E00\u4E2A\u7B26\u5408\u5F53\u4E0B\u60C5\u666F\u7684\uFF0C\u5E26\u6709\u60C5\u8272\u6216\u6311\u9017\u610F\u5473\u7684NSFW\u884C\u52A8\u9009\u9879]
</xx>`;
  var ICONS = ["\u{1F50D}", "\u26A1", "\u{1F4AC}", "\u{1F525}"];
  var _optionsWindow = null;
  var _settingsWindow2 = null;
  var _processing2 = false;
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
    const items = options.map(
      (o, i) => `<div class="stk-po-item" data-idx="${i}">${ICONS[i] || "\u25B6"} ${_.escape(o)}</div>`
    ).join("");
    return `
        <div class="stk-po-options">
            ${items}
        </div>
        <div class="stk-po-actions">
            <button class="stk-po-btn stk-po-cancel">\u5173\u95ED</button>
        </div>
    `;
  }
  function showOptions(options) {
    if (_optionsWindow) {
      _optionsWindow.close();
      _optionsWindow = null;
    }
    _optionsWindow = new DraggableWindow({
      id: "stk-plot-options-window",
      title: "\u{1F3AD} \u5267\u60C5\u63A8\u8FDB",
      content: _renderOptionsContent(options),
      width: 400,
      height: "auto",
      anchor: "center",
      persistState: true,
      showClose: true,
      showMinimize: false,
      className: "stk-plot-options-window",
      onClose: () => {
        _optionsWindow = null;
      }
    });
    _optionsWindow.show();
    _optionsWindow.$body.find(".stk-po-item").on("click", function() {
      const idx = $(this).data("idx");
      const text = options[idx];
      if (!text) return;
      _optionsWindow.close();
      _optionsWindow = null;
      $("#send_textarea").val(text).trigger("input");
      $("#send_but").trigger("click");
    });
    _optionsWindow.$body.find(".stk-po-cancel").on("click", () => {
      _optionsWindow.close();
      _optionsWindow = null;
    });
  }
  function showSettingsWindow2(settings, save) {
    if (_settingsWindow2) {
      _settingsWindow2.bringToFront();
      return;
    }
    const content = `
        <div class="stk-settings-content">
            <div class="stk-section">
                <div class="stk-section-title">\u2699\uFE0F \u8BF7\u6C42\u8BBE\u7F6E</div>
                <div class="stk-toggle">
                    <input type="checkbox" id="po_auto_new" ${settings.auto_request ? "checked" : ""} />
                    <span>\u81EA\u52A8\u8BF7\u6C42</span>
                </div>
                <div class="stk-row">
                    <label>\u8BF7\u6C42\u65B9\u5F0F
                        <select id="po_reqmode_new" class="text_pole">
                            <option value="sequential"${settings.request_mode === "sequential" ? " selected" : ""}>\u4F9D\u6B21\u91CD\u8BD5</option>
                            <option value="parallel"${settings.request_mode === "parallel" ? " selected" : ""}>\u540C\u65F6\u8BF7\u6C42</option>
                            <option value="hybrid"${settings.request_mode === "hybrid" ? " selected" : ""}>\u5148\u4E00\u6B21\u540E\u5E76\u884C</option>
                        </select>
                    </label>
                </div>
                <div class="stk-row">
                    <label>\u91CD\u8BD5\u6B21\u6570
                        <input type="number" id="po_retries_new" class="text_pole" value="${settings.retry_count}" min="1" max="10" />
                    </label>
                </div>
                <div class="stk-toggle">
                    <input type="checkbox" id="po_notification_new" ${settings.notification ? "checked" : ""} />
                    <span>\u663E\u793A\u901A\u77E5</span>
                </div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u{1F527} \u64CD\u4F5C</div>
                <div class="stk-btn stk-po-retry-btn" style="text-align:center">\u{1F504} \u624B\u52A8\u751F\u6210/\u91CD\u8BD5</div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u{1F4CB} \u6A21\u677F\u7BA1\u7406</div>
                <div class="stk-row">
                    <select id="po_template_select" class="text_pole" style="width:100%">
                        <option value="">-- \u9009\u62E9\u6A21\u677F --</option>
                    </select>
                </div>
                <div class="stk-row stk-template-actions">
                    <button class="stk-btn stk-po-save-template" style="flex:1">\u4FDD\u5B58\u4E3A\u6A21\u677F</button>
                    <button class="stk-btn stk-po-export-template" style="flex:1">\u5BFC\u51FA</button>
                </div>
            </div>
        </div>
    `;
    _settingsWindow2 = new DraggableWindow({
      id: "stk-plot-options-settings",
      title: "\u{1F3AD} \u5267\u60C5\u63A8\u8FDB\u8BBE\u7F6E",
      content,
      width: 380,
      height: "auto",
      anchor: "top-right",
      offset: { x: 20, y: 100 },
      persistState: true,
      showClose: true,
      showMinimize: false,
      className: "stk-settings-window",
      onClose: () => {
        _settingsWindow2 = null;
      }
    });
    _settingsWindow2.show();
    const templates = templateManager.getAllTemplates();
    const $select = _settingsWindow2.$body.find("#po_template_select");
    templates.forEach((t) => {
      $select.append(`<option value="${t.id}">${t.name}</option>`);
    });
    const activeTemplate = templateManager.getActiveTemplate();
    if (activeTemplate) {
      $select.val(activeTemplate.id);
    }
    _settingsWindow2.$body.find("#po_auto_new").on("change", function() {
      settings.auto_request = this.checked;
      save();
    });
    _settingsWindow2.$body.find("#po_reqmode_new").on("change", function() {
      settings.request_mode = this.value;
      save();
    });
    _settingsWindow2.$body.find("#po_retries_new").on("input", function() {
      settings.retry_count = Number(this.value);
      save();
    });
    _settingsWindow2.$body.find("#po_notification_new").on("change", function() {
      settings.notification = this.checked;
      save();
    });
    const self = PlotOptionsModule;
    _settingsWindow2.$body.find(".stk-po-retry-btn").on("click", async () => {
      const lastId = Core.getLastMessageId();
      if (lastId < 0) {
        toastr.warning("\u6CA1\u6709\u6D88\u606F", "[PlotOptions]");
        return;
      }
      await self._runExtra(lastId, settings);
    });
    _settingsWindow2.$body.find("#po_template_select").on("change", function() {
      const templateId = this.value;
      if (templateId) {
        templateManager.setActiveTemplate(templateId);
      }
    });
    _settingsWindow2.$body.find(".stk-po-save-template").on("click", () => {
      self._saveCurrentPromptAsTemplate();
    });
    _settingsWindow2.$body.find(".stk-po-export-template").on("click", () => {
      const active = templateManager.getActiveTemplate();
      if (active) {
        const json = templateManager.exportTemplate(active.id);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${active.name}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toastr.success("\u6A21\u677F\u5DF2\u5BFC\u51FA", "[PlotOptions]");
      } else {
        toastr.warning("\u6CA1\u6709\u6D3B\u52A8\u6A21\u677F", "[PlotOptions]");
      }
    });
  }
  var PlotOptionsModule = {
    id: "plot_options",
    name: "\u{1F3AD} \u5267\u60C5\u63A8\u8FDB",
    defaultSettings: {
      enabled: true,
      update_mode: "inline",
      auto_request: true,
      retry_count: 3,
      request_mode: "sequential",
      content_tag: "",
      cleanup_patterns: [
        "<xx>[\\s\\S]*?</xx>",
        "<auxiliary_tool>[\\s\\S]*?</auxiliary_tool>"
      ],
      notification: true
    },
    templatePrompts: {
      plot_options_prompt: DEFAULT_PROMPT
    },
    init() {
      this._initDefaultTemplate();
    },
    _initDefaultTemplate() {
      const templates = templateManager.getAllTemplates();
      const hasDefault = templates.some((t) => t.metadata.isDefault);
      if (!hasDefault) {
        templateManager.createTemplate({
          id: "default-plot-options",
          name: "\u9ED8\u8BA4\u5267\u60C5\u63A8\u8FDB",
          description: "\u9ED8\u8BA4\u7684\u5267\u60C5\u63A8\u8FDB\u63D0\u793A\u8BCD\u6A21\u677F",
          data: {
            prompt: DEFAULT_PROMPT
          },
          metadata: {
            isDefault: true,
            module: "plot_options"
          }
        });
      }
    },
    async onMessage(msgId) {
      const s = Core.getModuleSettings(this.id, this.defaultSettings);
      if (!s.enabled || _processing2) return;
      const msg = Core.getChat()[msgId];
      if (!msg || msg.is_user) return;
      _processing2 = true;
      try {
        const options = parseOptions(msg.mes || "");
        if (options) {
          msg.mes = msg.mes.replace(XX_FULL_REGEX, "").trim();
          SillyTavern.getContext().saveChat();
          showOptions(options);
          return;
        }
        if (s.update_mode === "extra_model" && s.auto_request) {
          await this._runExtra(msgId, s);
        }
      } finally {
        _processing2 = false;
      }
    },
    onChatReady() {
    },
    async _getSystemPrompt() {
      const activeTemplate = templateManager.getActiveTemplate();
      if (activeTemplate && activeTemplate.data.prompt) {
        return activeTemplate.data.prompt;
      }
      const wb = await Core.getWorldBookEntry("plot_options_prompt");
      return wb || DEFAULT_PROMPT;
    },
    async _runExtra(msgId, settings) {
      const msg = Core.getChat()[msgId];
      if (!msg) return;
      if (settings.notification) toastr.info("\u6B63\u5728\u751F\u6210\u5267\u60C5\u9009\u9879...", "[PlotOptions]");
      const content = Core.extractContent(msg.mes || "", {
        contentTag: settings.content_tag,
        cleanupPatterns: settings.cleanup_patterns
      });
      const systemPrompt = await this._getSystemPrompt();
      const api = UI.getSharedAPI();
      const result = await Core.requestExtraModel({
        systemPrompt,
        userMessage: content + "\n\n\u8BF7\u6839\u636E\u4EE5\u4E0A\u6B63\u6587\u751F\u6210\u56DB\u4E2A\u5267\u60C5\u63A8\u8FDB\u9009\u9879\u3002",
        api,
        validate: parseOptions,
        retries: settings.retry_count,
        requestMode: settings.request_mode,
        onRetry: (i, max) => {
          if (settings.notification) toastr.info(`\u91CD\u8BD5 ${i}/${max}`, "[PlotOptions]");
        }
      });
      if (result) {
        showOptions(result);
        if (settings.notification) toastr.success("\u5267\u60C5\u9009\u9879\u5DF2\u751F\u6210", "[PlotOptions]");
      } else {
        if (settings.notification) toastr.error("\u5267\u60C5\u9009\u9879\u751F\u6210\u5931\u8D25", "[PlotOptions]");
      }
    },
    async _saveCurrentPromptAsTemplate() {
      const currentPrompt = await this._getSystemPrompt();
      const name = prompt("\u8F93\u5165\u6A21\u677F\u540D\u79F0:", `\u6A21\u677F ${Date.now()}`);
      if (!name) return;
      templateManager.createTemplate({
        name,
        description: "\u7528\u6237\u521B\u5EFA\u7684\u5267\u60C5\u63A8\u8FDB\u6A21\u677F",
        data: {
          prompt: currentPrompt
        },
        metadata: {
          module: "plot_options"
        }
      });
      toastr.success("\u6A21\u677F\u5DF2\u4FDD\u5B58", "[PlotOptions]");
      if (_settingsWindow2) {
        const $select = _settingsWindow2.$body.find("#po_template_select");
        $select.empty().append('<option value="">-- \u9009\u62E9\u6A21\u677F --</option>');
        templateManager.getAllTemplates().forEach((t) => {
          $select.append(`<option value="${t.id}">${t.name}</option>`);
        });
      }
    },
    renderUI(s) {
      return `
            <div class="stk-sub-section">
                <div class="stk-sub-header interactable" tabindex="0">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u2699\uFE0F \u8BF7\u6C42\u8BBE\u7F6E
                </div>
                <div class="stk-sub-body">
                    <div class="stk-toggle"><input type="checkbox" id="po_auto" ${s.auto_request ? "checked" : ""} /><span>\u81EA\u52A8\u8BF7\u6C42</span></div>
                    <div class="stk-row"><label>\u8BF7\u6C42\u65B9\u5F0F<select id="po_reqmode" class="text_pole">
                        <option value="sequential"${s.request_mode === "sequential" ? " selected" : ""}>\u4F9D\u6B21\u91CD\u8BD5</option>
                        <option value="parallel"${s.request_mode === "parallel" ? " selected" : ""}>\u540C\u65F6\u8BF7\u6C42</option>
                        <option value="hybrid"${s.request_mode === "hybrid" ? " selected" : ""}>\u5148\u4E00\u6B21\u540E\u5E76\u884C</option>
                    </select></label></div>
                    <div class="stk-row"><label>\u91CD\u8BD5\u6B21\u6570<input type="number" id="po_retries" class="text_pole" value="${s.retry_count}" min="1" max="10" /></label></div>
                    <div class="stk-toggle"><input type="checkbox" id="po_notification" ${s.notification ? "checked" : ""} /><span>\u663E\u793A\u901A\u77E5</span></div>
                </div>
            </div>
            <div class="stk-sub-section">
                <div class="stk-sub-header interactable" tabindex="0">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u{1F527} \u64CD\u4F5C
                </div>
                <div class="stk-sub-body">
                    <div class="stk-btn" id="po_retry_btn" style="text-align:center">\u{1F504} \u624B\u52A8\u751F\u6210/\u91CD\u8BD5</div>
                    <div class="stk-btn" id="po_settings_btn" style="text-align:center;margin-top:8px">\u{1F4CB} \u6253\u5F00\u8BBE\u7F6E\u7A97\u53E3</div>
                </div>
            </div>`;
    },
    bindUI(s, save) {
      $("#po_auto").on("change", function() {
        s.auto_request = this.checked;
        save();
      });
      $("#po_reqmode").on("change", function() {
        s.request_mode = this.value;
        save();
      });
      $("#po_retries").on("input", function() {
        s.retry_count = Number(this.value);
        save();
      });
      $("#po_notification").on("change", function() {
        s.notification = this.checked;
        save();
      });
      const self = this;
      $("#po_retry_btn").on("click", async () => {
        const lastId = Core.getLastMessageId();
        if (lastId < 0) {
          toastr.warning("\u6CA1\u6709\u6D88\u606F", "[PlotOptions]");
          return;
        }
        await self._runExtra(lastId, s);
      });
      $("#po_settings_btn").on("click", () => {
        showSettingsWindow2(s, save);
      });
    },
    openSettings() {
      const s = Core.getModuleSettings(this.id, this.defaultSettings);
      showSettingsWindow2(s, () => {
        Core.saveModuleSettings(this.id, s);
      });
    },
    closeAllWindows() {
      if (_optionsWindow) {
        _optionsWindow.close();
        _optionsWindow = null;
      }
      if (_settingsWindow2) {
        _settingsWindow2.close();
        _settingsWindow2 = null;
      }
    }
  };

  // src/index.js
  var modules = [StatusBarModule, PlotOptionsModule];
  jQuery(async function() {
    const ctx = SillyTavern.getContext();
    modules.forEach((m) => m.init?.());
    UI.render(modules);
    await Core.ensureWorldBook(modules);
    const throttledMessage = _.throttle(async (msgId) => {
      for (const m of modules) await m.onMessage?.(msgId);
      const msg = Core.getChat()[msgId];
      if (msg?.mes && /<\/?auxiliary_tool>/i.test(msg.mes)) {
        msg.mes = msg.mes.replace(/<\/?auxiliary_tool>/gi, "").trim();
        SillyTavern.getContext().saveChat();
      }
    }, 3e3);
    ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, throttledMessage);
    ctx.eventSource.on(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, (data) => {
      for (const m of modules) m.onChatReady?.(data);
    });
    console.log("[SmartToolkit] loaded");
  });
})();
