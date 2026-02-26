(() => {
  // src/index.js
  (function() {
    const EXTENSION_NAME = "simple-statusbar";
    const STATUS_REGEX = /<StatusBlock>([\s\S]*?)<\/StatusBlock>/i;
    const STATUS_FULL_REGEX = /<StatusBlock>[\s\S]*?<\/StatusBlock>/i;
    const PLACEHOLDER = "<StatusBarPlaceholder/>";
    const STATUSBAR_SYSTEM_PROMPT = `\u4F60\u662F\u72B6\u6001\u680F\u751F\u6210\u5668\u3002\u6839\u636E\u7ED9\u5B9A\u7684\u6B63\u6587\u5185\u5BB9\u548C\u4E0A\u4E00\u8F6E\u72B6\u6001\uFF0C\u8F93\u51FA\u66F4\u65B0\u540E\u7684\u72B6\u6001\u680F\u3002

\u3010\u89C4\u5219\u3011
- \u6BCF\u4E2A\u5B57\u6BB5\u72EC\u7ACB\u5B8C\u6574\u586B\u5199\uFF0C\u7981\u6B62\u7701\u7565/\u6307\u4EE3
- \u6570\u503C\u53D8\u5316\u987B\u7B26\u5408\u5267\u60C5\u903B\u8F91
- \u53EA\u8F93\u51FA\u4E00\u4E2A <StatusBlock>...</StatusBlock>\uFF0C\u4E0D\u8F93\u51FA\u5176\u4ED6\u5185\u5BB9`;
    const STATUSBAR_FORMAT = `
<StatusBlock>
<environment>
\u23F0 [\u661F\u671F] - [\u5E74/\u6708/\u65E5] - [\u65F6:\u5206] | \u{1F4CD} [\u4F4D\u7F6E-\u573A\u6240] | \u{1F324}\uFE0F [\u5929\u6C14/\u4F53\u611F/\u6E29\u5EA6]
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
\u{1F579}\uFE0F \u6027\u9053\u5177\uFF1A[\u540D\u79F0+\u4F4D\u7F6E+\u72B6\u6001+\u6863\u4F4D]
</equipment>
</StatusBlock>`;
    const DEFAULT_SETTINGS = {
      enabled: true,
      update_mode: "inline",
      notification: true,
      // 正文提取配置
      content_extraction: {
        enabled: true,
        // 用于提取正文的正则（从消息中提取有效内容）
        content_tag: "content",
        // 自定义XML标签名，如 <content>...</content>
        // 额外的清理正则列表（移除不需要的内容）
        cleanup_patterns: [
          "<StatusBlock>[\\s\\S]*?</StatusBlock>",
          "<StatusBarPlaceholder/>",
          "<UpdateVariable>[\\s\\S]*?</UpdateVariable>",
          "<StatusPlaceHolderImpl/>"
        ]
      },
      extra_model: {
        auto_request: true,
        use_preset: false,
        api_url: "",
        api_key: "",
        model_name: "",
        max_tokens: 2048,
        temperature: 0.7,
        retry_count: 3,
        request_mode: "sequential",
        stream: false
      }
    };
    function getSettings() {
      var ext = SillyTavern.getContext().extensionSettings;
      if (!ext[EXTENSION_NAME]) {
        ext[EXTENSION_NAME] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      }
      var s = ext[EXTENSION_NAME];
      if (!s.content_extraction) {
        s.content_extraction = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.content_extraction));
      }
      if (s.extra_model.stream === void 0) s.extra_model.stream = false;
      return s;
    }
    function saveSettings() {
      SillyTavern.getContext().saveSettingsDebounced();
    }
    function extractContent(text) {
      var settings = getSettings();
      var cfg = settings.content_extraction;
      if (!cfg || !cfg.enabled) return text;
      var result = text;
      if (cfg.content_tag) {
        var tagRe = new RegExp(
          "<" + cfg.content_tag + ">([\\s\\S]*?)<\\/" + cfg.content_tag + ">",
          "i"
        );
        var m = result.match(tagRe);
        if (m) {
          result = m[1];
        }
      }
      if (cfg.cleanup_patterns && cfg.cleanup_patterns.length > 0) {
        for (var i = 0; i < cfg.cleanup_patterns.length; i++) {
          var pattern = cfg.cleanup_patterns[i];
          if (!pattern) continue;
          try {
            var re = new RegExp(pattern, "gi");
            result = result.replace(re, "");
          } catch (e) {
            console.warn("[StatusBar] Invalid cleanup regex:", pattern, e);
          }
        }
      }
      return result.trim();
    }
    function getChat() {
      return SillyTavern.getContext().chat;
    }
    function getStatusData(messageId) {
      var chat = getChat();
      var msg = chat[messageId];
      if (!msg) return null;
      var swipeId = msg.swipe_id ?? 0;
      return _.get(msg, ["extra", "statusbar", swipeId], null);
    }
    function setStatusData(messageId, data) {
      var chat = getChat();
      var msg = chat[messageId];
      if (!msg) return;
      var swipeId = msg.swipe_id ?? 0;
      if (!msg.extra) msg.extra = {};
      _.set(msg, ["extra", "statusbar", swipeId], data);
    }
    function getLastStatusData(beforeMessageId) {
      var chat = getChat();
      for (var i = beforeMessageId; i >= 0; i--) {
        var data = getStatusData(i);
        if (data) return data;
        var msg = chat[i];
        if (msg && msg.mes) {
          var parsed = parseStatusBlock(msg.mes);
          if (parsed) {
            setStatusData(i, parsed);
            return parsed;
          }
        }
      }
      return null;
    }
    function parseStatusBlock(text) {
      var match = text.match(STATUS_REGEX);
      if (!match) return null;
      var raw = match[1].trim();
      var result = { raw };
      var sections = ["environment", "charInspect", "vital", "equipment"];
      for (var idx = 0; idx < sections.length; idx++) {
        var section = sections[idx];
        var re = new RegExp("<" + section + ">([\\s\\S]*?)<\\/" + section + ">", "i");
        var m = raw.match(re);
        result[section] = m ? m[1].trim() : "";
      }
      return result;
    }
    function processMessage(messageId) {
      var chat = getChat();
      var msg = chat[messageId];
      if (!msg || msg.is_system) return false;
      var text = msg.mes || "";
      var statusData = parseStatusBlock(text);
      if (statusData) {
        setStatusData(messageId, statusData);
        if (text.indexOf(PLACEHOLDER) === -1) {
          msg.mes = text + "\n\n" + PLACEHOLDER;
        }
        SillyTavern.getContext().saveChat();
        return true;
      }
      return false;
    }
    function normalizeBaseURL(url) {
      url = (url || "").trim().replace(/\/+$/, "");
      if (!url) return "";
      if (url.endsWith("/v1")) return url;
      if (url.endsWith("/chat/completions")) return url.replace(/\/chat\/completions$/, "");
      return url + "/v1";
    }
    async function requestExtraModel(messageId) {
      var settings = getSettings();
      var config = settings.extra_model;
      var chat = getChat();
      var msg = chat[messageId];
      if (!msg) return null;
      var currentContent = extractContent(msg.mes || "");
      var prevStatus = getLastStatusData(messageId - 1);
      var prevStatusBlock = prevStatus ? "<PreviousStatus>\n<StatusBlock>\n" + prevStatus.raw + "\n</StatusBlock>\n</PreviousStatus>" : "<PreviousStatus>\u65E0</PreviousStatus>";
      var userMessage = prevStatusBlock + "\n\n<CurrentContent>\n" + currentContent + "\n</CurrentContent>\n\n\u8BF7\u6839\u636E\u4EE5\u4E0A\u6B63\u6587\u5185\u5BB9\u548C\u4E0A\u8F6E\u72B6\u6001\uFF0C\u751F\u6210\u66F4\u65B0\u540E\u7684\u72B6\u6001\u680F\u3002";
      var systemPrompt = STATUSBAR_SYSTEM_PROMPT + "\n\n\u8F93\u51FA\u683C\u5F0F\uFF1A\n" + STATUSBAR_FORMAT;
      if (config.use_preset) {
        try {
          var ctx = SillyTavern.getContext();
          return await ctx.generate({
            user_input: userMessage,
            max_chat_history: 0,
            // 不需要历史，正文已在 user_input 中
            should_stream: config.stream || false,
            injects: [{
              position: "in_chat",
              depth: 0,
              should_scan: false,
              role: "system",
              content: systemPrompt
            }]
          });
        } catch (e) {
          console.error("[StatusBar] generate failed:", e);
          return null;
        }
      }
      var apiUrl = config.api_url ? normalizeBaseURL(config.api_url) + "/chat/completions" : null;
      if (!apiUrl) {
        try {
          var ctx2 = SillyTavern.getContext();
          if (typeof ctx2.generateRaw === "function") {
            return await ctx2.generateRaw({
              user_input: userMessage,
              max_chat_history: 0,
              should_stream: config.stream || false,
              ordered_prompts: [
                { role: "system", content: systemPrompt },
                "user_input"
              ]
            });
          }
        } catch (e) {
          console.error("[StatusBar] generateRaw failed:", e);
        }
        return null;
      }
      var messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ];
      var headers = { "Content-Type": "application/json" };
      if (config.api_key) headers["Authorization"] = "Bearer " + config.api_key;
      try {
        var resp = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: config.model_name,
            messages,
            max_tokens: config.max_tokens || 2048,
            temperature: config.temperature || 0.7,
            stream: config.stream || false
          })
        });
        if (config.stream) {
          var reader = resp.body.getReader();
          var decoder = new TextDecoder();
          var fullContent = "";
          while (true) {
            var readResult = await reader.read();
            if (readResult.done) break;
            var chunk = decoder.decode(readResult.value, { stream: true });
            var lines = chunk.split("\n");
            for (var li = 0; li < lines.length; li++) {
              var line = lines[li].trim();
              if (line.startsWith("data: ") && line !== "data: [DONE]") {
                try {
                  var jsonData = JSON.parse(line.slice(6));
                  var delta = jsonData.choices?.[0]?.delta?.content;
                  if (delta) fullContent += delta;
                } catch (e) {
                }
              }
            }
          }
          return fullContent;
        } else {
          var json = await resp.json();
          return json.choices?.[0]?.message?.content ?? null;
        }
      } catch (e) {
        console.error("[StatusBar] API request failed:", e);
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
        statusData,
        rawBlock: fullMatch ? fullMatch[0] : "<StatusBlock>\n" + statusData.raw + "\n</StatusBlock>"
      };
    }
    async function runExtraModelParsing(messageId) {
      var settings = getSettings();
      var config = settings.extra_model;
      var maxRetries = config.retry_count || 3;
      if (settings.notification) toastr.info("\u6B63\u5728\u751F\u6210\u72B6\u6001\u680F...", "[StatusBar]");
      var result = null;
      if (config.request_mode === "parallel") {
        try {
          result = await Promise.any(
            Array.from(
              { length: maxRetries },
              () => singleAttempt(messageId).then((r) => {
                if (!r) throw new Error("empty");
                return r;
              })
            )
          );
        } catch (e) {
        }
      } else if (config.request_mode === "hybrid") {
        result = await singleAttempt(messageId);
        if (!result && maxRetries > 1) {
          if (settings.notification) toastr.info("\u9996\u6B21\u5931\u8D25\uFF0C\u5E76\u884C\u91CD\u8BD5...", "[StatusBar]");
          try {
            result = await Promise.any(
              Array.from(
                { length: maxRetries - 1 },
                () => singleAttempt(messageId).then((r) => {
                  if (!r) throw new Error("empty");
                  return r;
                })
              )
            );
          } catch (e) {
          }
        }
      } else {
        for (var i = 0; i < maxRetries; i++) {
          result = await singleAttempt(messageId);
          if (result) break;
          if (i < maxRetries - 1 && settings.notification)
            toastr.info("\u91CD\u8BD5 " + (i + 1) + "/" + maxRetries, "[StatusBar]");
        }
      }
      if (result) {
        setStatusData(messageId, result.statusData);
        var chat = getChat();
        var msg = chat[messageId];
        if (msg) {
          var text = (msg.mes || "").replace(STATUS_FULL_REGEX, "").replace(PLACEHOLDER, "").trimEnd();
          text += "\n\n" + result.rawBlock + "\n\n" + PLACEHOLDER;
          msg.mes = text;
          var ctx = SillyTavern.getContext();
          if (typeof ctx.setChatMessages === "function") {
            await ctx.setChatMessages(
              [{ message_id: messageId, message: text }],
              { refresh: "affected" }
            );
          } else {
            ctx.saveChat();
          }
        }
        if (settings.notification) toastr.success("\u72B6\u6001\u680F\u5DF2\u66F4\u65B0", "[StatusBar]");
      } else {
        if (settings.notification) toastr.error("\u72B6\u6001\u680F\u751F\u6210\u5931\u8D25", "[StatusBar]");
      }
    }
    var isProcessing = false;
    async function onMessageReceived(messageId) {
      var settings = getSettings();
      if (!settings.enabled || isProcessing) return;
      var chat = getChat();
      var msg = chat[messageId];
      if (!msg || msg.is_user) return;
      isProcessing = true;
      try {
        if (settings.update_mode === "inline") {
          processMessage(messageId);
        } else if (settings.update_mode === "extra_model") {
          var hasInline = processMessage(messageId);
          if (!hasInline && settings.extra_model.auto_request) {
            await runExtraModelParsing(messageId);
          }
        }
      } catch (e) {
        console.error("[StatusBar] Error:", e);
      } finally {
        isProcessing = false;
      }
    }
    function onChatCompletionReady(data) {
      var settings = getSettings();
      if (!settings.enabled || !data?.messages) return;
      for (var i = 0; i < data.messages.length; i++) {
        if (typeof data.messages[i].content !== "string") continue;
        data.messages[i].content = data.messages[i].content.replace(PLACEHOLDER, "");
      }
      var foundLast = false;
      for (var j = data.messages.length - 1; j >= 0; j--) {
        if (typeof data.messages[j].content !== "string") continue;
        if (STATUS_FULL_REGEX.test(data.messages[j].content)) {
          if (foundLast) {
            data.messages[j].content = data.messages[j].content.replace(STATUS_FULL_REGEX, "").trim();
          }
          foundLast = true;
        }
      }
    }
    function createSettingsPanel() {
      var settings = getSettings();
      var em = settings.extra_model;
      var ce = settings.content_extraction;
      var html = '<div class="inline-drawer" id="statusbar-settings">  <div class="inline-drawer-toggle inline-drawer-header">    <b>Simple StatusBar</b>    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>  </div>  <div class="inline-drawer-content" style="flex-direction:column;gap:0.75rem;padding-top:0.5rem;">    <label class="checkbox_label">      <input type="checkbox" id="ssb_enabled" ' + (settings.enabled ? "checked" : "") + ' />      <span>\u542F\u7528 StatusBar</span>    </label>    <div style="display:flex;flex-direction:column;gap:0.25rem;">      <strong>\u66F4\u65B0\u65B9\u5F0F</strong>      <select id="ssb_update_mode" class="text_pole">        <option value="inline"' + (settings.update_mode === "inline" ? " selected" : "") + '>\u968F AI \u8F93\u51FA</option>        <option value="extra_model"' + (settings.update_mode === "extra_model" ? " selected" : "") + '>\u989D\u5916\u6A21\u578B\u89E3\u6790</option>      </select>    </div>    <details style="border:1px dashed var(--SmartThemeBorderColor);border-radius:10px;padding:0.5rem 0.7rem;">      <summary style="cursor:pointer;font-weight:600;">\u{1F4DD} \u6B63\u6587\u63D0\u53D6 & \u6B63\u5219\u88C1\u526A</summary>      <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">        <label class="checkbox_label">          <input type="checkbox" id="ssb_ce_enabled" ' + (ce.enabled ? "checked" : "") + ' />          <span>\u542F\u7528\u6B63\u6587\u63D0\u53D6</span>        </label>        <label>\u6B63\u6587 XML \u6807\u7B7E\u540D <small style="opacity:0.7;">(\u5982\u586B content \u5219\u63D0\u53D6 &lt;content&gt;...&lt;/content&gt;)</small>          <input type="text" id="ssb_content_tag" class="text_pole" value="' + (ce.content_tag || "") + '" placeholder="content" />        </label>        <label>\u6E05\u7406\u6B63\u5219 <small style="opacity:0.7;">(\u6BCF\u884C\u4E00\u4E2A\u6B63\u5219\uFF0C\u7528\u4E8E\u79FB\u9664\u4E0D\u9700\u8981\u7684\u5185\u5BB9)</small>          <textarea id="ssb_cleanup_patterns" class="text_pole" rows="5" style="font-family:monospace;font-size:0.85em;">' + (ce.cleanup_patterns || []).join("\n") + '</textarea>        </label>        <div class="menu_button menu_button_icon interactable" id="ssb_test_extract" style="text-align:center;font-size:0.9em;">          \u{1F9EA} \u6D4B\u8BD5\u63D0\u53D6\uFF08\u53D6\u6700\u65B0\u6D88\u606F\uFF09        </div>      </div>    </details>    <div id="ssb_extra_config" style="display:' + (settings.update_mode === "extra_model" ? "flex" : "none") + ';flex-direction:column;gap:0.5rem;border:1px dashed var(--SmartThemeBorderColor);border-radius:10px;padding:0.5rem 0.7rem;">      <strong>\u989D\u5916\u6A21\u578B\u914D\u7F6E</strong>      <label class="checkbox_label">        <input type="checkbox" id="ssb_auto_request" ' + (em.auto_request ? "checked" : "") + ' />        <span>\u81EA\u52A8\u8BF7\u6C42</span>      </label>      <label class="checkbox_label">        <input type="checkbox" id="ssb_use_preset" ' + (em.use_preset ? "checked" : "") + ' />        <span>\u4F7F\u7528\u5F53\u524D\u9884\u8BBE</span>      </label>      <div id="ssb_custom_api" style="display:' + (em.use_preset ? "none" : "flex") + ';flex-direction:column;gap:0.4rem;">        <label>API \u5730\u5740<input type="text" id="ssb_api_url" class="text_pole" value="' + (em.api_url || "") + '" placeholder="http://localhost:1234/v1" /></label>        <label>API \u5BC6\u94A5<input type="password" id="ssb_api_key" class="text_pole" value="' + (em.api_key || "") + '" /></label>        <label>\u6A21\u578B\u540D\u79F0<input type="text" id="ssb_model_name" class="text_pole" value="' + (em.model_name || "") + '" /></label>      </div>      <label>\u8BF7\u6C42\u65B9\u5F0F<select id="ssb_request_mode" class="text_pole">        <option value="sequential"' + (em.request_mode === "sequential" ? " selected" : "") + '>\u4F9D\u6B21\u91CD\u8BD5</option>        <option value="parallel"' + (em.request_mode === "parallel" ? " selected" : "") + '>\u540C\u65F6\u8BF7\u6C42</option>        <option value="hybrid"' + (em.request_mode === "hybrid" ? " selected" : "") + '>\u5148\u4E00\u6B21\u540E\u5E76\u884C</option>      </select></label>      <label>\u8BF7\u6C42\u6B21\u6570<input type="number" id="ssb_retry_count" class="text_pole" value="' + em.retry_count + '" min="1" max="10" /></label>      <details style="border:1px solid var(--SmartThemeBorderColor);border-radius:8px;padding:0.4rem;">        <summary style="cursor:pointer;font-weight:600;">\u{1F39B}\uFE0F \u751F\u6210\u53C2\u6570</summary>        <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.4rem;">          <label>\u6700\u5927\u56DE\u590D token<input type="number" id="ssb_max_tokens" class="text_pole" value="' + em.max_tokens + '" min="256" max="8192" step="256" /></label>          <label>\u6E29\u5EA6<input type="number" id="ssb_temperature" class="text_pole" value="' + em.temperature + '" min="0" max="2" step="0.1" /></label>          <label class="checkbox_label"><input type="checkbox" id="ssb_stream" ' + (em.stream ? "checked" : "") + ' /><span>\u6D41\u5F0F\u4F20\u8F93</span></label>        </div>      </details>    </div>    <label class="checkbox_label">      <input type="checkbox" id="ssb_notification" ' + (settings.notification ? "checked" : "") + ' />      <span>\u663E\u793A\u901A\u77E5</span>    </label>    <div class="menu_button menu_button_icon interactable" id="ssb_retry_btn" style="text-align:center;">      \u{1F504} \u624B\u52A8\u751F\u6210/\u91CD\u8BD5\u72B6\u6001\u680F    </div>  </div></div>';
      $("#extensions_settings2").append(html);
      $("#ssb_enabled").on("change", function() {
        settings.enabled = this.checked;
        saveSettings();
      });
      $("#ssb_update_mode").on("change", function() {
        settings.update_mode = this.value;
        $("#ssb_extra_config").toggle(this.value === "extra_model");
        saveSettings();
      });
      $("#ssb_auto_request").on("change", function() {
        settings.extra_model.auto_request = this.checked;
        saveSettings();
      });
      $("#ssb_use_preset").on("change", function() {
        settings.extra_model.use_preset = this.checked;
        $("#ssb_custom_api").toggle(!this.checked);
        saveSettings();
      });
      $("#ssb_notification").on("change", function() {
        settings.notification = this.checked;
        saveSettings();
      });
      $("#ssb_api_url").on("input", function() {
        settings.extra_model.api_url = this.value;
        saveSettings();
      });
      $("#ssb_api_key").on("input", function() {
        settings.extra_model.api_key = this.value;
        saveSettings();
      });
      $("#ssb_model_name").on("input", function() {
        settings.extra_model.model_name = this.value;
        saveSettings();
      });
      $("#ssb_request_mode").on("change", function() {
        settings.extra_model.request_mode = this.value;
        saveSettings();
      });
      $("#ssb_retry_count").on("input", function() {
        settings.extra_model.retry_count = Number(this.value);
        saveSettings();
      });
      $("#ssb_max_tokens").on("input", function() {
        settings.extra_model.max_tokens = Number(this.value);
        saveSettings();
      });
      $("#ssb_temperature").on("input", function() {
        settings.extra_model.temperature = Number(this.value);
        saveSettings();
      });
      $("#ssb_stream").on("change", function() {
        settings.extra_model.stream = this.checked;
        saveSettings();
      });
      $("#ssb_ce_enabled").on("change", function() {
        settings.content_extraction.enabled = this.checked;
        saveSettings();
      });
      $("#ssb_content_tag").on("input", function() {
        settings.content_extraction.content_tag = this.value.trim();
        saveSettings();
      });
      $("#ssb_cleanup_patterns").on("input", function() {
        settings.content_extraction.cleanup_patterns = this.value.split("\n").map(function(l) {
          return l.trim();
        }).filter(Boolean);
        saveSettings();
      });
      $("#ssb_test_extract").on("click", function() {
        var chat = getChat();
        var lastMsg = chat[chat.length - 1];
        if (!lastMsg) {
          toastr.warning("\u6CA1\u6709\u6D88\u606F", "[StatusBar]");
          return;
        }
        var original = lastMsg.mes || "";
        var extracted = extractContent(original);
        var prevStatus = getLastStatusData(chat.length - 2);
        var prevText = prevStatus ? prevStatus.raw.substring(0, 200) + "..." : "(\u65E0)";
        var popupHtml = '<div style="font-family:monospace;white-space:pre-wrap;max-height:60vh;overflow:auto;"><h4>\u{1F4C4} \u539F\u59CB\u6D88\u606F (' + original.length + ' \u5B57\u7B26)</h4><div style="background:rgba(0,0,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">' + _.escape(original.substring(0, 500)) + (original.length > 500 ? "\n...(\u622A\u65AD)" : "") + "</div><h4>\u2702\uFE0F \u63D0\u53D6\u540E (" + extracted.length + " \u5B57\u7B26, \u8282\u7701 " + Math.round((1 - extracted.length / Math.max(original.length, 1)) * 100) + '%)</h4><div style="background:rgba(0,100,0,0.2);padding:8px;border-radius:6px;max-height:20vh;overflow:auto;">' + _.escape(extracted.substring(0, 500)) + (extracted.length > 500 ? "\n...(\u622A\u65AD)" : "") + '</div><h4>\u{1F4CA} \u4E0A\u8F6E\u72B6\u6001\u680F</h4><div style="background:rgba(0,0,100,0.2);padding:8px;border-radius:6px;max-height:10vh;overflow:auto;">' + _.escape(prevText) + "</div><h4>\u{1F4A1} \u5B9E\u9645\u53D1\u9001\u7ED9AI\u7684\u5185\u5BB9 = \u7CFB\u7EDF\u63D0\u793A\u8BCD + \u4E0A\u8F6E\u72B6\u6001 + \u63D0\u53D6\u540E\u6B63\u6587</h4></div>";
        var ctx = SillyTavern.getContext();
        if (typeof ctx.callPopup === "function") {
          ctx.callPopup(popupHtml, "text", "", { wide: true });
        } else if (typeof SillyTavern.callGenericPopup === "function") {
          SillyTavern.callGenericPopup(popupHtml, 1, "", { wide: true, allowVerticalScrolling: true });
        } else {
          alert("\u63D0\u53D6\u540E (" + extracted.length + " \u5B57\u7B26):\n" + extracted.substring(0, 300));
        }
      });
      $("#ssb_retry_btn").on("click", async function() {
        var chat = getChat();
        var lastId = chat.length - 1;
        if (lastId < 0) {
          toastr.warning("\u6CA1\u6709\u6D88\u606F", "[StatusBar]");
          return;
        }
        await runExtraModelParsing(lastId);
      });
    }
    var eventListeners = [];
    function listen(event, handler) {
      var ctx = SillyTavern.getContext();
      ctx.eventSource.on(event, handler);
      eventListeners.push(function() {
        ctx.eventSource.removeListener(event, handler);
      });
    }
    jQuery(async function() {
      var ctx = SillyTavern.getContext();
      createSettingsPanel();
      var throttledHandler = _.throttle(onMessageReceived, 3e3);
      listen(ctx.eventTypes.MESSAGE_RECEIVED, throttledHandler);
      listen(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, onChatCompletionReady);
      if (getSettings().notification) toastr.info("StatusBar \u63D2\u4EF6\u5DF2\u52A0\u8F7D", "[StatusBar]");
      console.log("[StatusBar] Plugin initialized");
    });
  })();
})();
