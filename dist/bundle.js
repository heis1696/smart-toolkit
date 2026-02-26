(() => {
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
      $("#top-settings-holder").append(topBtn);
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
                <div class="stk-section-header collapsed">
                    <span>${m.name} \u8BBE\u7F6E</span>
                    <span class="stk-arrow fa-solid fa-chevron-down"></span>
                </div>
                <div class="stk-section-body hidden">
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
                    <div class="stk-section-header collapsed">
                        <span>\u{1F50C} \u5171\u4EAB API \u914D\u7F6E</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body hidden">
                        <!-- \u6A21\u5757\u542F\u7528/\u66F4\u65B0\u65B9\u5F0F -->
                        <div class="stk-sub-section">
                            <div class="stk-sub-header">
                                <span class="stk-arrow fa-solid fa-chevron-down collapsed" style="font-size:10px"></span>
                                \u{1F4CB} \u6A21\u5757\u7BA1\u7406
                            </div>
                            <div class="stk-sub-body hidden">
                                ${moduleOverviewHtml}
                            </div>
                        </div>
                        <!-- API\u8BBE\u7F6E -->
                        <div class="stk-sub-section">
                            <div class="stk-sub-header">
                                <span class="stk-arrow fa-solid fa-chevron-down collapsed" style="font-size:10px"></span>
                                \u{1F517} API \u8FDE\u63A5
                            </div>
                            <div class="stk-sub-body hidden">
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
                    <div class="stk-section-header collapsed">
                        <span>\u{1F4DD} \u6A21\u677F\u63D0\u793A\u8BCD\uFF08\u4E16\u754C\u4E66\uFF09</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body hidden" id="stk_prompts_body">
                        <div style="font-size:11px;opacity:.6;margin-bottom:4px;">\u63D0\u793A\u8BCD\u5B58\u50A8\u5728\u4E16\u754C\u4E66\u300C${Core.WORLD_BOOK}\u300D\u4E2D\uFF0C\u4FEE\u6539\u540E\u81EA\u52A8\u540C\u6B65\u3002</div>
                        ${modules2.map((m) => {
        if (!m.templatePrompts) return "";
        return Object.entries(m.templatePrompts).map(([key, def]) => `
                                <div class="stk-sub-section">
                                    <div class="stk-sub-header">
                                        <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                                        ${m.name} - ${key}
                                    </div>
                                    <div class="stk-sub-body hidden">
                                        <textarea id="stk_prompt_${key}" class="text_pole" rows="8" style="font-family:monospace;font-size:11px;white-space:pre;resize:vertical">${_.escape(def)}</textarea>
                                        <div class="stk-btn stk_prompt_save" data-key="${key}" style="align-self:flex-end">\u{1F4BE} \u4FDD\u5B58\u5230\u4E16\u754C\u4E66</div>
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
      $(document).on("click", ".stk-section-header", function() {
        $(this).toggleClass("collapsed").next(".stk-section-body").toggleClass("hidden");
      });
      $(document).on("click", ".stk-sub-header", function() {
        $(this).find(".stk-arrow").toggleClass("collapsed");
        $(this).next(".stk-sub-body").toggleClass("hidden");
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
  var _processing = false;
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
    // 模板提示词（会同步到世界书）
    templatePrompts: {
      statusbar_system_prompt: DEFAULT_SYSTEM_PROMPT
    },
    init() {
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
    renderUI(s) {
      return `
            <!-- \u8BF7\u6C42\u8BBE\u7F6E -->
            <div class="stk-sub-section">
                <div class="stk-sub-header">
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
            <!-- \u5185\u5BB9\u5904\u7406 -->
            <div class="stk-sub-section">
                <div class="stk-sub-header">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u2702\uFE0F \u5185\u5BB9\u5904\u7406
                </div>
                <div class="stk-sub-body">
                    <div class="stk-row"><label>\u6B63\u6587\u6807\u7B7E\u540D <span>(\u7A7A=\u4E0D\u63D0\u53D6)</span><input type="text" id="sb_tag" class="text_pole" value="${s.content_tag || ""}" /></label></div>
                    <div class="stk-row"><label>\u6E05\u7406\u6B63\u5219 <span>(\u6BCF\u884C\u4E00\u4E2A)</span><textarea id="sb_cleanup" class="text_pole" rows="4">${(s.cleanup_patterns || []).join("\n")}</textarea></label></div>
                </div>
            </div>
            <!-- \u64CD\u4F5C -->
            <div class="stk-sub-section">
                <div class="stk-sub-header">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u{1F527} \u64CD\u4F5C
                </div>
                <div class="stk-sub-body">
                    <div class="stk-btn" id="sb_retry_btn" style="text-align:center">\u{1F504} \u624B\u52A8\u751F\u6210/\u91CD\u8BD5</div>
                    <div class="stk-btn" id="sb_test_btn" style="text-align:center">\u{1F9EA} \u6D4B\u8BD5\u63D0\u53D6</div>
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
        const chat = Core.getChat();
        const last = chat[chat.length - 1];
        if (!last) {
          toastr.warning("\u6CA1\u6709\u6D88\u606F", "[StatusBar]");
          return;
        }
        const original = last.mes || "";
        const extracted = Core.extractContent(original, { contentTag: s.content_tag, cleanupPatterns: s.cleanup_patterns });
        const prev = getLastStatus(chat.length - 2);
        const prevText = prev ? prev.raw.substring(0, 200) + "..." : "(\u65E0)";
        const ratio = Math.round((1 - extracted.length / Math.max(original.length, 1)) * 100);
        const popupHtml = `<div style="font-family:monospace;white-space:pre-wrap;max-height:60vh;overflow:auto;">
                <h4>\u{1F4C4} \u539F\u6587 (${original.length} \u5B57\u7B26)</h4>
                <div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">${_.escape(original.substring(0, 500))}${original.length > 500 ? "\n...(\u622A\u65AD)" : ""}</div>
                <h4>\u2702\uFE0F \u63D0\u53D6\u540E (${extracted.length} \u5B57\u7B26, \u8282\u7701 ${ratio}%)</h4>
                <div style="background:rgba(0,100,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">${_.escape(extracted.substring(0, 500))}${extracted.length > 500 ? "\n...(\u622A\u65AD)" : ""}</div>
                <h4>\u{1F4CA} \u4E0A\u8F6E\u72B6\u6001\u680F</h4>
                <div style="background:rgba(0,0,100,0.2);padding:8px;border-radius:6px;max-height:10vh;overflow:auto;">${_.escape(prevText)}</div>
            </div>`;
        const ctx = SillyTavern.getContext();
        if (typeof ctx.callPopup === "function") {
          ctx.callPopup(popupHtml, "text", "", { wide: true });
        } else if (typeof SillyTavern.callGenericPopup === "function") {
          SillyTavern.callGenericPopup(popupHtml, 1, "", { wide: true, allowVerticalScrolling: true });
        } else {
          alert("\u63D0\u53D6\u540E (" + extracted.length + " \u5B57\u7B26):\n" + extracted.substring(0, 300));
        }
      });
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
    $("#stk-plot-options").remove();
    const items = options.map(
      (o, i) => `<div class="stk-po-item" data-idx="${i}">${ICONS[i] || "\u25B6"} ${_.escape(o)}</div>`
    ).join("");
    $("body").append(`
        <div id="stk-plot-options">
            <div class="stk-po-header">
                <span>\u{1F3AD} \u5267\u60C5\u63A8\u8FDB</span>
                <span id="stk-po-close" class="fa-solid fa-xmark"></span>
            </div>
            ${items}
        </div>
    `);
    let isDragging = false, offsetX, offsetY;
    $("#stk-plot-options .stk-po-header").on("mousedown", function(e) {
      if ($(e.target).is("#stk-po-close")) return;
      isDragging = true;
      const rect = $("#stk-plot-options")[0].getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });
    $(document).on("mousemove.stkpo", function(e) {
      if (!isDragging) return;
      $("#stk-plot-options").css({
        left: e.clientX - offsetX + "px",
        top: e.clientY - offsetY + "px",
        right: "auto",
        bottom: "auto"
      });
    });
    $(document).on("mouseup.stkpo", function() {
      isDragging = false;
    });
    $("#stk-po-close").on("click", () => {
      $("#stk-plot-options").remove();
      $(document).off(".stkpo");
    });
    $(".stk-po-item").on("click", function() {
      const text = options[$(this).data("idx")];
      $("#stk-plot-options").remove();
      $(document).off(".stkpo");
      if (!text) return;
      $("#send_textarea").val(text).trigger("input");
      $("#send_but").trigger("click");
    });
  }
  var _processing2 = false;
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
    renderUI(s) {
      return `
            <div class="stk-sub-section">
                <div class="stk-sub-header">
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
                <div class="stk-sub-header">
                    <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                    \u{1F527} \u64CD\u4F5C
                </div>
                <div class="stk-sub-body">
                    <div class="stk-btn" id="po_retry_btn" style="text-align:center">\u{1F504} \u624B\u52A8\u751F\u6210/\u91CD\u8BD5</div>
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
