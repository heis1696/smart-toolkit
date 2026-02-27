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
    extractToolContent(message, toolType) {
      if (!message) return null;
      const auxRegex = /<auxiliary_tool[^>]*type="([^"]+)"[^>]*>([\s\S]*?)<\/auxiliary_tool>/gi;
      let match;
      while ((match = auxRegex.exec(message)) !== null) {
        if (match[1] === toolType) {
          return match[2].trim();
        }
      }
      return null;
    },
    extractLastToolContent(beforeMsgId, toolType) {
      const chat = this.getChat();
      for (let i = beforeMsgId; i >= 0; i--) {
        const content = this.extractToolContent(chat[i]?.mes, toolType);
        if (content) return content;
      }
      return null;
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
      __publicField(this, "_currentProfileCode", "default");
      __publicField(this, "_profileSettingsKey", "stk_profiles");
      __publicField(this, "_activeProfileKey", "stk_active_profile");
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
    getCurrentProfileCode() {
      return this._currentProfileCode;
    }
    setCurrentProfileCode(code) {
      this._currentProfileCode = code || "default";
      this.set(this._activeProfileKey, this._currentProfileCode);
    }
    loadActiveProfileCode() {
      const saved = this.get(this._activeProfileKey);
      if (saved) {
        try {
          this._currentProfileCode = typeof saved === "string" ? saved : "default";
        } catch {
          this._currentProfileCode = "default";
        }
      }
      return this._currentProfileCode;
    }
    getProfileKey(profileCode, key) {
      const code = profileCode || this._currentProfileCode || "default";
      return `profile_${code}_${key}`;
    }
    getProfileSettings(profileCode, defaults = {}) {
      const code = profileCode || this._currentProfileCode || "default";
      const profileKey = this.getProfileKey(code, "settings");
      const settings = this.getObject(profileKey) || {};
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
    setProfileSettings(profileCode, settings) {
      const code = profileCode || this._currentProfileCode || "default";
      const profileKey = this.getProfileKey(code, "settings");
      this.setObject(profileKey, settings);
    }
    getProfileData(profileCode, dataKey) {
      const code = profileCode || this._currentProfileCode || "default";
      const fullKey = this.getProfileKey(code, dataKey);
      return this.getObject(fullKey);
    }
    setProfileData(profileCode, dataKey, data) {
      const code = profileCode || this._currentProfileCode || "default";
      const fullKey = this.getProfileKey(code, dataKey);
      this.setObject(fullKey, data);
    }
    deleteProfileData(profileCode, dataKey) {
      const code = profileCode || this._currentProfileCode || "default";
      const fullKey = this.getProfileKey(code, dataKey);
      this.delete(fullKey);
    }
    listProfiles() {
      const profiles = this.getObject(this._profileSettingsKey) || { default: { name: "\u9ED8\u8BA4", created: Date.now() } };
      return profiles;
    }
    createProfile(code, name) {
      const profiles = this.listProfiles();
      if (profiles[code]) {
        return false;
      }
      profiles[code] = {
        name: name || code,
        created: Date.now()
      };
      this.setObject(this._profileSettingsKey, profiles);
      return true;
    }
    renameProfile(code, newName) {
      const profiles = this.listProfiles();
      if (!profiles[code]) {
        return false;
      }
      profiles[code].name = newName || code;
      profiles[code].modified = Date.now();
      this.setObject(this._profileSettingsKey, profiles);
      return true;
    }
    deleteProfile(code) {
      if (code === "default") {
        return false;
      }
      const profiles = this.listProfiles();
      if (!profiles[code]) {
        return false;
      }
      delete profiles[code];
      this.setObject(this._profileSettingsKey, profiles);
      const allKeys = this._cache.keys();
      const prefix = `profile_${code}_`;
      for (const key of allKeys) {
        if (key.startsWith(prefix)) {
          this.delete(key);
        }
      }
      if (this._currentProfileCode === code) {
        this._currentProfileCode = "default";
        this.set(this._activeProfileKey, "default");
      }
      return true;
    }
    switchProfile(newCode) {
      const profiles = this.listProfiles();
      if (!profiles[newCode]) {
        return false;
      }
      this._currentProfileCode = newCode;
      this.set(this._activeProfileKey, newCode);
      return true;
    }
    getProfileInfo(profileCode) {
      const code = profileCode || this._currentProfileCode || "default";
      const profiles = this.listProfiles();
      return profiles[code] || null;
    }
    getIsolationKey() {
      return this._currentProfileCode || "default";
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

  // src/managers/ApiPresetManager.js
  var _ApiPresetManager = class _ApiPresetManager {
    constructor() {
      __publicField(this, "_presets", {});
      __publicField(this, "_moduleBindings", {});
      __publicField(this, "_initialized", false);
    }
    static getInstance() {
      if (!_ApiPresetManager._instance) {
        _ApiPresetManager._instance = new _ApiPresetManager();
      }
      return _ApiPresetManager._instance;
    }
    async init() {
      if (this._initialized) return;
      this._presets = storage.getObject("api_presets") || {};
      this._moduleBindings = storage.getObject("api_module_bindings") || {};
      this._initialized = true;
    }
    createPreset(config) {
      const id = config.id || `preset_${Date.now()}`;
      this._presets[id] = {
        id,
        name: config.name || "\u672A\u547D\u540D\u9884\u8BBE",
        baseUrl: config.baseUrl || "",
        apiKey: config.apiKey || "",
        model: config.model || "",
        parameters: config.parameters || { max_tokens: 2048, temperature: 0.7, stream: false }
      };
      this._save();
      return id;
    }
    updatePreset(id, config) {
      if (!this._presets[id]) return false;
      Object.assign(this._presets[id], config);
      this._save();
      return true;
    }
    deletePreset(id) {
      if (!this._presets[id]) return false;
      delete this._presets[id];
      for (const moduleId in this._moduleBindings) {
        if (this._moduleBindings[moduleId] === id) {
          delete this._moduleBindings[moduleId];
        }
      }
      this._save();
      return true;
    }
    getPreset(id) {
      return this._presets[id] || null;
    }
    getAllPresets() {
      return Object.values(this._presets);
    }
    getModulePreset(moduleId) {
      const presetId = this._moduleBindings[moduleId];
      return presetId ? this._presets[presetId] : null;
    }
    setModulePreset(moduleId, presetId) {
      if (presetId && !this._presets[presetId]) return false;
      if (presetId) {
        this._moduleBindings[moduleId] = presetId;
      } else {
        delete this._moduleBindings[moduleId];
      }
      this._save();
      return true;
    }
    getModuleApiConfig(moduleId) {
      const preset = this.getModulePreset(moduleId);
      if (preset) {
        return {
          use_preset: false,
          url: preset.baseUrl,
          key: preset.apiKey,
          model: preset.model,
          ...preset.parameters
        };
      }
      return null;
    }
    async testConnection(presetId) {
      const preset = this.getPreset(presetId);
      if (!preset) return { success: false, error: "\u9884\u8BBE\u4E0D\u5B58\u5728" };
      const url = Core.normalizeBaseURL(preset.baseUrl) + "/chat/completions";
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${preset.apiKey}`
          },
          body: JSON.stringify({
            model: preset.model,
            messages: [{ role: "user", content: "test" }],
            max_tokens: 5
          })
        });
        if (resp.ok) return { success: true };
        const err = await resp.text();
        return { success: false, error: err };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    async fetchModels(presetId) {
      const preset = this.getPreset(presetId);
      if (!preset) return { success: false, models: [], error: "\u9884\u8BBE\u4E0D\u5B58\u5728" };
      const url = Core.normalizeBaseURL(preset.baseUrl) + "/models";
      try {
        const resp = await fetch(url, {
          headers: { "Authorization": `Bearer ${preset.apiKey}` }
        });
        const json = await resp.json();
        const models = (json.data || []).map((m) => m.id);
        return { success: true, models };
      } catch (e) {
        return { success: false, models: [], error: e.message };
      }
    }
    async testConnectionFromConfig(config) {
      if (!config.baseUrl) return { success: false, error: "API \u5730\u5740\u4E0D\u80FD\u4E3A\u7A7A" };
      const url = Core.normalizeBaseURL(config.baseUrl) + "/chat/completions";
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey || ""}`
          },
          body: JSON.stringify({
            model: config.model || "gpt-3.5-turbo",
            messages: [{ role: "user", content: "test" }],
            max_tokens: 5
          })
        });
        if (resp.ok) return { success: true };
        const err = await resp.text();
        return { success: false, error: err };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    async fetchModelsFromConfig(config) {
      if (!config.baseUrl) return [];
      const url = Core.normalizeBaseURL(config.baseUrl) + "/models";
      try {
        const resp = await fetch(url, {
          headers: { "Authorization": `Bearer ${config.apiKey || ""}` }
        });
        const json = await resp.json();
        return (json.data || []).map((m) => m.id);
      } catch (e) {
        console.error("[ApiPresetManager] fetchModels error:", e);
        return [];
      }
    }
    _save() {
      storage.setObject("api_presets", this._presets);
      storage.setObject("api_module_bindings", this._moduleBindings);
    }
  };
  __publicField(_ApiPresetManager, "_instance", null);
  var ApiPresetManager = _ApiPresetManager;
  var apiPresetManager = ApiPresetManager.getInstance();

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
                                    <div class="stk-row" style="gap:8px;margin-top:4px">
                                        <div class="stk-btn" id="stk_test_connection">\u6D4B\u8BD5\u8FDE\u63A5</div>
                                        <div class="stk-btn" id="stk_fetch_models">\u83B7\u53D6\u6A21\u578B</div>
                                    </div>
                                    <div class="stk-row">
                                        <label>\u6A21\u578B\u9009\u62E9
                                            <select id="stk_model_select" class="text_pole">
                                                <option value="">-- \u624B\u52A8\u8F93\u5165\u6216\u83B7\u53D6\u6A21\u578B\u5217\u8868 --</option>
                                            </select>
                                        </label>
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
      $("#stk_test_connection").on("click", async function() {
        const $btn = $(this).text("\u6D4B\u8BD5\u4E2D...").prop("disabled", true);
        try {
          const result = await apiPresetManager.testConnectionFromConfig({
            baseUrl: sh.api_url,
            apiKey: sh.api_key,
            model: sh.model_name
          });
          if (result.success) {
            toastr.success("API \u8FDE\u63A5\u6210\u529F", "\u6D4B\u8BD5\u7ED3\u679C");
          } else {
            toastr.error(result.error || "\u8FDE\u63A5\u5931\u8D25", "\u6D4B\u8BD5\u7ED3\u679C");
          }
        } catch (e) {
          toastr.error(e.message, "\u6D4B\u8BD5\u5931\u8D25");
        } finally {
          $btn.text("\u6D4B\u8BD5\u8FDE\u63A5").prop("disabled", false);
        }
      });
      $("#stk_fetch_models").on("click", async function() {
        const $btn = $(this).text("\u83B7\u53D6\u4E2D...").prop("disabled", true);
        try {
          const models = await apiPresetManager.fetchModelsFromConfig({
            baseUrl: sh.api_url,
            apiKey: sh.api_key
          });
          if (models && models.length > 0) {
            const $select = $("#stk_model_select").empty().append('<option value="">-- \u9009\u62E9\u6A21\u578B --</option>');
            models.forEach((m) => {
              const id = typeof m === "string" ? m : m.id;
              $select.append(`<option value="${id}">${id}</option>`);
            });
            if (sh.model_name) {
              $select.val(sh.model_name);
            }
            toastr.success(`\u83B7\u53D6\u5230 ${models.length} \u4E2A\u6A21\u578B`, "\u6210\u529F");
          } else {
            toastr.warning("\u672A\u83B7\u53D6\u5230\u6A21\u578B\u5217\u8868", "\u7ED3\u679C");
          }
        } catch (e) {
          toastr.error(e.message, "\u83B7\u53D6\u5931\u8D25");
        } finally {
          $btn.text("\u83B7\u53D6\u6A21\u578B").prop("disabled", false);
        }
      });
      $("#stk_model_select").on("change", function() {
        if (this.value) {
          sh.model_name = this.value;
          $("#stk_model_name").val(this.value);
          save();
        }
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

  // src/components/OptionsBarWindow.js
  var _OptionsBarWindow = class _OptionsBarWindow {
    constructor() {
      __publicField(this, "_window", null);
      __publicField(this, "_modules", []);
    }
    static getInstance() {
      if (!_OptionsBarWindow._instance) {
        _OptionsBarWindow._instance = new _OptionsBarWindow();
      }
      return _OptionsBarWindow._instance;
    }
    setModules(modules2) {
      this._modules = modules2;
    }
    show() {
      if (this._window) {
        this._window.bringToFront();
        return;
      }
      this._window = new DraggableWindow({
        id: "stk-options-bar",
        title: "\u2699\uFE0F \u5FEB\u6377\u9009\u9879",
        content: this._renderContent(),
        width: 280,
        height: "auto",
        anchor: "bottom-right",
        offset: { x: 20, y: 150 },
        persistState: true,
        showClose: true,
        showMinimize: false,
        className: "stk-options-bar-window",
        onClose: () => {
          this._window = null;
        }
      });
      this._window.show();
      this._bindEvents();
    }
    _renderContent() {
      let html = '<div class="stk-options-content" style="padding:8px;">';
      for (const m of this._modules) {
        const s = Core.getModuleSettings(m.id, m.defaultSettings);
        html += `
                <div class="stk-options-item" style="padding:6px 0;border-bottom:1px solid var(--SmartThemeBorderColor)">
                    <div class="stk-toggle" style="display:flex;align-items:center;gap:6px">
                        <input type="checkbox" id="stk_opt_${m.id}_enabled" ${s.enabled ? "checked" : ""} />
                        <span style="font-size:12px">${m.name}</span>
                    </div>
                </div>`;
      }
      html += "</div>";
      return html;
    }
    _bindEvents() {
      for (const m of this._modules) {
        const s = Core.getModuleSettings(m.id, m.defaultSettings);
        this._window.$body.find(`#stk_opt_${m.id}_enabled`).on("change", function() {
          s.enabled = this.checked;
          Core.saveSettings();
        });
      }
    }
    close() {
      if (this._window) {
        this._window.close();
        this._window = null;
      }
    }
  };
  __publicField(_OptionsBarWindow, "_instance", null);
  var OptionsBarWindow = _OptionsBarWindow;
  var optionsBarWindow = OptionsBarWindow.getInstance();

  // src/components/TabbedPanel.js
  var TabbedPanel = class {
    constructor(options) {
      this.id = options.id || `stk-tabs-${Date.now()}`;
      this.tabs = options.tabs || [];
      this.activeTab = options.activeTab || null;
      this.className = options.className || "";
      this.onTabChange = options.onTabChange || null;
      this.tabPosition = options.tabPosition || "top";
      this.$el = null;
      this.$tabList = null;
      this.$tabContent = null;
      this._tabContents = /* @__PURE__ */ new Map();
    }
    render() {
      const positionClass = `stk-tabs-${this.tabPosition}`;
      const customClass = this.className ? ` ${this.className}` : "";
      const tabsHtml = this.tabs.map((tab) => {
        const activeClass = tab.id === this.activeTab ? " stk-tab-active" : "";
        const iconHtml = tab.icon ? `<span class="stk-tab-icon ${tab.icon}"></span>` : "";
        const badgeHtml = tab.badge ? `<span class="stk-tab-badge">${tab.badge}</span>` : "";
        return `
                <button class="stk-tab${activeClass}" data-tab-id="${tab.id}" tabindex="0">
                    ${iconHtml}
                    <span class="stk-tab-label">${tab.label}</span>
                    ${badgeHtml}
                </button>
            `;
      }).join("");
      const activeTabData = this.tabs.find((t) => t.id === this.activeTab) || this.tabs[0];
      const initialContent = activeTabData?.content || "";
      return `
            <div class="stk-tabs ${positionClass}${customClass}" id="${this.id}">
                <div class="stk-tab-list">${tabsHtml}</div>
                <div class="stk-tab-content">${initialContent}</div>
            </div>
        `;
    }
    show(parentSelector = "body") {
      if (this.$el) {
        this.$el.removeClass("stk-tabs-hidden");
        return;
      }
      if (!this.activeTab && this.tabs.length > 0) {
        this.activeTab = this.tabs[0].id;
      }
      const html = this.render();
      $(parentSelector).append(html);
      this.$el = $(`#${this.id}`);
      this.$tabList = this.$el.find(".stk-tab-list");
      this.$tabContent = this.$el.find(".stk-tab-content");
      this._bindEvents();
    }
    _bindEvents() {
      this.$tabList.on("click", ".stk-tab", (e) => {
        const $tab = $(e.currentTarget);
        const tabId = $tab.data("tab-id");
        this.switchTab(tabId);
      });
      this.$tabList.on("keydown", ".stk-tab", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const $tab = $(e.currentTarget);
          const tabId = $tab.data("tab-id");
          this.switchTab(tabId);
        }
      });
    }
    switchTab(tabId) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      this.activeTab = tabId;
      this.$tabList.find(".stk-tab").removeClass("stk-tab-active");
      this.$tabList.find(`[data-tab-id="${tabId}"]`).addClass("stk-tab-active");
      let content = this._tabContents.get(tabId) || tab.content || "";
      this.$tabContent.html(content);
      if (this.onTabChange) {
        this.onTabChange(tabId, tab);
      }
    }
    setTabContent(tabId, content) {
      this._tabContents.set(tabId, content);
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab) {
        tab.content = content;
      }
      if (this.activeTab === tabId && this.$tabContent) {
        this.$tabContent.html(content);
      }
    }
    getTabContent(tabId) {
      return this._tabContents.get(tabId) || this.tabs.find((t) => t.id === tabId)?.content || "";
    }
    addTab(tab) {
      this.tabs.push(tab);
      if (this.$tabList) {
        const iconHtml = tab.icon ? `<span class="stk-tab-icon ${tab.icon}"></span>` : "";
        const badgeHtml = tab.badge ? `<span class="stk-tab-badge">${tab.badge}</span>` : "";
        const tabHtml = `
                <button class="stk-tab" data-tab-id="${tab.id}" tabindex="0">
                    ${iconHtml}
                    <span class="stk-tab-label">${tab.label}</span>
                    ${badgeHtml}
                </button>
            `;
        this.$tabList.append(tabHtml);
      }
    }
    removeTab(tabId) {
      const index = this.tabs.findIndex((t) => t.id === tabId);
      if (index === -1) return;
      this.tabs.splice(index);
      this._tabContents.delete(tabId);
      if (this.$tabList) {
        this.$tabList.find(`[data-tab-id="${tabId}"]`).remove();
      }
      if (this.activeTab === tabId && this.tabs.length > 0) {
        this.switchTab(this.tabs[0].id);
      }
    }
    updateTabBadge(tabId, badge) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      tab.badge = badge;
      if (this.$tabList) {
        const $tab = this.$tabList.find(`[data-tab-id="${tabId}"]`);
        let $badge = $tab.find(".stk-tab-badge");
        if (badge) {
          if ($badge.length === 0) {
            $tab.append(`<span class="stk-tab-badge">${badge}</span>`);
          } else {
            $badge.text(badge);
          }
        } else {
          $badge.remove();
        }
      }
    }
    updateTabLabel(tabId, label) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      tab.label = label;
      if (this.$tabList) {
        this.$tabList.find(`[data-tab-id="${tabId}"] .stk-tab-label`).text(label);
      }
    }
    hide() {
      if (this.$el) {
        this.$el.addClass("stk-tabs-hidden");
      }
    }
    destroy() {
      if (this.$el) {
        this.$el.remove();
        this.$el = null;
        this.$tabList = null;
        this.$tabContent = null;
        this._tabContents.clear();
      }
    }
    getActiveTab() {
      return this.activeTab;
    }
    getActiveTabData() {
      return this.tabs.find((t) => t.id === this.activeTab) || null;
    }
  };

  // src/managers/DatabaseManager.js
  var TABLE_ORDER_FIELD = "orderNo";
  var _allChatMessages = [];
  var _currentTableData = null;
  function logDebug(...args) {
    console.log("[DatabaseManager]", ...args);
  }
  function logWarn(...args) {
    console.warn("[DatabaseManager]", ...args);
  }
  function logError(...args) {
    console.error("[DatabaseManager]", ...args);
  }
  var DatabaseManager = class {
    static get TABLE_ORDER_FIELD() {
      return TABLE_ORDER_FIELD;
    }
    static get currentData() {
      return _currentTableData;
    }
    static set currentData(data) {
      _currentTableData = data;
    }
    static async loadAllChatMessages() {
      const context = SillyTavern?.getContext?.();
      if (!context) {
        logWarn("SillyTavern context not available");
        _allChatMessages = [];
        return [];
      }
      try {
        const chat = context.chat;
        if (!chat || chat.length === 0) {
          _allChatMessages = [];
          logDebug("No chat messages");
          return [];
        }
        _allChatMessages = chat.map((msg, idx) => ({ ...msg, id: idx }));
        logDebug(`Loaded ${_allChatMessages.length} messages`);
        return _allChatMessages;
      } catch (error) {
        logError("Failed to load chat messages:", error);
        _allChatMessages = [];
        return [];
      }
    }
    static getChatMessages() {
      return _allChatMessages;
    }
    static async mergeAllIndependentTables(isolationKey = "", settings = {}) {
      const context = SillyTavern?.getContext?.();
      const chat = context?.chat;
      if (!chat || chat.length === 0) {
        logDebug("Cannot merge data: Chat history is empty");
        return null;
      }
      const mergedData = {};
      const foundSheets = {};
      const tableStates = {};
      for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (message.is_user) continue;
        if (message.TavernDB_STK_IsolatedData?.[isolationKey]) {
          const tagData = message.TavernDB_STK_IsolatedData[isolationKey];
          const independentData = tagData.independentData || {};
          const modifiedKeys = tagData.modifiedKeys || [];
          Object.keys(independentData).forEach((sheetKey) => {
            if (!foundSheets[sheetKey]) {
              mergedData[sheetKey] = JSON.parse(JSON.stringify(independentData[sheetKey]));
              foundSheets[sheetKey] = true;
              if (modifiedKeys.includes(sheetKey)) {
                if (!tableStates[sheetKey]) tableStates[sheetKey] = {};
                const currentAiFloor = chat.slice(0, i + 1).filter((m) => !m.is_user).length;
                tableStates[sheetKey].lastUpdatedAiFloor = currentAiFloor;
              }
            }
          });
        }
        if (message.TavernDB_STK_Data && this._matchesIsolation(message, isolationKey, settings)) {
          const data = message.TavernDB_STK_Data;
          Object.keys(data).forEach((k) => {
            if (k.startsWith("sheet_") && !foundSheets[k] && data[k]?.name) {
              mergedData[k] = JSON.parse(JSON.stringify(data[k]));
              foundSheets[k] = true;
            }
          });
        }
      }
      const foundCount = Object.keys(foundSheets).length;
      logDebug(`Found ${foundCount} tables for isolation key [${isolationKey || "default"}]`);
      if (foundCount <= 0) return null;
      return mergedData;
    }
    static _matchesIsolation(message, isolationKey, settings) {
      const msgIdentity = message.TavernDB_STK_Identity;
      if (settings.dataIsolationEnabled) {
        return msgIdentity === settings.dataIsolationCode;
      }
      return !msgIdentity;
    }
    static getSortedSheetKeys(dataObj, options = {}) {
      const { ignoreChatGuide = false, includeMissingFromGuide = false } = options;
      if (!dataObj || typeof dataObj !== "object") return [];
      const existingKeys = Object.keys(dataObj).filter((k) => k.startsWith("sheet_"));
      if (existingKeys.length === 0) return [];
      return existingKeys.sort((a, b) => {
        const ao = this._getOrderValue(dataObj, a);
        const bo = this._getOrderValue(dataObj, b);
        if (ao !== bo) return ao - bo;
        const an = String(dataObj[a]?.name || a);
        const bn = String(dataObj[b]?.name || b);
        return an.localeCompare(bn);
      });
    }
    static _getOrderValue(dataObj, key) {
      const v = dataObj?.[key]?.[TABLE_ORDER_FIELD];
      if (Number.isFinite(v)) return Math.trunc(v);
      return Infinity;
    }
    static reorderDataBySheetKeys(dataObj, orderedSheetKeys) {
      if (!dataObj || typeof dataObj !== "object") return dataObj;
      const out = {};
      Object.keys(dataObj).forEach((k) => {
        if (!k.startsWith("sheet_")) out[k] = dataObj[k];
      });
      const keys = Array.isArray(orderedSheetKeys) ? orderedSheetKeys : this.getSortedSheetKeys(dataObj);
      keys.forEach((k) => {
        if (dataObj[k]) out[k] = dataObj[k];
      });
      return out;
    }
    static ensureSheetOrderNumbers(dataObj, options = {}) {
      const { baseOrderKeys = null, forceRebuild = false } = options;
      if (!dataObj || typeof dataObj !== "object") return;
      const existingKeys = Object.keys(dataObj).filter((k) => k.startsWith("sheet_"));
      if (existingKeys.length === 0) return;
      const needsNumbering = forceRebuild || existingKeys.some((k) => {
        const v = dataObj[k]?.[TABLE_ORDER_FIELD];
        return !Number.isFinite(v);
      });
      if (!needsNumbering) return;
      const baseKeys = baseOrderKeys || existingKeys;
      baseKeys.forEach((k, idx) => {
        if (dataObj[k] && typeof dataObj[k] === "object") {
          dataObj[k][TABLE_ORDER_FIELD] = idx + 1;
        }
      });
      existingKeys.forEach((k) => {
        if (!baseKeys.includes(k) && dataObj[k] && typeof dataObj[k] === "object") {
          const maxOrder = Math.max(0, ...existingKeys.filter((sk) => baseKeys.includes(sk)).map((sk) => dataObj[sk]?.[TABLE_ORDER_FIELD] || 0));
          dataObj[k][TABLE_ORDER_FIELD] = maxOrder + 1;
        }
      });
    }
    static sanitizeSheetForStorage(sheet) {
      if (!sheet || typeof sheet !== "object") return sheet;
      const KEEP_KEYS = /* @__PURE__ */ new Set([
        "uid",
        "name",
        "sourceData",
        "content",
        "updateConfig",
        "exportConfig",
        TABLE_ORDER_FIELD
      ]);
      const out = {};
      KEEP_KEYS.forEach((k) => {
        if (sheet[k] !== void 0) out[k] = sheet[k];
      });
      if (!out.name && sheet.name) out.name = sheet.name;
      if (!out.content && Array.isArray(sheet.content)) out.content = sheet.content;
      if (!out.sourceData && sheet.sourceData) out.sourceData = sheet.sourceData;
      return out;
    }
    static sanitizeChatSheetsObject(dataObj, options = {}) {
      const { ensureMate = false } = options;
      if (!dataObj || typeof dataObj !== "object") return dataObj;
      const out = {};
      Object.keys(dataObj).forEach((k) => {
        if (k.startsWith("sheet_")) {
          out[k] = this.sanitizeSheetForStorage(dataObj[k]);
        } else if (k === "mate") {
          out.mate = dataObj.mate;
        } else {
          out[k] = dataObj[k];
        }
      });
      if (ensureMate) {
        if (!out.mate || typeof out.mate !== "object") {
          out.mate = { type: "chatSheets", version: 1 };
        }
        if (!out.mate.type) out.mate.type = "chatSheets";
        if (!out.mate.version) out.mate.version = 1;
      }
      return out;
    }
    static validateTableData(data) {
      if (!data || typeof data !== "object") return { valid: false, errors: ["No data provided"] };
      const errors = [];
      const sheetKeys = Object.keys(data).filter((k) => k.startsWith("sheet_"));
      sheetKeys.forEach((key) => {
        const sheet = data[key];
        if (!sheet.name) {
          errors.push(`Sheet ${key}: missing name`);
        }
        if (!Array.isArray(sheet.content)) {
          errors.push(`Sheet ${key}: content is not an array`);
        }
      });
      return { valid: errors.length === 0, errors };
    }
    static extractTableEdits(message) {
      const text = message?.mes || message?.message || "";
      if (!text) return null;
      const tableEditRegex = /<tableEdit\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tableEdit>/gi;
      const edits = [];
      let match;
      while ((match = tableEditRegex.exec(text)) !== null) {
        const tableName = match[1];
        const content = match[2].trim();
        edits.push({ tableName, content });
      }
      return edits.length > 0 ? edits : null;
    }
    static parseTableEditContent(content) {
      const lines = content.split("\n").map((l) => l.trim()).filter((l) => l);
      return lines.map((line) => {
        const cells = line.split("|").map((c) => c.trim()).filter((c) => c);
        return cells;
      }).filter((row) => row.length > 0);
    }
    static applyTableEdits(edits, tableData) {
      if (!edits || !tableData) return tableData;
      const result = JSON.parse(JSON.stringify(tableData));
      edits.forEach((edit) => {
        const sheetKey = Object.keys(result).find(
          (k) => k.startsWith("sheet_") && result[k]?.name === edit.tableName
        );
        if (sheetKey && result[sheetKey]) {
          const parsedContent = this.parseTableEditContent(edit.content);
          if (parsedContent.length > 0) {
            const existingHeader = result[sheetKey].content?.[0] || [];
            const hasHeaderRow = existingHeader.length > 0;
            if (hasHeaderRow) {
              const headerLength = existingHeader.length;
              result[sheetKey].content = [existingHeader, ...parsedContent.map((row) => {
                while (row.length < headerLength) row.push("");
                return row.slice(0, headerLength);
              })];
            } else {
              result[sheetKey].content = parsedContent;
            }
          }
        }
      });
      return result;
    }
    static convertTableToText(tableData, options = {}) {
      const { includeHeaders = true, separator = " | ", rowSeparator = "\n" } = options;
      if (!tableData || !Array.isArray(tableData)) return "";
      return tableData.map((row, idx) => {
        if (!includeHeaders && idx === 0) return null;
        if (!Array.isArray(row)) return null;
        return row.map((cell) => String(cell ?? "")).join(separator);
      }).filter(Boolean).join(rowSeparator);
    }
    static async refresh(isolationKey = "", settings = {}) {
      await this.loadAllChatMessages();
      const freshData = await this.mergeAllIndependentTables(isolationKey, settings);
      if (freshData) {
        const stableKeys = this.getSortedSheetKeys(freshData);
        _currentTableData = this.reorderDataBySheetKeys(freshData, stableKeys);
      } else {
        _currentTableData = null;
      }
      return _currentTableData;
    }
  };

  // src/components/DatabaseVisualizer.js
  var DatabaseVisualizer = class {
    constructor(options) {
      this.id = options.id || `stk-db-viz-${Date.now()}`;
      this.isolationKey = options.isolationKey || null;
      this.className = options.className || "";
      this.onTableSelect = options.onTableSelect || null;
      this.onDataChange = options.onDataChange || null;
      this.$el = null;
      this.$tableList = null;
      this.$editor = null;
      this._data = null;
      this._sortedKeys = [];
      this._selectedSheetKey = null;
      this._expandedSheets = /* @__PURE__ */ new Set();
    }
    render() {
      const customClass = this.className ? ` ${this.className}` : "";
      return `
            <div class="stk-db-visualizer${customClass}" id="${this.id}">
                <div class="stk-db-toolbar">
                    <button class="stk-db-btn stk-db-refresh interactable" title="\u5237\u65B0\u6570\u636E">
                        <span class="fa-solid fa-rotate"></span>
                    </button>
                    <button class="stk-db-btn stk-db-expand-all interactable" title="\u5C55\u5F00\u5168\u90E8">
                        <span class="fa-solid fa-expand"></span>
                    </button>
                    <button class="stk-db-btn stk-db-collapse-all interactable" title="\u6298\u53E0\u5168\u90E8">
                        <span class="fa-solid fa-compress"></span>
                    </button>
                    <span class="stk-db-info"></span>
                </div>
                <div class="stk-db-body">
                    <div class="stk-db-sidebar">
                        <div class="stk-db-table-list"></div>
                    </div>
                    <div class="stk-db-content">
                        <div class="stk-db-editor"></div>
                    </div>
                </div>
            </div>
        `;
    }
    async show(parentSelector = "body") {
      if (this.$el) {
        this.$el.removeClass("stk-db-hidden");
        await this.refresh();
        return;
      }
      const html = this.render();
      $(parentSelector).append(html);
      this.$el = $(`#${this.id}`);
      this.$tableList = this.$el.find(".stk-db-table-list");
      this.$editor = this.$el.find(".stk-db-editor");
      this._bindEvents();
      await this.refresh();
    }
    _bindEvents() {
      this.$el.on("click", ".stk-db-refresh", () => this.refresh());
      this.$el.on("click", ".stk-db-expand-all", () => this._expandAll());
      this.$el.on("click", ".stk-db-collapse-all", () => this._collapseAll());
      this.$tableList.on("click", ".stk-db-table-header", (e) => {
        const $header = $(e.currentTarget);
        const sheetKey = $header.data("sheet-key");
        this._toggleSheet(sheetKey);
      });
      this.$tableList.on("click", ".stk-db-table-item", (e) => {
        const $item = $(e.currentTarget);
        const sheetKey = $item.data("sheet-key");
        this._selectSheet(sheetKey);
      });
    }
    async refresh() {
      const key = this.isolationKey || storage.getIsolationKey();
      this._data = await DatabaseManager.mergeAllIndependentTables(key);
      if (this._data) {
        this._sortedKeys = DatabaseManager.getSortedSheetKeys(this._data);
      } else {
        this._sortedKeys = [];
      }
      this._renderTableList();
      this._updateInfo();
      if (this.onDataChange) {
        this.onDataChange(this._data);
      }
    }
    _renderTableList() {
      if (!this._sortedKeys.length) {
        this.$tableList.html('<div class="stk-db-empty">\u6682\u65E0\u6570\u636E\u8868</div>');
        return;
      }
      const html = this._sortedKeys.map((sheetKey) => {
        const sheetData = this._data[sheetKey];
        const name = sheetData?.name || sheetKey;
        const orderNo = sheetData?.orderNo ?? 999;
        const isExpanded = this._expandedSheets.has(sheetKey);
        const isSelected = this._selectedSheetKey === sheetKey;
        const expandIcon = isExpanded ? "fa-chevron-down" : "fa-chevron-right";
        const fields = this._extractFields(sheetData);
        const fieldsHtml = isExpanded ? fields.map((f) => `
                <div class="stk-db-field" data-field="${f}">
                    <span class="fa-solid fa-minus"></span>
                    <span class="stk-db-field-name">${f}</span>
                </div>
            `).join("") : "";
        return `
                <div class="stk-db-table${isSelected ? " stk-db-selected" : ""}" data-sheet-key="${sheetKey}">
                    <div class="stk-db-table-header interactable" data-sheet-key="${sheetKey}">
                        <span class="fa-solid ${expandIcon} stk-db-expand-icon"></span>
                        <span class="stk-db-table-name">${name}</span>
                        <span class="stk-db-table-order">#${orderNo}</span>
                    </div>
                    <div class="stk-db-table-fields">${fieldsHtml}</div>
                </div>
            `;
      }).join("");
      this.$tableList.html(html);
    }
    _extractFields(sheetData) {
      if (!sheetData || typeof sheetData !== "object") return [];
      const excludeKeys = ["name", "orderNo", "created", "modified"];
      return Object.keys(sheetData).filter((k) => !excludeKeys.includes(k) && !k.startsWith("_"));
    }
    _toggleSheet(sheetKey) {
      if (this._expandedSheets.has(sheetKey)) {
        this._expandedSheets.delete(sheetKey);
      } else {
        this._expandedSheets.add(sheetKey);
      }
      this._renderTableList();
    }
    _expandAll() {
      this._sortedKeys.forEach((key) => this._expandedSheets.add(key));
      this._renderTableList();
    }
    _collapseAll() {
      this._expandedSheets.clear();
      this._renderTableList();
    }
    _selectSheet(sheetKey) {
      this._selectedSheetKey = sheetKey;
      this._renderTableList();
      this._renderEditor(sheetKey);
      if (this.onTableSelect) {
        this.onTableSelect(sheetKey, this._data?.[sheetKey]);
      }
    }
    _renderEditor(sheetKey) {
      const sheetData = this._data?.[sheetKey];
      if (!sheetData) {
        this.$editor.html('<div class="stk-db-empty">\u8BF7\u9009\u62E9\u4E00\u4E2A\u6570\u636E\u8868</div>');
        return;
      }
      const fields = this._extractFields(sheetData);
      const name = sheetData.name || sheetKey;
      const orderNo = sheetData.orderNo ?? 999;
      const fieldsHtml = fields.map((f) => {
        const value = sheetData[f];
        const displayValue = this._formatValue(value);
        const inputType = typeof value === "object" ? "textarea" : "text";
        return `
                <div class="stk-db-edit-field">
                    <label class="stk-db-edit-label">${f}</label>
                    ${inputType === "textarea" ? `<textarea class="stk-db-edit-input stk-db-edit-textarea" data-field="${f}">${displayValue}</textarea>` : `<input type="${inputType}" class="stk-db-edit-input" data-field="${f}" value="${displayValue}">`}
                </div>
            `;
      }).join("");
      this.$editor.html(`
            <div class="stk-db-edit-header">
                <span class="stk-db-edit-title">${name}</span>
                <span class="stk-db-edit-order">\u987A\u5E8F: ${orderNo}</span>
            </div>
            <div class="stk-db-edit-fields">${fieldsHtml}</div>
            <div class="stk-db-edit-actions">
                <button class="stk-db-btn stk-db-save interactable">\u4FDD\u5B58</button>
                <button class="stk-db-btn stk-db-cancel interactable">\u53D6\u6D88</button>
            </div>
        `);
    }
    _formatValue(value) {
      if (value === null || value === void 0) return "";
      if (typeof value === "object") {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return String(value);
        }
      }
      return String(value);
    }
    _updateInfo() {
      const count = this._sortedKeys.length;
      const key = this.isolationKey || storage.getIsolationKey();
      this.$el.find(".stk-db-info").text(`\u5171 ${count} \u4E2A\u8868 | \u9694\u79BB\u952E: ${key || "\u9ED8\u8BA4"}`);
    }
    getData() {
      return this._data;
    }
    getSortedKeys() {
      return this._sortedKeys;
    }
    getSelectedSheet() {
      return this._selectedSheetKey;
    }
    hide() {
      if (this.$el) {
        this.$el.addClass("stk-db-hidden");
      }
    }
    destroy() {
      if (this.$el) {
        this.$el.remove();
        this.$el = null;
        this.$tableList = null;
        this.$editor = null;
        this._data = null;
        this._sortedKeys = [];
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
        let content = Core.extractToolContent(msg.mes, "statusbar");
        if (content) {
          data = parseBlock(content);
        } else {
          data = parseBlock(msg.mes);
        }
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
        text += '\n\n<auxiliary_tool type="statusbar">\n<StatusBlock>\n' + result.raw + "\n</StatusBlock>\n</auxiliary_tool>\n\n" + PLACEHOLDER;
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

  // src/managers/TableLogicManager.js
  var LOG_PREFIX = "[TableLogic]";
  function logDebug2(...args) {
    console.log(LOG_PREFIX, ...args);
  }
  var _TableLogicManager = class _TableLogicManager {
    static getInstance() {
      if (!_TableLogicManager._instance) {
        _TableLogicManager._instance = new _TableLogicManager();
      }
      return _TableLogicManager._instance;
    }
    constructor() {
      this._auditLog = [];
      this._pendingCommands = [];
      this._maxAuditLogSize = 100;
    }
    async getCurrentData() {
      const isolationKey = storage.getIsolationKey();
      return await DatabaseManager.mergeAllIndependentTables(isolationKey);
    }
    async getTable(sheetKey) {
      const data = await this.getCurrentData();
      return data?.[sheetKey] || null;
    }
    async updateTable(sheetKey, updates, options = {}) {
      const { reason = "update", skipAudit = false } = options;
      const context = SillyTavern?.getContext?.();
      const chat = context?.chat;
      if (!chat || chat.length === 0) {
        logDebug2("Cannot update table: No chat history");
        return false;
      }
      const existingData = await this.getTable(sheetKey);
      const newData = {
        ...existingData,
        ...updates,
        modified: Date.now()
      };
      const isolationKey = storage.getIsolationKey();
      const lastAiMessage = this._findLastAiMessage(chat);
      if (!lastAiMessage) {
        logDebug2("Cannot update table: No AI message found");
        return false;
      }
      if (!lastAiMessage.TavernDB_STK_IsolatedData) {
        lastAiMessage.TavernDB_STK_IsolatedData = {};
      }
      if (!lastAiMessage.TavernDB_STK_IsolatedData[isolationKey]) {
        lastAiMessage.TavernDB_STK_IsolatedData[isolationKey] = {
          independentData: {},
          modifiedKeys: []
        };
      }
      const tagData = lastAiMessage.TavernDB_STK_IsolatedData[isolationKey];
      tagData.independentData[sheetKey] = newData;
      if (!tagData.modifiedKeys.includes(sheetKey)) {
        tagData.modifiedKeys.push(sheetKey);
      }
      if (!skipAudit) {
        this._addAuditEntry({
          action: "updateTable",
          sheetKey,
          reason,
          timestamp: Date.now()
        });
      }
      logDebug2(`Table updated: ${sheetKey}`);
      return true;
    }
    async createTable(sheetKey, tableData, options = {}) {
      const { name, orderNo, ...restData } = tableData;
      const newData = {
        name: name || sheetKey,
        orderNo: orderNo ?? Date.now(),
        created: Date.now(),
        ...restData
      };
      return await this.updateTable(sheetKey, newData, { ...options, reason: "create" });
    }
    async deleteTable(sheetKey, options = {}) {
      const context = SillyTavern?.getContext?.();
      const chat = context?.chat;
      if (!chat || chat.length === 0) {
        return false;
      }
      const isolationKey = storage.getIsolationKey();
      const lastAiMessage = this._findLastAiMessage(chat);
      if (!lastAiMessage?.TavernDB_STK_IsolatedData?.[isolationKey]) {
        return false;
      }
      const tagData = lastAiMessage.TavernDB_STK_IsolatedData[isolationKey];
      if (tagData.independentData?.[sheetKey]) {
        delete tagData.independentData[sheetKey];
      }
      const modIndex = tagData.modifiedKeys?.indexOf(sheetKey);
      if (modIndex > -1) {
        tagData.modifiedKeys.splice(modIndex, 1);
      }
      this._addAuditEntry({
        action: "deleteTable",
        sheetKey,
        reason: options.reason || "delete",
        timestamp: Date.now()
      });
      logDebug2(`Table deleted: ${sheetKey}`);
      return true;
    }
    async updateField(sheetKey, fieldName, value, options = {}) {
      const table = await this.getTable(sheetKey);
      if (!table) {
        logDebug2(`Table not found: ${sheetKey}`);
        return false;
      }
      const updates = { [fieldName]: value };
      return await this.updateTable(sheetKey, updates, options);
    }
    async reorderTable(sheetKey, newOrderNo, options = {}) {
      const table = await this.getTable(sheetKey);
      if (!table) return false;
      return await this.updateTable(sheetKey, { orderNo: newOrderNo }, { ...options, reason: "reorder" });
    }
    async batchUpdate(updates, options = {}) {
      const results = [];
      for (const update of updates) {
        const { sheetKey, data } = update;
        const result = await this.updateTable(sheetKey, data, { ...options, skipAudit: true });
        results.push({ sheetKey, success: result });
      }
      this._addAuditEntry({
        action: "batchUpdate",
        count: updates.length,
        reason: options.reason || "batch",
        timestamp: Date.now()
      });
      return results;
    }
    parseTableEditCommand(text) {
      const patterns = [
        /\[表格编辑\]([\s\S]*?)\[\/表格编辑\]/i,
        /\[TABLE_EDIT\]([\s\S]*?)\[\/TABLE_EDIT\]/i,
        /```table_edit\n([\s\S]*?)```/i
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          return this._parseEditContent(match[1].trim());
        }
      }
      return null;
    }
    _parseEditContent(content) {
      const commands = [];
      const lines = content.split("\n");
      let currentCommand = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
        const actionMatch = trimmed.match(/^\[(\w+)\]$/);
        if (actionMatch) {
          if (currentCommand) {
            commands.push(currentCommand);
          }
          currentCommand = { action: actionMatch[1].toLowerCase(), data: {} };
          continue;
        }
        if (currentCommand) {
          const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
          if (kvMatch) {
            const key = kvMatch[1].trim();
            let value = kvMatch[2].trim();
            if (value.startsWith("{") || value.startsWith("[")) {
              try {
                value = JSON.parse(value);
              } catch {
              }
            } else if (value === "true") {
              value = true;
            } else if (value === "false") {
              value = false;
            } else if (!isNaN(Number(value))) {
              value = Number(value);
            }
            currentCommand.data[key] = value;
          }
        }
      }
      if (currentCommand) {
        commands.push(currentCommand);
      }
      return commands;
    }
    async executeCommands(commands, options = {}) {
      const results = [];
      for (const cmd of commands) {
        let result = { action: cmd.action, success: false };
        try {
          switch (cmd.action) {
            case "update":
            case "set":
              result.success = await this.updateTable(
                cmd.data.sheetKey,
                cmd.data.updates || cmd.data,
                options
              );
              break;
            case "create":
            case "add":
              result.success = await this.createTable(
                cmd.data.sheetKey,
                cmd.data,
                options
              );
              break;
            case "delete":
            case "remove":
              result.success = await this.deleteTable(
                cmd.data.sheetKey,
                options
              );
              break;
            case "reorder":
              result.success = await this.reorderTable(
                cmd.data.sheetKey,
                cmd.data.orderNo,
                options
              );
              break;
            default:
              logDebug2(`Unknown command action: ${cmd.action}`);
          }
        } catch (err) {
          logDebug2(`Command execution error:`, err);
          result.error = err.message;
        }
        results.push(result);
      }
      return results;
    }
    _findLastAiMessage(chat) {
      for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user) {
          return chat[i];
        }
      }
      return null;
    }
    _addAuditEntry(entry) {
      this._auditLog.push(entry);
      if (this._auditLog.length > this._maxAuditLogSize) {
        this._auditLog = this._auditLog.slice(-this._maxAuditLogSize);
      }
    }
    getAuditLog(limit = 50) {
      return this._auditLog.slice(-limit);
    }
    clearAuditLog() {
      this._auditLog = [];
    }
    generatePromptTemplate(sheetKeys, options = {}) {
      const { includeFields = true, format = "standard" } = options;
      if (format === "compact") {
        return this._generateCompactTemplate(sheetKeys);
      }
      const data = this.getCurrentData();
      const tablesSection = sheetKeys.map((key) => {
        const table = data?.[key];
        if (!table) return "";
        const name = table.name || key;
        const fields = Object.keys(table).filter(
          (k) => !["name", "orderNo", "created", "modified"].includes(k)
        );
        let content = `[${name}]
`;
        if (includeFields && fields.length > 0) {
          fields.forEach((f) => {
            content += `${f}: ${table[f]}
`;
          });
        }
        return content;
      }).filter(Boolean).join("\n");
      return `[\u8868\u683C\u7F16\u8F91]
// \u4F7F\u7528\u4EE5\u4E0B\u683C\u5F0F\u7F16\u8F91\u8868\u683C:
// [update] \u6216 [set] - \u66F4\u65B0\u8868\u683C
// [create] \u6216 [add] - \u521B\u5EFA\u65B0\u8868\u683C
// [delete] \u6216 [remove] - \u5220\u9664\u8868\u683C

// \u793A\u4F8B:
// [update]
// sheetKey: sheet_001
// \u5B57\u6BB5\u540D: \u65B0\u503C

\u5F53\u524D\u8868\u683C\u6570\u636E:
${tablesSection}
[/\u8868\u683C\u7F16\u8F91]`;
    }
    _generateCompactTemplate(sheetKeys) {
      return `[TABLE_EDIT]
// action: update|create|delete
// sheetKey: target_sheet
// field: value
[/TABLE_EDIT]`;
    }
  };
  __publicField(_TableLogicManager, "_instance", null);
  var TableLogicManager = _TableLogicManager;
  var tableLogic = TableLogicManager.getInstance();

  // src/managers/PlotAdvanceManager.js
  var _PlotAdvanceManager = class _PlotAdvanceManager {
    static getInstance() {
      if (!_PlotAdvanceManager._instance) {
        _PlotAdvanceManager._instance = new _PlotAdvanceManager();
      }
      return _PlotAdvanceManager._instance;
    }
    constructor() {
      this._defaultSettings = {
        memoryRecallCount: 5,
        enableLoop: true,
        maxLoops: 3,
        selectedWorldbooks: [],
        customPromptTemplate: "",
        enableAutoTrigger: false,
        triggerKeywords: []
      };
    }
    getSettings() {
      const defaults = this._defaultSettings;
      return storage.getProfileSettings(null, defaults);
    }
    saveSettings(settings) {
      storage.setProfileSettings(null, settings);
    }
    async generatePlotPrompt(options = {}) {
      const settings = this.getSettings();
      const {
        includeMemory = true,
        includeTables = true,
        selectedSheets = [],
        loopIndex = 0
      } = options;
      const parts = [];
      if (includeMemory) {
        const memoryContent = await this._buildMemorySection(settings.memoryRecallCount);
        if (memoryContent) {
          parts.push(memoryContent);
        }
      }
      if (includeTables) {
        const tableContent = await this._buildTableSection(selectedSheets);
        if (tableContent) {
          parts.push(tableContent);
        }
      }
      const worldbookContent = await this._buildWorldbookSection(settings.selectedWorldbooks);
      if (worldbookContent) {
        parts.push(worldbookContent);
      }
      if (settings.customPromptTemplate) {
        parts.push(this._processCustomTemplate(settings.customPromptTemplate, loopIndex));
      }
      return parts.filter(Boolean).join("\n\n");
    }
    async _buildMemorySection(count) {
      const context = SillyTavern?.getContext?.();
      const chat = context?.chat;
      if (!chat || chat.length === 0) {
        return "";
      }
      const messages = [];
      const startIndex = Math.max(0, chat.length - count);
      for (let i = startIndex; i < chat.length; i++) {
        const msg = chat[i];
        const role = msg.is_user ? "\u7528\u6237" : "AI";
        const content = msg.mes || "";
        messages.push(`[${role}]: ${content}`);
      }
      if (messages.length === 0) return "";
      return `[\u8BB0\u5FC6\u56DE\u6EAF]
\u6700\u8FD1 ${messages.length} \u6761\u6D88\u606F:
${messages.join("\n")}
[/\u8BB0\u5FC6\u56DE\u6EAF]`;
    }
    async _buildTableSection(selectedSheets) {
      const data = await this.getCurrentData();
      if (!data) return "";
      const keys = selectedSheets.length > 0 ? selectedSheets : DatabaseManager.getSortedSheetKeys(data);
      if (keys.length === 0) return "";
      const tables = keys.map((key) => {
        const table = data[key];
        if (!table) return "";
        const name = table.name || key;
        const fields = Object.entries(table).filter(([k]) => !["name", "orderNo", "created", "modified"].includes(k)).map(([k, v]) => `${k}: ${this._formatValue(v)}`);
        return `[${name}]
${fields.join("\n")}`;
      }).filter(Boolean);
      if (tables.length === 0) return "";
      return `[\u5F53\u524D\u72B6\u6001]
${tables.join("\n\n")}
[/\u5F53\u524D\u72B6\u6001]`;
    }
    async _buildWorldbookSection(selectedWorldbooks) {
      if (!selectedWorldbooks || selectedWorldbooks.length === 0) {
        return "";
      }
      const context = SillyTavern?.getContext?.();
      const worldbooks = context?.worldInfo || [];
      const entries = [];
      for (const wbName of selectedWorldbooks) {
        const wb = worldbooks.find((w) => w.name === wbName);
        if (!wb) continue;
        const wbEntries = wb?.entries || [];
        for (const entry of wbEntries) {
          if (entry.enabled && entry.content) {
            entries.push(entry.content);
          }
        }
      }
      if (entries.length === 0) return "";
      return `[\u4E16\u754C\u4E66\u53C2\u8003]
${entries.join("\n\n")}
[/\u4E16\u754C\u4E66\u53C2\u8003]`;
    }
    _processCustomTemplate(template, loopIndex) {
      return template.replace(/\{\{loopIndex\}\}/g, String(loopIndex)).replace(/\{\{timestamp\}\}/g, String(Date.now())).replace(/\{\{date\}\}/g, (/* @__PURE__ */ new Date()).toLocaleDateString()).replace(/\{\{time\}\}/g, (/* @__PURE__ */ new Date()).toLocaleTimeString());
    }
    async getCurrentData() {
      const isolationKey = storage.getIsolationKey();
      return await DatabaseManager.mergeAllIndependentTables(isolationKey);
    }
    shouldTriggerLoop(userMessage, loopCount, settings) {
      if (!settings.enableLoop) return false;
      if (loopCount >= settings.maxLoops) return false;
      if (settings.triggerKeywords.length > 0) {
        return settings.triggerKeywords.some(
          (keyword) => userMessage.toLowerCase().includes(keyword.toLowerCase())
        );
      }
      return false;
    }
    async advancePlot(options = {}) {
      const settings = this.getSettings();
      const {
        loopCount = 0,
        userMessage = ""
      } = options;
      const shouldLoop = this.shouldTriggerLoop(userMessage, loopCount, settings);
      const prompt2 = await this.generatePlotPrompt({
        includeMemory: true,
        includeTables: true,
        loopIndex: loopCount
      });
      return {
        prompt: prompt2,
        shouldContinue: shouldLoop,
        nextLoopIndex: shouldLoop ? loopCount + 1 : loopCount
      };
    }
    getAvailableWorldbooks() {
      const context = SillyTavern?.getContext?.();
      const worldbooks = context?.worldInfo || [];
      return worldbooks.map((wb) => ({
        name: wb.name,
        entries: wb.entries?.length || 0,
        enabled: wb.enabled !== false
      }));
    }
    setSelectedWorldbooks(worldbookNames) {
      const settings = this.getSettings();
      settings.selectedWorldbooks = worldbookNames;
      this.saveSettings(settings);
    }
    getSelectedWorldbooks() {
      const settings = this.getSettings();
      return settings.selectedWorldbooks || [];
    }
    setMemoryRecallCount(count) {
      const settings = this.getSettings();
      settings.memoryRecallCount = Math.max(1, Math.min(50, count));
      this.saveSettings(settings);
    }
    getMemoryRecallCount() {
      const settings = this.getSettings();
      return settings.memoryRecallCount;
    }
    setLoopSettings(enabled, maxLoops) {
      const settings = this.getSettings();
      settings.enableLoop = enabled;
      settings.maxLoops = Math.max(1, Math.min(10, maxLoops));
      this.saveSettings(settings);
    }
    setCustomPromptTemplate(template) {
      const settings = this.getSettings();
      settings.customPromptTemplate = template;
      this.saveSettings(settings);
    }
    setTriggerKeywords(keywords) {
      const settings = this.getSettings();
      settings.triggerKeywords = Array.isArray(keywords) ? keywords : [];
      this.saveSettings(settings);
    }
    _formatValue(value) {
      if (value === null || value === void 0) return "";
      if (typeof value === "object") {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      }
      return String(value);
    }
    generateQuickPrompt(type = "default") {
      const templates = {
        default: "[\u5267\u60C5\u63A8\u8FDB]\n\u8BF7\u6839\u636E\u5F53\u524D\u72B6\u6001\u63A8\u8FDB\u5267\u60C5\u53D1\u5C55\u3002\n[/\u5267\u60C5\u63A8\u8FDB]",
        combat: "[\u5267\u60C5\u63A8\u8FDB]\n\u5F53\u524D\u573A\u666F: \u6218\u6597\n\u8BF7\u63CF\u8FF0\u6218\u6597\u8FC7\u7A0B\u548C\u7ED3\u679C\u3002\n[/\u5267\u60C5\u63A8\u8FDB]",
        dialogue: "[\u5267\u60C5\u63A8\u8FDB]\n\u5F53\u524D\u573A\u666F: \u5BF9\u8BDD\n\u8BF7\u7EE7\u7EED\u89D2\u8272\u5BF9\u8BDD\u3002\n[/\u5267\u60C5\u63A8\u8FDB]",
        exploration: "[\u5267\u60C5\u63A8\u8FDB]\n\u5F53\u524D\u573A\u666F: \u63A2\u7D22\n\u8BF7\u63CF\u8FF0\u63A2\u7D22\u53D1\u73B0\u3002\n[/\u5267\u60C5\u63A8\u8FDB]",
        rest: "[\u5267\u60C5\u63A8\u8FDB]\n\u5F53\u524D\u573A\u666F: \u4F11\u606F\n\u8BF7\u63CF\u8FF0\u4F11\u606F\u671F\u95F4\u7684\u4E92\u52A8\u3002\n[/\u5267\u60C5\u63A8\u8FDB]"
      };
      return templates[type] || templates.default;
    }
  };
  __publicField(_PlotAdvanceManager, "_instance", null);
  var PlotAdvanceManager = _PlotAdvanceManager;
  var plotAdvance = PlotAdvanceManager.getInstance();

  // src/modules/shujuku/index.js
  var MODULE_ID = "stk-shujuku";
  var MODULE_NAME = "Shujuku \u6570\u636E\u5E93";
  var LOG_PREFIX2 = "[Shujuku]";
  function logDebug3(...args) {
    console.log(LOG_PREFIX2, ...args);
  }
  var ShujukuModule = class {
    constructor() {
      this._initialized = false;
      this._mainWindow = null;
      this._tabPanel = null;
      this._dbVisualizer = null;
      this._settings = this._getDefaultSettings();
    }
    _getDefaultSettings() {
      return {
        windowWidth: 600,
        windowHeight: 500,
        activeTab: "database",
        autoRefresh: true,
        refreshInterval: 5e3
      };
    }
    async init() {
      if (this._initialized) return;
      await storage.init();
      storage.loadActiveProfileCode();
      this._loadSettings();
      this._registerMenu();
      this._initialized = true;
      logDebug3("Shujuku module initialized");
    }
    _loadSettings() {
      const saved = storage.getModuleSettings(MODULE_ID, this._getDefaultSettings());
      this._settings = { ...this._settings, ...saved };
    }
    _saveSettings() {
      storage.saveModuleSettings(MODULE_ID, this._settings);
    }
    _registerMenu() {
      const context = SillyTavern?.getContext?.();
      if (!context) {
        logDebug3("SillyTavern context not available");
        return;
      }
      if (typeof registerSlashCommand === "function") {
        registerSlashCommand("shujuku", () => this.toggleMainWindow(), [], "\u6570\u636E\u5E93\u7BA1\u7406", true, true);
      }
      logDebug3("Menu registered");
    }
    toggleMainWindow() {
      if (this._mainWindow && this._mainWindow.isVisible) {
        this._mainWindow.hide();
        return;
      }
      this._showMainWindow();
    }
    _showMainWindow() {
      if (this._mainWindow) {
        this._mainWindow.show();
        return;
      }
      this._mainWindow = new DraggableWindow({
        id: "stk-shujuku-window",
        title: MODULE_NAME,
        width: this._settings.windowWidth,
        height: this._settings.windowHeight,
        className: "stk-shujuku-window",
        resizable: true,
        draggable: true,
        showClose: true,
        showMinimize: false,
        position: { x: null, y: null },
        anchor: "center",
        onShow: () => this._onWindowShow(),
        onHide: () => this._onWindowHide(),
        onClose: () => this._onWindowClose()
      });
      this._mainWindow.show();
      this._setupTabs();
    }
    _setupTabs() {
      if (!this._mainWindow || !this._mainWindow.$body) return;
      const tabs = [
        { id: "database", label: "\u6570\u636E\u5E93", icon: "fa-solid fa-database" },
        { id: "plot", label: "\u5267\u60C5\u63A8\u8FDB", icon: "fa-solid fa-forward" },
        { id: "settings", label: "\u8BBE\u7F6E", icon: "fa-solid fa-gear" }
      ];
      this._tabPanel = new TabbedPanel({
        id: "stk-shujuku-tabs",
        tabs,
        activeTab: this._settings.activeTab,
        className: "stk-shujuku-tabs",
        onTabChange: (tabId) => this._onTabChange(tabId)
      });
      this._tabPanel.show(`#${this._mainWindow.id} .stk-window-body`);
    }
    async _onTabChange(tabId) {
      this._settings.activeTab = tabId;
      this._saveSettings();
      switch (tabId) {
        case "database":
          await this._renderDatabaseTab();
          break;
        case "plot":
          await this._renderPlotTab();
          break;
        case "settings":
          await this._renderSettingsTab();
          break;
      }
    }
    async _renderDatabaseTab() {
      if (!this._dbVisualizer) {
        this._dbVisualizer = new DatabaseVisualizer({
          id: "stk-shujuku-db",
          className: "stk-shujuku-db",
          onTableSelect: (key, data) => this._onTableSelect(key, data)
        });
      }
      const content = this._dbVisualizer.render();
      this._tabPanel.setTabContent("database", content);
      this._dbVisualizer.$el = $(`#${this._dbVisualizer.id}`);
      this._dbVisualizer.$tableList = this._dbVisualizer.$el.find(".stk-db-table-list");
      this._dbVisualizer.$editor = this._dbVisualizer.$el.find(".stk-db-editor");
      this._dbVisualizer._bindEvents();
      await this._dbVisualizer.refresh();
    }
    async _renderPlotTab() {
      const settings = plotAdvance.getSettings();
      const worldbooks = plotAdvance.getAvailableWorldbooks();
      const selectedWb = plotAdvance.getSelectedWorldbooks();
      const worldbookOptions = worldbooks.map((wb) => {
        const isSelected = selectedWb.includes(wb.name);
        return `
                <label class="stk-checkbox-item">
                    <input type="checkbox" data-worldbook="${wb.name}" ${isSelected ? "checked" : ""}>
                    <span>${wb.name}</span>
                    <span class="stk-wb-count">(${wb.entries}\u6761)</span>
                </label>
            `;
      }).join("");
      const content = `
            <div class="stk-plot-panel">
                <div class="stk-plot-section">
                    <h4>\u8BB0\u5FC6\u56DE\u6EAF</h4>
                    <div class="stk-plot-row">
                        <label>\u56DE\u6EAF\u6D88\u606F\u6570:</label>
                        <input type="number" id="stk-memory-count" value="${settings.memoryRecallCount}" min="1" max="50">
                    </div>
                </div>

                <div class="stk-plot-section">
                    <h4>\u5FAA\u73AF\u63A8\u8FDB</h4>
                    <div class="stk-plot-row">
                        <label class="stk-checkbox-item">
                            <input type="checkbox" id="stk-enable-loop" ${settings.enableLoop ? "checked" : ""}>
                            <span>\u542F\u7528\u5FAA\u73AF</span>
                        </label>
                    </div>
                    <div class="stk-plot-row">
                        <label>\u6700\u5927\u5FAA\u73AF\u6B21\u6570:</label>
                        <input type="number" id="stk-max-loops" value="${settings.maxLoops}" min="1" max="10">
                    </div>
                </div>

                <div class="stk-plot-section">
                    <h4>\u4E16\u754C\u4E66\u9009\u62E9</h4>
                    <div class="stk-worldbook-list">
                        ${worldbookOptions || '<span class="stk-empty-msg">\u65E0\u53EF\u7528\u7684\u4E16\u754C\u4E66</span>'}
                    </div>
                </div>

                <div class="stk-plot-section">
                    <h4>\u5FEB\u901F\u64CD\u4F5C</h4>
                    <div class="stk-plot-actions">
                        <button class="stk-btn interactable" data-action="generate-prompt">\u751F\u6210\u63A8\u8FDB\u63D0\u793A</button>
                        <button class="stk-btn interactable" data-action="quick-combat">\u6218\u6597\u573A\u666F</button>
                        <button class="stk-btn interactable" data-action="quick-dialogue">\u5BF9\u8BDD\u573A\u666F</button>
                    </div>
                </div>
            </div>
        `;
      this._tabPanel.setTabContent("plot", content);
      this._bindPlotEvents();
    }
    _bindPlotEvents() {
      const $panel = this._tabPanel.$tabContent;
      $panel.on("change", "#stk-memory-count", (e) => {
        const count = parseInt($(e.target).val(), 10);
        plotAdvance.setMemoryRecallCount(count);
      });
      $panel.on("change", "#stk-enable-loop", (e) => {
        const enabled = $(e.target).is(":checked");
        const maxLoops = parseInt($("#stk-max-loops").val(), 10);
        plotAdvance.setLoopSettings(enabled, maxLoops);
      });
      $panel.on("change", "#stk-max-loops", (e) => {
        const maxLoops = parseInt($(e.target).val(), 10);
        const enabled = $("#stk-enable-loop").is(":checked");
        plotAdvance.setLoopSettings(enabled, maxLoops);
      });
      $panel.on("change", "[data-worldbook]", (e) => {
        const selected = [];
        $panel.find("[data-worldbook]:checked").each(function() {
          selected.push($(this).data("worldbook"));
        });
        plotAdvance.setSelectedWorldbooks(selected);
      });
      $panel.on("click", "[data-action]", async (e) => {
        const action = $(e.currentTarget).data("action");
        await this._handlePlotAction(action);
      });
    }
    async _handlePlotAction(action) {
      switch (action) {
        case "generate-prompt":
          const prompt2 = await plotAdvance.generatePlotPrompt();
          this._copyToClipboard(prompt2);
          this._showToast("\u63A8\u8FDB\u63D0\u793A\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
          break;
        case "quick-combat":
          this._copyToClipboard(plotAdvance.generateQuickPrompt("combat"));
          this._showToast("\u6218\u6597\u573A\u666F\u63D0\u793A\u5DF2\u590D\u5236");
          break;
        case "quick-dialogue":
          this._copyToClipboard(plotAdvance.generateQuickPrompt("dialogue"));
          this._showToast("\u5BF9\u8BDD\u573A\u666F\u63D0\u793A\u5DF2\u590D\u5236");
          break;
      }
    }
    async _renderSettingsTab() {
      const profiles = storage.listProfiles();
      const currentProfile = storage.getCurrentProfileCode();
      const profileOptions = Object.entries(profiles).map(([code, info]) => {
        const isSelected = code === currentProfile;
        return `
                <option value="${code}" ${isSelected ? "selected" : ""}>
                    ${info.name} (${code})
                </option>
            `;
      }).join("");
      const content = `
            <div class="stk-settings-panel">
                <div class="stk-settings-section">
                    <h4>Profile \u7BA1\u7406</h4>
                    <div class="stk-settings-row">
                        <label>\u5F53\u524D Profile:</label>
                        <select id="stk-profile-select">
                            ${profileOptions}
                        </select>
                    </div>
                    <div class="stk-settings-row">
                        <input type="text" id="stk-new-profile-name" placeholder="\u65B0 Profile \u540D\u79F0">
                        <button class="stk-btn interactable" id="stk-create-profile">\u521B\u5EFA</button>
                    </div>
                </div>

                <div class="stk-settings-section">
                    <h4>\u7A97\u53E3\u8BBE\u7F6E</h4>
                    <div class="stk-settings-row">
                        <label>\u7A97\u53E3\u5BBD\u5EA6:</label>
                        <input type="number" id="stk-window-width" value="${this._settings.windowWidth}" min="300" max="1200">
                    </div>
                    <div class="stk-settings-row">
                        <label>\u7A97\u53E3\u9AD8\u5EA6:</label>
                        <input type="number" id="stk-window-height" value="${this._settings.windowHeight}" min="200" max="800">
                    </div>
                </div>

                <div class="stk-settings-section">
                    <h4>\u6570\u636E\u64CD\u4F5C</h4>
                    <div class="stk-settings-actions">
                        <button class="stk-btn interactable" id="stk-export-data">\u5BFC\u51FA\u6570\u636E</button>
                        <button class="stk-btn interactable" id="stk-import-data">\u5BFC\u5165\u6570\u636E</button>
                        <button class="stk-btn stk-btn-danger interactable" id="stk-clear-data">\u6E05\u9664\u5F53\u524DProfile\u6570\u636E</button>
                    </div>
                </div>
            </div>
        `;
      this._tabPanel.setTabContent("settings", content);
      this._bindSettingsEvents();
    }
    _bindSettingsEvents() {
      const $panel = this._tabPanel.$tabContent;
      $panel.on("change", "#stk-profile-select", (e) => {
        const code = $(e.target).val();
        if (storage.switchProfile(code)) {
          this._showToast(`\u5DF2\u5207\u6362\u5230 Profile: ${code}`);
          if (this._dbVisualizer) {
            this._dbVisualizer.isolationKey = storage.getIsolationKey();
            this._dbVisualizer.refresh();
          }
        }
      });
      $panel.on("click", "#stk-create-profile", () => {
        const name = $("#stk-new-profile-name").val().trim();
        if (!name) {
          this._showToast("\u8BF7\u8F93\u5165 Profile \u540D\u79F0", "error");
          return;
        }
        const code = "profile_" + Date.now();
        if (storage.createProfile(code, name)) {
          this._showToast(`Profile "${name}" \u5DF2\u521B\u5EFA`);
          this._renderSettingsTab();
        } else {
          this._showToast("\u521B\u5EFA\u5931\u8D25", "error");
        }
      });
      $panel.on("change", "#stk-window-width", (e) => {
        this._settings.windowWidth = parseInt($(e.target).val(), 10);
        this._saveSettings();
      });
      $panel.on("change", "#stk-window-height", (e) => {
        this._settings.windowHeight = parseInt($(e.target).val(), 10);
        this._saveSettings();
      });
      $panel.on("click", "#stk-export-data", () => this._exportData());
      $panel.on("click", "#stk-import-data", () => this._importData());
      $panel.on("click", "#stk-clear-data", () => this._clearData());
    }
    async _exportData() {
      const data = await tableLogic.getCurrentData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shujuku-export-${storage.getIsolationKey()}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this._showToast("\u6570\u636E\u5DF2\u5BFC\u51FA");
    }
    _importData() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const data = JSON.parse(event.target.result);
            const results = await tableLogic.batchUpdate(
              Object.entries(data).map(([key, value]) => ({
                sheetKey: key,
                data: value
              }))
            );
            this._showToast(`\u5BFC\u5165\u5B8C\u6210: ${results.filter((r) => r.success).length} \u6761\u6210\u529F`);
            if (this._dbVisualizer) {
              await this._dbVisualizer.refresh();
            }
          } catch (err) {
            this._showToast("\u5BFC\u5165\u5931\u8D25: " + err.message, "error");
          }
        };
        reader.readAsText(file);
      };
      input.click();
    }
    async _clearData() {
      if (!confirm("\u786E\u5B9A\u8981\u6E05\u9664\u5F53\u524D Profile \u7684\u6240\u6709\u6570\u636E\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002")) {
        return;
      }
      const data = await tableLogic.getCurrentData();
      if (!data) return;
      for (const key of Object.keys(data)) {
        await tableLogic.deleteTable(key);
      }
      this._showToast("\u6570\u636E\u5DF2\u6E05\u9664");
      if (this._dbVisualizer) {
        await this._dbVisualizer.refresh();
      }
    }
    _onTableSelect(key, data) {
      logDebug3("Table selected:", key);
    }
    _onWindowShow() {
      logDebug3("Window shown");
    }
    _onWindowHide() {
      logDebug3("Window hidden");
    }
    _onWindowClose() {
      this._mainWindow = null;
      this._tabPanel = null;
      this._dbVisualizer = null;
      logDebug3("Window closed");
    }
    _copyToClipboard(text) {
      navigator.clipboard.writeText(text).catch((err) => {
        logDebug3("Failed to copy:", err);
      });
    }
    _showToast(message, type = "success") {
      if (typeof toastr !== "undefined") {
        toastr[type](message);
      } else {
        logDebug3(`[Toast ${type}]: ${message}`);
      }
    }
    destroy() {
      if (this._mainWindow) {
        this._mainWindow.destroy();
        this._mainWindow = null;
      }
      this._tabPanel = null;
      this._dbVisualizer = null;
      this._initialized = false;
    }
  };
  var shujukuModule = new ShujukuModule();

  // src/index.js
  var modules = [StatusBarModule, PlotOptionsModule, shujukuModule];
  jQuery(async function() {
    const ctx = SillyTavern.getContext();
    await apiPresetManager.init();
    modules.forEach((m) => m.init?.());
    UI.render(modules);
    await Core.ensureWorldBook(modules);
    const throttledMessage = _.throttle(async (msgId) => {
      for (const m of modules) await m.onMessage?.(msgId);
    }, 3e3);
    ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, throttledMessage);
    ctx.eventSource.on(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, (data) => {
      for (const m of modules) m.onChatReady?.(data);
    });
    console.log("[SmartToolkit] loaded");
  });
})();
