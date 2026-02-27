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
    async ensureWorldBook(modules3) {
      const ctx = SillyTavern.getContext();
      try {
        const headers = ctx.getRequestHeaders?.() || { "Content-Type": "application/json" };
        await fetch("/api/worldinfo/create", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: WORLD_BOOK })
        });
        await ctx.executeSlashCommandsWithOptions(`/world silent=true ${WORLD_BOOK}`);
        for (const m of modules3) {
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
    exportPresets(presetIds = null) {
      const presetsToExport = presetIds ? presetIds.map((id) => this._presets[id]).filter(Boolean) : Object.values(this._presets);
      return {
        version: 1,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        presets: presetsToExport,
        moduleBindings: presetIds ? Object.fromEntries(Object.entries(this._moduleBindings).filter(([, pid]) => presetIds.includes(pid))) : { ...this._moduleBindings }
      };
    }
    importPresets(data, options = {}) {
      const { merge = true, overwrite = false } = options;
      if (!data || !data.presets || !Array.isArray(data.presets)) {
        return { success: false, imported: 0, skipped: 0, error: "\u65E0\u6548\u7684\u5BFC\u5165\u6570\u636E\u683C\u5F0F" };
      }
      let imported = 0;
      let skipped = 0;
      const conflicts = [];
      for (const preset of data.presets) {
        if (!preset.id) {
          skipped++;
          continue;
        }
        if (this._presets[preset.id] && !overwrite) {
          if (merge) {
            const newId = `${preset.id}_imported_${Date.now()}`;
            this._presets[newId] = { ...preset, id: newId };
            imported++;
            conflicts.push({ originalId: preset.id, newId });
          } else {
            skipped++;
            conflicts.push({ originalId: preset.id, reason: "ID\u5DF2\u5B58\u5728" });
          }
        } else {
          this._presets[preset.id] = preset;
          imported++;
        }
      }
      if (data.moduleBindings && merge) {
        for (const [moduleId, presetId] of Object.entries(data.moduleBindings)) {
          if (this._presets[presetId]) {
            this._moduleBindings[moduleId] = presetId;
          }
        }
      }
      this._save();
      return { success: true, imported, skipped, conflicts };
    }
    exportToJSON(presetIds = null) {
      const data = this.exportPresets(presetIds);
      return JSON.stringify(data, null, 2);
    }
    importFromJSON(jsonStr, options = {}) {
      try {
        const data = JSON.parse(jsonStr);
        return this.importPresets(data, options);
      } catch (e) {
        return { success: false, imported: 0, skipped: 0, error: "JSON\u89E3\u6790\u5931\u8D25: " + e.message };
      }
    }
    downloadPresets(presetIds = null, filename = "api-presets.json") {
      const json = this.exportToJSON(presetIds);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    async uploadPresets(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = this.importFromJSON(e.target.result);
          resolve(result);
        };
        reader.onerror = () => {
          resolve({ success: false, imported: 0, skipped: 0, error: "\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25" });
        };
        reader.readAsText(file);
      });
    }
  };
  __publicField(_ApiPresetManager, "_instance", null);
  var ApiPresetManager = _ApiPresetManager;
  var apiPresetManager = ApiPresetManager.getInstance();

  // src/modules/aiInstructions.js
  var PRESETS_KEY = "stk_ai_instruction_presets";
  var DEFAULT_SEGMENTS = [
    { id: "system", role: "system", name: "\u7CFB\u7EDF\u6307\u4EE4", content: "\u4F60\u662F\u4E00\u4E2A\u6709\u7528\u7684AI\u52A9\u624B\u3002", deletable: false, order: 0 },
    { id: "main", role: "user", name: "\u4E3B\u8981\u63D0\u793A", content: "", deletable: false, order: 1 }
  ];
  var _presets = null;
  var _activePresetId = null;
  function ensureId() {
    return "seg_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
  function getDefaultSegments() {
    return JSON.parse(JSON.stringify(DEFAULT_SEGMENTS));
  }
  function loadPresets() {
    if (_presets !== null) return _presets;
    try {
      const data = storage.get(PRESETS_KEY);
      if (data && Array.isArray(data.presets)) {
        _presets = data.presets;
        _activePresetId = data.activeId || null;
      } else {
        _presets = [];
        _activePresetId = null;
      }
    } catch (e) {
      console.error("[AIInstructions] \u52A0\u8F7D\u9884\u8BBE\u5931\u8D25:", e);
      _presets = [];
      _activePresetId = null;
    }
    return _presets;
  }
  function savePresets() {
    storage.set(PRESETS_KEY, { presets: _presets, activeId: _activePresetId });
  }
  function getActivePreset() {
    loadPresets();
    if (!_activePresetId && _presets.length > 0) {
      return _presets[0];
    }
    return _presets.find((p) => p.id === _activePresetId) || null;
  }
  function setActivePreset(id) {
    loadPresets();
    if (_presets.find((p) => p.id === id)) {
      _activePresetId = id;
      savePresets();
      return true;
    }
    return false;
  }
  function createPreset(name, segments = null) {
    loadPresets();
    const preset = {
      id: "preset_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: name || "\u65B0\u9884\u8BBE",
      segments: segments || getDefaultSegments(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    _presets.push(preset);
    if (!_activePresetId) _activePresetId = preset.id;
    savePresets();
    return preset;
  }
  function updatePreset(id, updates) {
    loadPresets();
    const idx = _presets.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const preset = _presets[idx];
    if (updates.name !== void 0) preset.name = updates.name;
    if (updates.segments !== void 0) preset.segments = updates.segments;
    preset.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    _presets[idx] = preset;
    savePresets();
    return preset;
  }
  function deletePreset(id) {
    loadPresets();
    const idx = _presets.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    _presets.splice(idx, 1);
    if (_activePresetId === id) {
      _activePresetId = _presets.length > 0 ? _presets[0].id : null;
    }
    savePresets();
    return true;
  }
  function duplicatePreset(id) {
    loadPresets();
    const original = _presets.find((p) => p.id === id);
    if (!original) return null;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = "preset_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    copy.name = original.name + " (\u526F\u672C)";
    copy.createdAt = (/* @__PURE__ */ new Date()).toISOString();
    copy.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    copy.segments.forEach((s) => {
      s.id = ensureId();
    });
    _presets.push(copy);
    savePresets();
    return copy;
  }
  function exportPresets(presetIds = null) {
    loadPresets();
    const toExport = presetIds ? _presets.filter((p) => presetIds.includes(p.id)) : _presets;
    return {
      version: 1,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      presets: toExport
    };
  }
  function importPresets(data, options = { merge: true, overwrite: false }) {
    loadPresets();
    if (!data || !data.presets || !Array.isArray(data.presets)) {
      return { success: false, imported: 0, skipped: 0, error: "\u65E0\u6548\u7684\u6570\u636E\u683C\u5F0F" };
    }
    let imported = 0;
    let skipped = 0;
    for (const p of data.presets) {
      if (!p.name || !Array.isArray(p.segments)) {
        skipped++;
        continue;
      }
      const existing = _presets.find((x) => x.name === p.name);
      if (existing) {
        if (options.overwrite) {
          existing.segments = p.segments;
          existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          imported++;
        } else {
          skipped++;
        }
      } else {
        const newPreset = {
          ...p,
          id: "preset_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          createdAt: p.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        newPreset.segments = newPreset.segments.map((s) => ({ ...s, id: ensureId() }));
        _presets.push(newPreset);
        imported++;
      }
    }
    if (!_activePresetId && _presets.length > 0) {
      _activePresetId = _presets[0].id;
    }
    savePresets();
    return { success: true, imported, skipped };
  }
  function exportToJSON(presetIds = null) {
    const data = exportPresets(presetIds);
    return JSON.stringify(data, null, 2);
  }
  function downloadPresets(presetIds = null, filename = "ai-instructions.json") {
    const json = exportToJSON(presetIds);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function uploadPresets(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const result = importPresets(data, { merge: true, overwrite: false });
          resolve(result);
        } catch (err) {
          resolve({ success: false, imported: 0, skipped: 0, error: "JSON\u89E3\u6790\u5931\u8D25: " + err.message });
        }
      };
      reader.onerror = () => resolve({ success: false, imported: 0, skipped: 0, error: "\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25" });
      reader.readAsText(file);
    });
  }
  function addSegment(presetId, segment) {
    const preset = _presets.find((p) => p.id === presetId);
    if (!preset) return null;
    const newSeg = {
      id: ensureId(),
      role: segment.role || "user",
      name: segment.name || "\u65B0\u6BB5\u843D",
      content: segment.content || "",
      deletable: segment.deletable !== false,
      order: preset.segments.length
    };
    preset.segments.push(newSeg);
    preset.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    savePresets();
    return newSeg;
  }
  function updateSegment(presetId, segmentId, updates) {
    const preset = _presets.find((p) => p.id === presetId);
    if (!preset) return null;
    const seg = preset.segments.find((s) => s.id === segmentId);
    if (!seg) return null;
    if (updates.role !== void 0) seg.role = updates.role;
    if (updates.name !== void 0) seg.name = updates.name;
    if (updates.content !== void 0) seg.content = updates.content;
    if (updates.order !== void 0) seg.order = updates.order;
    preset.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    savePresets();
    return seg;
  }
  function deleteSegment(presetId, segmentId) {
    const preset = _presets.find((p) => p.id === presetId);
    if (!preset) return false;
    const idx = preset.segments.findIndex((s) => s.id === segmentId);
    if (idx === -1) return false;
    if (preset.segments[idx].deletable === false) return false;
    preset.segments.splice(idx, 1);
    preset.segments.forEach((s, i) => {
      s.order = i;
    });
    preset.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    savePresets();
    return true;
  }
  function reorderSegments(presetId, segmentIds) {
    const preset = _presets.find((p) => p.id === presetId);
    if (!preset) return false;
    const reordered = [];
    segmentIds.forEach((id, i) => {
      const seg = preset.segments.find((s) => s.id === id);
      if (seg) {
        seg.order = i;
        reordered.push(seg);
      }
    });
    preset.segments = reordered;
    preset.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    savePresets();
    return true;
  }
  function buildPrompt(presetId = null) {
    const preset = presetId ? _presets.find((p) => p.id === presetId) : getActivePreset();
    if (!preset) return "";
    return preset.segments.sort((a, b) => a.order - b.order).map((s) => s.content).filter((c) => c && c.trim()).join("\n\n");
  }
  function buildMessages(presetId = null) {
    const preset = presetId ? _presets.find((p) => p.id === presetId) : getActivePreset();
    if (!preset) return [];
    return preset.segments.sort((a, b) => a.order - b.order).filter((s) => s.content && s.content.trim()).map((s) => ({ role: s.role, content: s.content }));
  }
  var AIInstructionsManager = {
    get presets() {
      return loadPresets();
    },
    get activePreset() {
      return getActivePreset();
    },
    get activePresetId() {
      return _activePresetId;
    },
    setActivePreset,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    exportPresets,
    importPresets,
    exportToJSON,
    downloadPresets,
    uploadPresets,
    addSegment,
    updateSegment,
    deleteSegment,
    reorderSegments,
    buildPrompt,
    buildMessages,
    getDefaultSegments
  };
  var AIInstructionsModule = class {
    constructor() {
      this.id = "aiInstructions";
      this.name = "AI \u6307\u4EE4\u9884\u8BBE";
      this.description = "\u7BA1\u7406\u548C\u6784\u5EFAAI\u7CFB\u7EDF\u6307\u4EE4\uFF0C\u652F\u6301\u52A8\u6001\u6BB5\u843D\u3001\u9884\u8BBE\u5BFC\u5165\u5BFC\u51FA";
      this.defaultSettings = {
        enabled: false,
        autoApply: true,
        defaultPresetId: null
      };
    }
    async init() {
      loadPresets();
      if (_presets.length === 0) {
        createPreset("\u9ED8\u8BA4\u9884\u8BBE", getDefaultSegments());
      }
    }
    renderUI($container, settings) {
      const presets2 = loadPresets();
      const activePreset = getActivePreset();
      const html = `
            <div class="stk-ai-inst-container">
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u9884\u8BBE\u7BA1\u7406</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px;margin-bottom:8px">
                            <select id="stk_ai_preset_select" class="text_pole" style="flex:1">
                                ${presets2.map((p) => `<option value="${p.id}"${p.id === _activePresetId ? " selected" : ""}>${_.escape(p.name)}</option>`).join("")}
                            </select>
                            <div class="stk-btn primary" id="stk_ai_preset_new">+ \u65B0\u5EFA</div>
                            <div class="stk-btn" id="stk_ai_preset_dup">\u590D\u5236</div>
                            <div class="stk-btn" id="stk_ai_preset_del" style="color:#ff6b6b">\u5220\u9664</div>
                        </div>
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_ai_preset_import">\u5BFC\u5165</div>
                            <div class="stk-btn" id="stk_ai_preset_export">\u5BFC\u51FA\u5F53\u524D</div>
                            <div class="stk-btn" id="stk_ai_preset_export_all">\u5BFC\u51FA\u5168\u90E8</div>
                        </div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u6BB5\u843D\u7F16\u8F91 - ${activePreset ? _.escape(activePreset.name) : "\u65E0\u9884\u8BBE"}</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_ai_segments_container">
                        ${this._renderSegments(activePreset)}
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u9884\u89C8</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <textarea id="stk_ai_preview" class="text_pole" rows="6" readonly style="font-size:12px;resize:vertical">${_.escape(buildPrompt())}</textarea>
                    </div>
                </div>
            </div>
        `;
      $container.html(html);
    }
    _renderSegments(preset) {
      if (!preset || !preset.segments || preset.segments.length === 0) {
        return '<div style="text-align:center;color:var(--stk-text-3);padding:20px">\u65E0\u6BB5\u843D\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6DFB\u52A0</div>';
      }
      const sorted = [...preset.segments].sort((a, b) => a.order - b.order);
      return sorted.map((seg, idx) => `
            <div class="stk-segment-item" data-id="${seg.id}" style="background:rgba(0,0,0,0.15);border-radius:6px;padding:10px;margin:6px 0">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="color:var(--stk-text-3);font-size:11px">#${idx + 1}</span>
                        <input type="text" class="text_pole stk-seg-name" value="${_.escape(seg.name)}" style="width:120px;font-size:12px" />
                        <select class="text_pole stk-seg-role" style="width:80px;font-size:12px">
                            <option value="system" ${seg.role === "system" ? "selected" : ""}>system</option>
                            <option value="user" ${seg.role === "user" ? "selected" : ""}>user</option>
                            <option value="assistant" ${seg.role === "assistant" ? "selected" : ""}>assistant</option>
                        </select>
                    </div>
                    <div style="display:flex;gap:4px">
                        ${seg.deletable ? `<div class="stk-btn stk-seg-del" data-id="${seg.id}" style="padding:2px 6px;font-size:10px;color:#ff6b6b">\u5220\u9664</div>` : ""}
                    </div>
                </div>
                <textarea class="text_pole stk-seg-content" rows="3" style="font-size:12px;resize:vertical">${_.escape(seg.content)}</textarea>
            </div>
        `).join("") + `
            <div class="stk-btn" id="stk_ai_add_segment" style="width:100%;margin-top:8px">+ \u6DFB\u52A0\u6BB5\u843D</div>
        `;
    }
    bindUI(settings, save) {
      $(document).on("change", "#stk_ai_preset_select", (e) => {
        setActivePreset(e.target.value);
        this._refreshSegments();
      });
      $(document).on("click", "#stk_ai_preset_new", () => {
        const name = prompt("\u9884\u8BBE\u540D\u79F0\uFF1A", "\u65B0\u9884\u8BBE");
        if (name) {
          createPreset(name, getDefaultSegments());
          this._refreshPresetList();
          toastr.success("\u5DF2\u521B\u5EFA\u9884\u8BBE", "AI\u6307\u4EE4");
        }
      });
      $(document).on("click", "#stk_ai_preset_dup", () => {
        if (!_activePresetId) {
          toastr.warning("\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        const copy = duplicatePreset(_activePresetId);
        if (copy) {
          this._refreshPresetList();
          toastr.success("\u5DF2\u590D\u5236\u9884\u8BBE", "AI\u6307\u4EE4");
        }
      });
      $(document).on("click", "#stk_ai_preset_del", () => {
        if (!_activePresetId) return;
        if (presets.length <= 1) {
          toastr.warning("\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        if (confirm("\u786E\u5B9A\u5220\u9664\u5F53\u524D\u9884\u8BBE\uFF1F")) {
          deletePreset(_activePresetId);
          this._refreshPresetList();
          toastr.success("\u5DF2\u5220\u9664\u9884\u8BBE", "AI\u6307\u4EE4");
        }
      });
      $(document).on("click", "#stk_ai_preset_import", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const result = await uploadPresets(file);
          if (result.success) {
            toastr.success(`\u5BFC\u5165\u6210\u529F\uFF1A${result.imported} \u4E2A\u9884\u8BBE`, "AI\u6307\u4EE4");
            if (result.skipped > 0) toastr.warning(`\u8DF3\u8FC7 ${result.skipped} \u4E2A`, "AI\u6307\u4EE4");
            this._refreshPresetList();
          } else {
            toastr.error(result.error || "\u5BFC\u5165\u5931\u8D25", "AI\u6307\u4EE4");
          }
        };
        input.click();
      });
      $(document).on("click", "#stk_ai_preset_export", () => {
        if (!_activePresetId) {
          toastr.warning("\u8BF7\u5148\u9009\u62E9\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        const preset = _presets.find((p) => p.id === _activePresetId);
        downloadPresets([_activePresetId], `ai-instruction-${preset?.name || "export"}.json`);
        toastr.success("\u5DF2\u5BFC\u51FA\u9884\u8BBE", "AI\u6307\u4EE4");
      });
      $(document).on("click", "#stk_ai_preset_export_all", () => {
        if (_presets.length === 0) {
          toastr.warning("\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        downloadPresets();
        toastr.success("\u5DF2\u5BFC\u51FA\u5168\u90E8\u9884\u8BBE", "AI\u6307\u4EE4");
      });
      $(document).on("click", "#stk_ai_add_segment", () => {
        if (!_activePresetId) {
          toastr.warning("\u8BF7\u5148\u9009\u62E9\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        addSegment(_activePresetId, { role: "user", name: "\u65B0\u6BB5\u843D", content: "" });
        this._refreshSegments();
      });
      $(document).on("click", ".stk-seg-del", (e) => {
        const segId = $(e.currentTarget).data("id");
        if (deleteSegment(_activePresetId, segId)) {
          this._refreshSegments();
          toastr.success("\u5DF2\u5220\u9664\u6BB5\u843D", "AI\u6307\u4EE4");
        }
      });
      $(document).on("input", ".stk-seg-name", (e) => {
        const $item = $(e.currentTarget).closest(".stk-segment-item");
        const segId = $item.data("id");
        updateSegment(_activePresetId, segId, { name: e.target.value });
        this._updatePreview();
      });
      $(document).on("change", ".stk-seg-role", (e) => {
        const $item = $(e.currentTarget).closest(".stk-segment-item");
        const segId = $item.data("id");
        updateSegment(_activePresetId, segId, { role: e.target.value });
        this._updatePreview();
      });
      $(document).on("input", ".stk-seg-content", (e) => {
        const $item = $(e.currentTarget).closest(".stk-segment-item");
        const segId = $item.data("id");
        updateSegment(_activePresetId, segId, { content: e.target.value });
        this._updatePreview();
      });
    }
    _refreshPresetList() {
      const presets2 = loadPresets();
      const $select = $("#stk_ai_preset_select");
      if ($select.length) {
        $select.empty().append(presets2.map(
          (p) => `<option value="${p.id}"${p.id === _activePresetId ? " selected" : ""}>${_.escape(p.name)}</option>`
        ).join(""));
      }
      this._refreshSegments();
    }
    _refreshSegments() {
      const $container = $("#stk_ai_segments_container");
      if ($container.length) {
        const preset = getActivePreset();
        $container.html(this._renderSegments(preset));
        const $header = $container.closest(".stk-section").find(".stk-section-header span:first");
        if ($header.length) $header.text("\u6BB5\u843D\u7F16\u8F91 - " + (preset ? preset.name : "\u65E0\u9884\u8BBE"));
      }
      this._updatePreview();
    }
    _updatePreview() {
      const $preview = $("#stk_ai_preview");
      if ($preview.length) {
        $preview.val(buildPrompt());
      }
    }
  };
  var aiInstructionsModule = new AIInstructionsModule();

  // src/modules/worldbookConfig.js
  var STORAGE_KEY = "stk_worldbook_config";
  var GLOBAL_META_KEY = "stk_worldbook_global_meta";
  var DEFAULT_ENTRY_CONFIG = {
    enabled: true,
    position: 0,
    depth: 4,
    selectivity: 0,
    useProbability: true,
    displayIndex: 100
  };
  var _config = null;
  var _globalMeta = null;
  function loadConfig() {
    if (_config !== null) return _config;
    try {
      _config = storage.get(STORAGE_KEY) || {
        zeroTkOccupyMode: false,
        zeroTkOccupyModeGlobal: false,
        outlineEntryEnabled: true,
        entries: {}
      };
    } catch {
      _config = {
        zeroTkOccupyMode: false,
        zeroTkOccupyModeGlobal: false,
        outlineEntryEnabled: true,
        entries: {}
      };
    }
    return _config;
  }
  function saveConfig() {
    storage.set(STORAGE_KEY, _config);
  }
  function loadGlobalMeta() {
    if (_globalMeta !== null) return _globalMeta;
    try {
      _globalMeta = storage.get(GLOBAL_META_KEY) || {
        zeroTkOccupyModeGlobal: false
      };
    } catch {
      _globalMeta = { zeroTkOccupyModeGlobal: false };
    }
    return _globalMeta;
  }
  function saveGlobalMeta() {
    storage.set(GLOBAL_META_KEY, _globalMeta);
  }
  var WorldbookConfigManager = {
    get config() {
      return loadConfig();
    },
    get globalMeta() {
      return loadGlobalMeta();
    },
    get zeroTkOccupyMode() {
      const meta = loadGlobalMeta();
      return meta.zeroTkOccupyModeGlobal === true;
    },
    set zeroTkOccupyMode(value) {
      const config = loadConfig();
      const meta = loadGlobalMeta();
      config.zeroTkOccupyMode = !!value;
      config.outlineEntryEnabled = !config.zeroTkOccupyMode;
      meta.zeroTkOccupyModeGlobal = config.zeroTkOccupyMode;
      saveConfig();
      saveGlobalMeta();
    },
    get outlineEntryEnabled() {
      return !this.zeroTkOccupyMode;
    },
    async setZeroTkOccupyMode(enabled) {
      this.zeroTkOccupyMode = !!enabled;
      await this.syncToWorldbook();
      return true;
    },
    getEntryConfig(entryKey) {
      const config = loadConfig();
      if (!config.entries[entryKey]) {
        config.entries[entryKey] = { ...DEFAULT_ENTRY_CONFIG };
        saveConfig();
      }
      return config.entries[entryKey];
    },
    setEntryConfig(entryKey, entryConfig) {
      const config = loadConfig();
      config.entries[entryKey] = { ...DEFAULT_ENTRY_CONFIG, ...entryConfig };
      saveConfig();
    },
    async toggleEntry(entryKey, enabled) {
      const ctx = SillyTavern?.getContext?.();
      if (!ctx) return false;
      try {
        const find = await ctx.executeSlashCommandsWithOptions(
          `/findentry file=${Core.WORLD_BOOK} field=key ${entryKey}`
        );
        if (find?.pipe) {
          await ctx.executeSlashCommandsWithOptions(
            `/setentryfield file=${Core.WORLD_BOOK} uid=${find.pipe} field=enabled ${enabled ? "true" : "false"}`
          );
          return true;
        }
      } catch (e) {
        console.warn("[SmartToolkit] toggleEntry failed:", e);
      }
      return false;
    },
    async syncToWorldbook() {
      const ctx = SillyTavern?.getContext?.();
      if (!ctx) return false;
      try {
        const entries = await this.listWorldbookEntries();
        const zeroTkMode = this.zeroTkOccupyMode;
        for (const entry of entries) {
          if (entry.key && entry.key.startsWith("stk_")) {
            const shouldEnable = !zeroTkMode;
            if (entry.enabled !== shouldEnable) {
              await this.toggleEntry(entry.key, shouldEnable);
            }
          }
        }
        return true;
      } catch (e) {
        console.warn("[SmartToolkit] syncToWorldbook failed:", e);
        return false;
      }
    },
    async listWorldbookEntries() {
      const ctx = SillyTavern?.getContext?.();
      if (!ctx) return [];
      try {
        const worldInfo = ctx.worldInfo || [];
        const entries = [];
        for (const wb of worldInfo) {
          if (wb.entries) {
            for (const entry of wb.entries) {
              entries.push({
                uid: entry.uid,
                key: entry.key,
                keys: entry.keys,
                content: entry.content,
                enabled: entry.enabled,
                comment: entry.comment,
                type: entry.type,
                order: entry.order,
                position: entry.position,
                depth: entry.depth
              });
            }
          }
        }
        return entries;
      } catch (e) {
        console.warn("[SmartToolkit] listWorldbookEntries failed:", e);
        return [];
      }
    },
    async getEntryByComment(comment) {
      const entries = await this.listWorldbookEntries();
      return entries.find((e) => e.comment === comment);
    },
    async setEntryEnabled(uid, enabled) {
      const ctx = SillyTavern?.getContext?.();
      if (!ctx) return false;
      try {
        await ctx.executeSlashCommandsWithOptions(
          `/setentryfield file=${Core.WORLD_BOOK} uid=${uid} field=enabled ${enabled ? "true" : "false"}`
        );
        return true;
      } catch (e) {
        console.warn("[SmartToolkit] setEntryEnabled failed:", e);
        return false;
      }
    },
    exportConfig() {
      const config = loadConfig();
      const meta = loadGlobalMeta();
      return {
        version: 1,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        config,
        globalMeta: meta
      };
    },
    importConfig(data) {
      try {
        if (!data || data.version !== 1) {
          return { success: false, error: "Invalid config format" };
        }
        if (data.config) {
          _config = data.config;
          saveConfig();
        }
        if (data.globalMeta) {
          _globalMeta = data.globalMeta;
          saveGlobalMeta();
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    resetConfig() {
      _config = {
        zeroTkOccupyMode: false,
        zeroTkOccupyModeGlobal: false,
        outlineEntryEnabled: true,
        entries: {}
      };
      saveConfig();
      _globalMeta = { zeroTkOccupyModeGlobal: false };
      saveGlobalMeta();
    }
  };
  var WorldbookConfigModule = class {
    constructor() {
      this.id = "worldbookConfig";
      this.name = "\u4E16\u754C\u4E66\u914D\u7F6E";
      this.description = "\u7BA1\u7406\u4E16\u754C\u4E66\u6761\u76EE\u72B6\u6001\uFF0C\u652F\u63010TK\u5360\u7528\u6A21\u5F0F";
      this.defaultSettings = {
        enabled: false,
        autoSync: true
      };
    }
    async init() {
      loadConfig();
      loadGlobalMeta();
    }
    renderUI(settings) {
      const zeroTkMode = WorldbookConfigManager.zeroTkOccupyMode;
      return `
            <div class="stk-wb-config-section">
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>0TK \u5360\u7528\u6A21\u5F0F</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-toggle stk-wb-0tk-toggle">
                            <input type="checkbox" id="stk_wb_0tk_mode" ${zeroTkMode ? "checked" : ""} />
                            <span>\u542F\u7528 0TK \u5360\u7528\u6A21\u5F0F</span>
                        </div>
                        <div style="font-size:11px;color:var(--stk-text-3);margin-top:8px">
                            \u542F\u7528\u540E\uFF0C\u6240\u6709STK\u76F8\u5173\u4E16\u754C\u4E66\u6761\u76EE\u5C06\u88AB\u7981\u7528\uFF0C\u8282\u7701Token\u5360\u7528\u3002<br>
                            \u6761\u76EE\u5728\u4E16\u754C\u4E66\u4E2D\u663E\u793A\u4E3A"\u7981\u7528"\u72B6\u6001\uFF0C\u5173\u95ED\u6B64\u9009\u9879\u540E\u81EA\u52A8\u6062\u590D\u542F\u7528\u3002
                        </div>
                    </div>
                </div>
                
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u540C\u6B65\u64CD\u4F5C</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_wb_sync_now">\u7ACB\u5373\u540C\u6B65</div>
                            <div class="stk-btn" id="stk_wb_refresh_list">\u5237\u65B0\u6761\u76EE\u5217\u8868</div>
                        </div>
                    </div>
                </div>
                
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u6761\u76EE\u5217\u8868</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_wb_entries_list">
                        <div style="text-align:center;color:var(--stk-text-3);padding:20px">
                            \u70B9\u51FB"\u5237\u65B0\u6761\u76EE\u5217\u8868"\u52A0\u8F7D
                        </div>
                    </div>
                </div>
                
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u914D\u7F6E\u7BA1\u7406</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_wb_export_config">\u5BFC\u51FA\u914D\u7F6E</div>
                            <div class="stk-btn" id="stk_wb_import_config">\u5BFC\u5165\u914D\u7F6E</div>
                            <div class="stk-btn" id="stk_wb_reset_config" style="color:#ff6b6b">\u91CD\u7F6E</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    bindUI(settings, save) {
      $(document).on("change", "#stk_wb_0tk_mode", async (e) => {
        const enabled = $(e.target).is(":checked");
        await WorldbookConfigManager.setZeroTkOccupyMode(enabled);
        toastr.success(`0TK\u5360\u7528\u6A21\u5F0F\u5DF2${enabled ? "\u542F\u7528" : "\u7981\u7528"}`, "\u4E16\u754C\u4E66\u914D\u7F6E");
        this._refreshEntriesList();
      });
      $(document).on("click", "#stk_wb_sync_now", async () => {
        const result = await WorldbookConfigManager.syncToWorldbook();
        if (result) {
          toastr.success("\u540C\u6B65\u5B8C\u6210", "\u4E16\u754C\u4E66\u914D\u7F6E");
          this._refreshEntriesList();
        } else {
          toastr.error("\u540C\u6B65\u5931\u8D25", "\u4E16\u754C\u4E66\u914D\u7F6E");
        }
      });
      $(document).on("click", "#stk_wb_refresh_list", () => {
        this._refreshEntriesList();
      });
      $(document).on("click", "#stk_wb_export_config", () => {
        const config = WorldbookConfigManager.exportConfig();
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "stk-worldbook-config.json";
        a.click();
        URL.revokeObjectURL(url);
        toastr.success("\u914D\u7F6E\u5DF2\u5BFC\u51FA", "\u4E16\u754C\u4E66\u914D\u7F6E");
      });
      $(document).on("click", "#stk_wb_import_config", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            const result = WorldbookConfigManager.importConfig(data);
            if (result.success) {
              toastr.success("\u914D\u7F6E\u5DF2\u5BFC\u5165", "\u4E16\u754C\u4E66\u914D\u7F6E");
              this._refreshUI();
            } else {
              toastr.error(result.error || "\u5BFC\u5165\u5931\u8D25", "\u4E16\u754C\u4E66\u914D\u7F6E");
            }
          } catch (err) {
            toastr.error("\u6587\u4EF6\u89E3\u6790\u5931\u8D25", "\u4E16\u754C\u4E66\u914D\u7F6E");
          }
        };
        input.click();
      });
      $(document).on("click", "#stk_wb_reset_config", () => {
        if (confirm("\u786E\u5B9A\u8981\u91CD\u7F6E\u6240\u6709\u4E16\u754C\u4E66\u914D\u7F6E\u5417\uFF1F")) {
          WorldbookConfigManager.resetConfig();
          toastr.success("\u914D\u7F6E\u5DF2\u91CD\u7F6E", "\u4E16\u754C\u4E66\u914D\u7F6E");
          this._refreshUI();
        }
      });
      $(document).on("click", ".stk-wb-entry-toggle", async (e) => {
        const uid = $(e.currentTarget).data("uid");
        const enabled = $(e.currentTarget).data("enabled") === true;
        const result = await WorldbookConfigManager.setEntryEnabled(uid, !enabled);
        if (result) {
          $(e.currentTarget).data("enabled", !enabled);
          $(e.currentTarget).text(!enabled ? "\u7981\u7528" : "\u542F\u7528");
          toastr.success(`\u6761\u76EE\u5DF2${!enabled ? "\u542F\u7528" : "\u7981\u7528"}`, "\u4E16\u754C\u4E66\u914D\u7F6E");
        }
      });
    }
    async _refreshEntriesList() {
      const $list = $("#stk_wb_entries_list");
      if (!$list.length) return;
      $list.html('<div style="text-align:center;padding:20px">\u52A0\u8F7D\u4E2D...</div>');
      const entries = await WorldbookConfigManager.listWorldbookEntries();
      const stkEntries = entries.filter(
        (e) => e.key && e.key.startsWith("stk_") || e.comment && e.comment.includes("STK") || e.comment && e.comment.includes("SmartToolkit")
      );
      if (stkEntries.length === 0) {
        $list.html('<div style="text-align:center;color:var(--stk-text-3);padding:20px">\u6CA1\u6709\u627E\u5230STK\u76F8\u5173\u6761\u76EE</div>');
        return;
      }
      const html = stkEntries.map((e) => `
            <div class="stk-wb-entry-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:rgba(0,0,0,0.15);border-radius:4px;margin:4px 0">
                <div>
                    <div style="font-size:12px;font-weight:500">${_.escape(e.key || e.comment || "\u672A\u547D\u540D")}</div>
                    <div style="font-size:10px;color:var(--stk-text-3)">${e.enabled ? "\u2713 \u542F\u7528" : "\u25CB \u7981\u7528"}</div>
                </div>
                <div class="stk-btn stk-wb-entry-toggle" data-uid="${e.uid}" data-enabled="${e.enabled}" style="padding:2px 8px;font-size:11px">
                    ${e.enabled ? "\u7981\u7528" : "\u542F\u7528"}
                </div>
            </div>
        `).join("");
      $list.html(html);
    }
    _refreshUI() {
      const zeroTkMode = WorldbookConfigManager.zeroTkOccupyMode;
      $("#stk_wb_0tk_mode").prop("checked", zeroTkMode);
      this._refreshEntriesList();
    }
  };
  var worldbookConfigModule = new WorldbookConfigModule();

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
<style id="stk-styles">
:root {
  --stk-bg: var(--SmartThemeBlurTintColor, #1a1a2e);
  --stk-border: var(--SmartThemeBorderColor, rgba(255,255,255,0.1));
  --stk-text: var(--SmartThemeBodyColor, #e0e0e0);
  --stk-text-2: rgba(255,255,255,0.7);
  --stk-text-3: rgba(255,255,255,0.5);
  --stk-accent: linear-gradient(135deg, rgba(123, 183, 255, 0.22), rgba(155, 123, 255, 0.14));
  --stk-accent-solid: #7bb7ff;
  --stk-radius: 8px;
  --stk-radius-lg: 12px;
}

#stk-window {
  position: fixed;
  background: var(--stk-bg);
  border: 1px solid var(--stk-border);
  border-radius: var(--stk-radius-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
  z-index: 31000;
  display: none;
  flex-direction: column;
  overflow: hidden;
  min-width: 400px;
  min-height: 300px;
}
#stk-window.open { display: flex; }
#stk-window.maximized {
  top: 0 !important; left: 0 !important;
  width: 100vw !important; height: 100vh !important;
  border-radius: 0;
}

#stk-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--stk-border);
  cursor: move;
  user-select: none;
  background: var(--stk-accent);
  flex-shrink: 0;
}
#stk-window-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--stk-text);
}
#stk-window-title i { color: var(--stk-accent-solid); }
#stk-window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stk-window-btn {
  width: 28px; height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.7;
  transition: all 0.15s;
  color: var(--stk-text);
}
.stk-window-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
.stk-window-btn.close:hover { background: rgba(255,100,100,0.3); }

#stk-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

#stk-nav {
  width: 180px;
  background: rgba(0,0,0,0.15);
  border-right: 1px solid var(--stk-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
}
.stk-nav-section {
  padding: 8px 0;
  border-bottom: 1px solid var(--stk-border);
}
.stk-nav-section:last-child { border-bottom: none; }
.stk-nav-title {
  padding: 6px 14px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--stk-text-3);
}
.stk-nav-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--stk-text-2);
  transition: all 0.15s;
  border-left: 3px solid transparent;
}
.stk-nav-btn:hover { background: rgba(255,255,255,0.05); color: var(--stk-text); }
.stk-nav-btn.active {
  background: var(--stk-accent);
  color: var(--stk-text);
  border-left-color: var(--stk-accent-solid);
}
.stk-nav-btn i { width: 16px; text-align: center; }

#stk-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.stk-tab { display: none; }
.stk-tab.active { display: block; }

.stk-section {
  border: 1px solid var(--stk-border);
  border-radius: var(--stk-radius);
  overflow: hidden;
  margin-bottom: 12px;
}
.stk-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  font-size: 13px;
  color: var(--stk-text);
  background: rgba(255,255,255,0.03);
}
.stk-section-header:hover { background: rgba(255,255,255,0.06); }
.stk-section-header .stk-arrow { transition: transform 0.2s; font-size: 11px; }
.stk-section-header.collapsed .stk-arrow { transform: rotate(-90deg); }
.stk-section-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--stk-border);
}
.stk-section-body.stk-hidden { display: none; }

.stk-row { display: flex; align-items: center; gap: 8px; }
.stk-row label {
  font-size: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--stk-text);
}
.stk-row label > span { font-size: 11px; opacity: 0.7; }
.stk-row .text_pole {
  font-size: 12px;
  padding: 6px 10px;
  background: rgba(0,0,0,0.2);
  border: 1px solid var(--stk-border);
  border-radius: 6px;
  color: var(--stk-text);
}
.stk-row .text_pole:focus { outline: none; border-color: var(--stk-accent-solid); }
.stk-row select.text_pole { padding: 5px 8px; }
.stk-row textarea.text_pole { font-family: monospace; font-size: 11px; resize: vertical; min-height: 80px; }

.stk-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--stk-text); }
.stk-toggle input[type=checkbox] { margin: 0; width: 16px; height: 16px; }

.stk-btn {
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  border: 1px solid var(--stk-border);
  background: rgba(255,255,255,0.05);
  color: var(--stk-text);
  transition: all 0.15s;
}
.stk-btn:hover { background: rgba(255,255,255,0.1); }
.stk-btn.primary { background: var(--stk-accent); border-color: transparent; }
.stk-btn.primary:hover { filter: brightness(1.1); }

.stk-sub-section {
  border: 1px dashed var(--stk-border);
  border-radius: 6px;
  overflow: hidden;
  margin-top: 4px;
}
.stk-sub-header {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--stk-text-2);
}
.stk-sub-header:hover { background: rgba(255,255,255,0.03); }
.stk-sub-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--stk-border);
}
.stk-sub-body.stk-hidden { display: none; }

.stk-resize-handle {
  position: absolute;
  background: transparent;
}
.stk-resize-handle.se {
  right: 0; bottom: 0;
  width: 16px; height: 16px;
  cursor: se-resize;
}
.stk-resize-handle.e { right: 0; top: 50px; width: 6px; height: calc(100% - 100px); cursor: e-resize; }
.stk-resize-handle.s { bottom: 0; left: 50px; width: calc(100% - 100px); height: 6px; cursor: s-resize; }
.stk-resize-handle.w { left: 0; top: 50px; width: 6px; height: calc(100% - 100px); cursor: w-resize; }
.stk-resize-handle.n { top: 0; left: 50px; width: calc(100% - 100px); height: 6px; cursor: n-resize; }

#stk-plot-options {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 340px;
  background: var(--stk-bg);
  border: 1px solid var(--stk-border);
  border-radius: var(--stk-radius-lg);
  z-index: 31001;
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
  overflow: hidden;
}
.stk-po-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid var(--stk-border);
  cursor: move;
  user-select: none;
}
#stk-po-close { cursor: pointer; padding: 4px; opacity: 0.7; }
#stk-po-close:hover { opacity: 1; }
.stk-po-item {
  padding: 10px 14px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid var(--stk-border);
  transition: background 0.15s;
  color: var(--stk-text);
}
.stk-po-item:hover { background: rgba(255,255,255,0.05); }
.stk-po-item:last-child { border-bottom: none; }

@media (max-width: 1100px) {
  #stk-nav { width: 50px; }
  .stk-nav-title { display: none; }
  .stk-nav-btn { justify-content: center; padding: 12px 0; }
  .stk-nav-btn span { display: none; }
}
@media (max-width: 768px) {
  #stk-window { width: 100vw !important; height: 100vh !important; top: 0 !important; left: 0 !important; border-radius: 0; }
  #stk-nav { width: 50px; }
}
</style>`;
  var windowState = {
    x: 100,
    y: 80,
    width: 900,
    height: 650,
    activeTab: "modules",
    maximized: false
  };
  function loadWindowState() {
    try {
      const saved = localStorage.getItem("stk-window-state");
      if (saved) {
        const parsed = JSON.parse(saved);
        windowState = { ...windowState, ...parsed };
      }
    } catch (e) {
    }
  }
  function saveWindowState() {
    localStorage.setItem("stk-window-state", JSON.stringify(windowState));
  }
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
    toggle() {
      const $win = $("#stk-window");
      if ($win.length) {
        $win.toggleClass("open");
        if ($win.hasClass("open")) this._bringToFront();
      }
    },
    show() {
      const $win = $("#stk-window");
      if ($win.length) {
        $win.addClass("open");
        this._bringToFront();
      }
    },
    hide() {
      $("#stk-window").removeClass("open");
    },
    _bringToFront() {
      const maxZ = Math.max(31e3, ...$("body > *").map(function() {
        const z = parseInt($(this).css("z-index")) || 0;
        return z;
      }).get());
      $("#stk-window").css("z-index", maxZ + 1);
    },
    _registerExtensionMenu() {
      if (typeof addAutoCardMenuItem_ACU === "function") {
        addAutoCardMenuItem_ACU(
          "Smart Toolkit",
          "fa-solid fa-toolbox",
          () => this.toggle()
        );
        return;
      }
      const tryRegister = () => {
        const $menu = $("#extensionsMenu");
        if ($menu.length) {
          const $item = $(`
                    <div class="list-group-item flex-container flexGap5 interactable" id="stk-menu-item">
                        <span class="fa-solid fa-toolbox extensionsMenuButtonIcon"></span>
                        <span>Smart Toolkit</span>
                    </div>
                `);
          $item.on("click", () => this.toggle());
          $menu.append($item);
        }
      };
      if (typeof eventSource !== "undefined" && eventSource.on) {
        eventSource.on("extensions_loaded", tryRegister);
      }
      setTimeout(tryRegister, 1e3);
    },
    render(modules3) {
      const s = Core.getSettings();
      if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
      const sh = s._shared;
      loadWindowState();
      $("head").append(CSS);
      this._registerExtensionMenu();
      const moduleOverviewHtml = modules3.map((m) => {
        const ms = Core.getModuleSettings(m.id, m.defaultSettings);
        return `
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
      }).join("");
      const moduleSettingsHtml = modules3.map((m) => {
        const ms = Core.getModuleSettings(m.id, m.defaultSettings);
        return `
            <div class="stk-section" id="stk_module_${m.id}">
                <div class="stk-section-header interactable collapsed" tabindex="0">
                    <span>${m.name} \u8BBE\u7F6E</span>
                    <span class="stk-arrow fa-solid fa-chevron-down"></span>
                </div>
                <div class="stk-section-body stk-hidden">
                    ${m.renderUI(ms)}
                </div>
            </div>`;
      }).join("");
      const promptsHtml = modules3.map((m) => {
        if (!m.templatePrompts) return "";
        return Object.entries(m.templatePrompts).map(([key, def]) => `
                <div class="stk-sub-section">
                    <div class="stk-sub-header interactable" tabindex="0">
                        <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                        ${m.name} - ${key}
                    </div>
                    <div class="stk-sub-body stk-hidden">
                        <textarea id="stk_prompt_${key}" class="text_pole" rows="8" style="font-family:monospace;font-size:11px;white-space:pre;resize:vertical">${_.escape(def)}</textarea>
                        <div class="stk-btn interactable stk_prompt_save" data-key="${key}" style="align-self:flex-end" tabindex="0">\u4FDD\u5B58\u5230\u4E16\u754C\u4E66</div>
                    </div>
                </div>
            `).join("");
      }).join("");
      const navHtml = `
            <div class="stk-nav-section">
                <div class="stk-nav-title">\u6838\u5FC3</div>
                <div class="stk-nav-btn active" data-tab="modules"><i class="fa-solid fa-puzzle-piece"></i><span>\u6A21\u5757\u7BA1\u7406</span></div>
                <div class="stk-nav-btn" data-tab="api"><i class="fa-solid fa-plug"></i><span>API \u914D\u7F6E</span></div>
                <div class="stk-nav-btn" data-tab="api_presets"><i class="fa-solid fa-database"></i><span>API \u9884\u8BBE\u7BA1\u7406</span></div>
                <div class="stk-nav-btn" data-tab="ai_instructions"><i class="fa-solid fa-wand-magic-sparkles"></i><span>AI \u6307\u4EE4\u9884\u8BBE</span></div>
                <div class="stk-nav-btn" data-tab="worldbook_config"><i class="fa-solid fa-book"></i><span>\u4E16\u754C\u4E66\u914D\u7F6E</span></div>
                <div class="stk-nav-btn" data-tab="prompts"><i class="fa-solid fa-file-lines"></i><span>\u6A21\u677F\u63D0\u793A\u8BCD</span></div>
            </div>
            <div class="stk-nav-section">
                <div class="stk-nav-title">\u6A21\u5757\u8BBE\u7F6E</div>
                ${modules3.map((m) => `
                    <div class="stk-nav-btn" data-tab="module_${m.id}"><i class="fa-solid fa-cog"></i><span>${m.name}</span></div>
                `).join("")}
            </div>
        `;
      const contentHtml = `
            <div class="stk-tab active" id="stk-tab-modules">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">\u6A21\u5757\u7BA1\u7406</h3>
                ${moduleOverviewHtml}
            </div>
            <div class="stk-tab" id="stk-tab-api">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">API \u914D\u7F6E</h3>
                <div class="stk-section">
                    <div class="stk-section-body">
                        <div class="stk-toggle">
                            <input type="checkbox" id="stk_use_preset" ${sh.use_preset ? "checked" : ""} />
                            <span>\u4F7F\u7528\u5F53\u524D\u9884\u8BBE</span>
                        </div>
                        <div id="stk_custom_api" style="display:${sh.use_preset ? "none" : "flex"};flex-direction:column;gap:8px;">
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
            <div class="stk-tab" id="stk-tab-api_presets">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">API \u9884\u8BBE\u7BA1\u7406</h3>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u9884\u8BBE\u5217\u8868</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px;margin-bottom:8px">
                            <div class="stk-btn primary" id="stk_preset_new">+ \u65B0\u5EFA\u9884\u8BBE</div>
                            <div class="stk-btn" id="stk_preset_import">\u5BFC\u5165</div>
                            <div class="stk-btn" id="stk_preset_export_all">\u5BFC\u51FA\u5168\u90E8</div>
                        </div>
                        <div id="stk_preset_list"></div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u6A21\u5757\u9884\u8BBE\u7ED1\u5B9A</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_preset_module_bindings">
                        ${modules3.map((m) => `
                            <div class="stk-row">
                                <label style="flex-direction:row;align-items:center;gap:8px">
                                    <span style="min-width:100px">${m.name}</span>
                                    <select class="text_pole stk-preset-binding" data-module="${m.id}" style="flex:1">
                                        <option value="">-- \u4F7F\u7528\u5168\u5C40\u914D\u7F6E --</option>
                                    </select>
                                </label>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>
            <div class="stk-tab" id="stk-tab-ai_instructions">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">AI \u6307\u4EE4\u9884\u8BBE</h3>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u9884\u8BBE\u7BA1\u7406</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px;margin-bottom:8px">
                            <select id="stk_ai_preset_select" class="text_pole" style="flex:1"></select>
                            <div class="stk-btn primary" id="stk_ai_preset_new">+ \u65B0\u5EFA</div>
                            <div class="stk-btn" id="stk_ai_preset_dup">\u590D\u5236</div>
                            <div class="stk-btn" id="stk_ai_preset_del" style="color:#ff6b6b">\u5220\u9664</div>
                        </div>
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_ai_preset_import">\u5BFC\u5165</div>
                            <div class="stk-btn" id="stk_ai_preset_export">\u5BFC\u51FA\u5F53\u524D</div>
                            <div class="stk-btn" id="stk_ai_preset_export_all">\u5BFC\u51FA\u5168\u90E8</div>
                        </div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u6BB5\u843D\u7F16\u8F91</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_ai_segments_container"></div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u9884\u89C8</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <textarea id="stk_ai_preview" class="text_pole" rows="6" readonly style="font-size:12px;resize:vertical"></textarea>
                    </div>
                </div>
            </div>
            <div class="stk-tab" id="stk-tab-worldbook_config">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">\u4E16\u754C\u4E66\u914D\u7F6E</h3>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>0TK \u5360\u7528\u6A21\u5F0F</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-toggle">
                            <input type="checkbox" id="stk_wb_0tk_mode" />
                            <span>\u542F\u7528 0TK \u5360\u7528\u6A21\u5F0F</span>
                        </div>
                        <div style="font-size:11px;color:var(--stk-text-3);margin-top:8px">
                            \u542F\u7528\u540E\uFF0C\u6240\u6709STK\u76F8\u5173\u4E16\u754C\u4E66\u6761\u76EE\u5C06\u88AB\u7981\u7528\uFF0C\u8282\u7701Token\u5360\u7528\u3002\u6761\u76EE\u5728\u4E16\u754C\u4E66\u4E2D\u663E\u793A\u4E3A"\u7981\u7528"\u72B6\u6001\uFF0C\u5173\u95ED\u6B64\u9009\u9879\u540E\u81EA\u52A8\u6062\u590D\u542F\u7528\u3002
                        </div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u540C\u6B65\u64CD\u4F5C</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_wb_sync_now">\u7ACB\u5373\u540C\u6B65</div>
                            <div class="stk-btn" id="stk_wb_refresh_list">\u5237\u65B0\u6761\u76EE\u5217\u8868</div>
                        </div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u6761\u76EE\u5217\u8868</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_wb_entries_list">
                        <div style="text-align:center;color:var(--stk-text-3);padding:20px">\u70B9\u51FB"\u5237\u65B0\u6761\u76EE\u5217\u8868"\u52A0\u8F7D</div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>\u914D\u7F6E\u7BA1\u7406</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_wb_export_config">\u5BFC\u51FA\u914D\u7F6E</div>
                            <div class="stk-btn" id="stk_wb_import_config">\u5BFC\u5165\u914D\u7F6E</div>
                            <div class="stk-btn" id="stk_wb_reset_config" style="color:#ff6b6b">\u91CD\u7F6E</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="stk-tab" id="stk-tab-prompts">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">\u6A21\u677F\u63D0\u793A\u8BCD</h3>
                <div style="font-size:11px;opacity:.6;margin-bottom:12px;">\u63D0\u793A\u8BCD\u5B58\u50A8\u5728\u4E16\u754C\u4E66\u300C${Core.WORLD_BOOK}\u300D\u4E2D\uFF0C\u4FEE\u6539\u540E\u81EA\u52A8\u540C\u6B65\u3002</div>
                ${promptsHtml}
            </div>
            ${modules3.map((m) => `
                <div class="stk-tab" id="stk-tab-module_${m.id}">
                    <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">${m.name} \u8BBE\u7F6E</h3>
                    <div id="stk_module_settings_${m.id}"></div>
                </div>
            `).join("")}
        `;
      const windowHtml = `
            <div id="stk-window" style="left:${windowState.x}px;top:${windowState.y}px;width:${windowState.width}px;height:${windowState.height}px;">
                <div id="stk-window-header">
                    <div id="stk-window-title">
                        <i class="fa-solid fa-toolbox"></i>
                        <span>Smart Toolkit</span>
                    </div>
                    <div id="stk-window-controls">
                        <div class="stk-window-btn maximize" title="\u6700\u5927\u5316"><i class="fa-solid fa-expand"></i></div>
                        <div class="stk-window-btn close" title="\u5173\u95ED"><i class="fa-solid fa-times"></i></div>
                    </div>
                </div>
                <div id="stk-layout">
                    <div id="stk-nav">${navHtml}</div>
                    <div id="stk-content">${contentHtml}</div>
                </div>
                <div class="stk-resize-handle se"></div>
                <div class="stk-resize-handle e"></div>
                <div class="stk-resize-handle s"></div>
                <div class="stk-resize-handle w"></div>
                <div class="stk-resize-handle n"></div>
            </div>
        `;
      $("body").append(windowHtml);
      modules3.forEach((m) => {
        const ms = Core.getModuleSettings(m.id, m.defaultSettings);
        $(`#stk_module_settings_${m.id}`).html(m.renderUI(ms));
      });
      this._bindWindowEvents();
      this._bindModuleEvents(modules3, sh);
      if (windowState.activeTab) {
        this._switchTab(windowState.activeTab);
      }
    },
    _switchTab(tabId) {
      windowState.activeTab = tabId;
      saveWindowState();
      $(".stk-nav-btn").removeClass("active");
      $(`.stk-nav-btn[data-tab="${tabId}"]`).addClass("active");
      $(".stk-tab").removeClass("active");
      $(`#stk-tab-${tabId}`).addClass("active");
    },
    _bindWindowEvents() {
      const $win = $("#stk-window");
      const $header = $("#stk-window-header");
      $header.on("mousedown", (e) => {
        if ($(e.target).closest(".stk-window-btn").length) return;
        if (windowState.maximized) return;
        const isDragging = true;
        const startX = e.clientX - windowState.x;
        const startY = e.clientY - windowState.y;
        $(document).on("mousemove.stkdrag", (e2) => {
          windowState.x = Math.max(0, Math.min(e2.clientX - startX, window.innerWidth - 100));
          windowState.y = Math.max(0, Math.min(e2.clientY - startY, window.innerHeight - 100));
          $win.css({ left: windowState.x, top: windowState.y });
        });
        $(document).on("mouseup.stkdrag", () => {
          $(document).off(".stkdrag");
          saveWindowState();
        });
      });
      $(".stk-resize-handle").on("mousedown", (e) => {
        if (windowState.maximized) return;
        e.preventDefault();
        const $handle = $(e.target);
        const dir = $handle.hasClass("se") ? "se" : $handle.hasClass("e") ? "e" : $handle.hasClass("s") ? "s" : $handle.hasClass("w") ? "w" : "n";
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = windowState.width;
        const startH = windowState.height;
        const startLeft = windowState.x;
        const startTop = windowState.y;
        $(document).on("mousemove.stkresize", (e2) => {
          const dx = e2.clientX - startX;
          const dy = e2.clientY - startY;
          if (dir.includes("e")) {
            windowState.width = Math.max(400, startW + dx);
          }
          if (dir.includes("w")) {
            const newW = Math.max(400, startW - dx);
            windowState.x = startLeft + startW - newW;
            windowState.width = newW;
          }
          if (dir.includes("s")) {
            windowState.height = Math.max(300, startH + dy);
          }
          if (dir.includes("n")) {
            const newH = Math.max(300, startH - dy);
            windowState.y = startTop + startH - newH;
            windowState.height = newH;
          }
          $win.css({
            left: windowState.x,
            top: windowState.y,
            width: windowState.width,
            height: windowState.height
          });
        });
        $(document).on("mouseup.stkresize", () => {
          $(document).off(".stkresize");
          saveWindowState();
        });
      });
      $(".stk-window-btn.maximize").on("click", () => {
        windowState.maximized = !windowState.maximized;
        $win.toggleClass("maximized", windowState.maximized);
        saveWindowState();
      });
      $(".stk-window-btn.close").on("click", () => this.hide());
      $(".stk-nav-btn").on("click", (e) => {
        const tabId = $(e.currentTarget).data("tab");
        if (tabId) this._switchTab(tabId);
      });
      $("#stk-window").on("click", ".stk-section-header", function(e) {
        e.stopPropagation();
        $(this).toggleClass("collapsed").next(".stk-section-body").toggleClass("stk-hidden");
      });
      $("#stk-window").on("click", ".stk-sub-header", function(e) {
        e.stopPropagation();
        $(this).find(".stk-arrow").toggleClass("collapsed");
        $(this).next(".stk-sub-body").toggleClass("stk-hidden");
      });
    },
    _bindModuleEvents(modules3, sh) {
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
            if (sh.model_name) $select.val(sh.model_name);
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
      modules3.forEach((m) => {
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
      });
      $(".stk_prompt_save").on("click", async function() {
        const key = $(this).data("key");
        const content = $(`#stk_prompt_${key}`).val();
        await Core.setWorldBookEntry(key, content);
        toastr.success(`\u5DF2\u4FDD\u5B58\u5230\u4E16\u754C\u4E66`, key);
      });
      modules3.forEach((m) => {
        const ms = Core.getModuleSettings(m.id, m.defaultSettings);
        m.bindUI(ms, save);
      });
      this._bindApiPresetEvents(modules3);
      this._bindAiInstructionEvents(modules3);
      this._bindWorldbookConfigEvents(modules3);
    },
    _refreshPresetList() {
      const presets2 = apiPresetManager.getAllPresets();
      const $list = $("#stk_preset_list").empty();
      if (presets2.length === 0) {
        $list.html('<div style="text-align:center;color:var(--stk-text-3);padding:20px">\u6682\u65E0\u9884\u8BBE\uFF0C\u70B9\u51FB"\u65B0\u5EFA\u9884\u8BBE"\u521B\u5EFA</div>');
        return;
      }
      presets2.forEach((p) => {
        $list.append(`
                <div class="stk-preset-item" data-id="${p.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;margin:4px 0;background:rgba(0,0,0,0.15);border-radius:6px">
                    <div>
                        <div style="font-weight:500;color:var(--stk-text)">${_.escape(p.name)}</div>
                        <div style="font-size:11px;color:var(--stk-text-3)">${_.escape(p.baseUrl)} | ${_.escape(p.model)}</div>
                    </div>
                    <div style="display:flex;gap:4px">
                        <div class="stk-btn stk-preset-edit" data-id="${p.id}" style="padding:4px 8px;font-size:11px">\u7F16\u8F91</div>
                        <div class="stk-btn stk-preset-test" data-id="${p.id}" style="padding:4px 8px;font-size:11px">\u6D4B\u8BD5</div>
                        <div class="stk-btn stk-preset-export" data-id="${p.id}" style="padding:4px 8px;font-size:11px">\u5BFC\u51FA</div>
                        <div class="stk-btn stk-preset-delete" data-id="${p.id}" style="padding:4px 8px;font-size:11px;color:#ff6b6b">\u5220\u9664</div>
                    </div>
                </div>
            `);
      });
      this._refreshPresetBindings(modules);
    },
    _refreshPresetBindings(modules3) {
      const presets2 = apiPresetManager.getAllPresets();
      $(".stk-preset-binding").each(function() {
        const moduleId = $(this).data("module");
        const currentPresetId = apiPresetManager.getModulePreset(moduleId)?.id || "";
        $(this).empty().append('<option value="">-- \u4F7F\u7528\u5168\u5C40\u914D\u7F6E --</option>');
        presets2.forEach((p) => {
          $(this).append(`<option value="${p.id}"${p.id === currentPresetId ? " selected" : ""}>${_.escape(p.name)}</option>`);
        });
      });
    },
    _bindApiPresetEvents(modules3) {
      this._refreshPresetList();
      $("#stk_preset_new").on("click", () => {
        this._showPresetEditor(null);
      });
      $("#stk_preset_import").on("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const result = await apiPresetManager.uploadPresets(file);
          if (result.success) {
            toastr.success(`\u5BFC\u5165\u6210\u529F\uFF1A${result.imported} \u4E2A\u9884\u8BBE`, "API\u9884\u8BBE");
            if (result.skipped > 0) {
              toastr.warning(`\u8DF3\u8FC7 ${result.skipped} \u4E2A`, "API\u9884\u8BBE");
            }
            this._refreshPresetList();
          } else {
            toastr.error(result.error || "\u5BFC\u5165\u5931\u8D25", "API\u9884\u8BBE");
          }
        };
        input.click();
      });
      $("#stk_preset_export_all").on("click", () => {
        const presets2 = apiPresetManager.getAllPresets();
        if (presets2.length === 0) {
          toastr.warning("\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u9884\u8BBE", "API\u9884\u8BBE");
          return;
        }
        apiPresetManager.downloadPresets();
        toastr.success("\u5DF2\u5BFC\u51FA\u5168\u90E8\u9884\u8BBE", "API\u9884\u8BBE");
      });
      $("#stk_preset_list").on("click", ".stk-preset-edit", (e) => {
        const id = $(e.currentTarget).data("id");
        this._showPresetEditor(id);
      });
      $("#stk_preset_list").on("click", ".stk-preset-test", async (e) => {
        const id = $(e.currentTarget).data("id");
        const $btn = $(e.currentTarget).text("\u6D4B\u8BD5\u4E2D...").prop("disabled", true);
        try {
          const result = await apiPresetManager.testConnection(id);
          if (result.success) {
            toastr.success("\u8FDE\u63A5\u6210\u529F", "API\u9884\u8BBE");
          } else {
            toastr.error(result.error || "\u8FDE\u63A5\u5931\u8D25", "API\u9884\u8BBE");
          }
        } catch (err) {
          toastr.error(err.message, "\u6D4B\u8BD5\u5931\u8D25");
        } finally {
          $btn.text("\u6D4B\u8BD5").prop("disabled", false);
        }
      });
      $("#stk_preset_list").on("click", ".stk-preset-export", (e) => {
        const id = $(e.currentTarget).data("id");
        const preset = apiPresetManager.getPreset(id);
        if (preset) {
          apiPresetManager.downloadPresets([id], `api-preset-${preset.name}.json`);
          toastr.success("\u5DF2\u5BFC\u51FA\u9884\u8BBE", "API\u9884\u8BBE");
        }
      });
      $("#stk_preset_list").on("click", ".stk-preset-delete", (e) => {
        const id = $(e.currentTarget).data("id");
        const preset = apiPresetManager.getPreset(id);
        if (confirm(`\u786E\u5B9A\u5220\u9664\u9884\u8BBE\u300C${preset?.name || id}\u300D\u5417\uFF1F`)) {
          apiPresetManager.deletePreset(id);
          toastr.success("\u5DF2\u5220\u9664\u9884\u8BBE", "API\u9884\u8BBE");
          this._refreshPresetList();
        }
      });
      $("#stk_preset_module_bindings").on("change", ".stk-preset-binding", (e) => {
        const moduleId = $(e.target).data("module");
        const presetId = e.target.value || null;
        apiPresetManager.setModulePreset(moduleId, presetId);
        toastr.success("\u7ED1\u5B9A\u5DF2\u66F4\u65B0", "API\u9884\u8BBE");
      });
    },
    _showPresetEditor(presetId) {
      const preset = presetId ? apiPresetManager.getPreset(presetId) : null;
      const isEdit = !!preset;
      const content = `
            <div class="stk-preset-editor">
                <div class="stk-row">
                    <label>\u9884\u8BBE\u540D\u79F0<input type="text" id="stk_pe_name" class="text_pole" value="${preset?.name || ""}" placeholder="\u8F93\u5165\u9884\u8BBE\u540D\u79F0" /></label>
                </div>
                <div class="stk-row">
                    <label>API \u5730\u5740<input type="text" id="stk_pe_url" class="text_pole" value="${preset?.baseUrl || ""}" placeholder="http://localhost:1234/v1" /></label>
                </div>
                <div class="stk-row">
                    <label>API \u5BC6\u94A5<input type="password" id="stk_pe_key" class="text_pole" value="${preset?.apiKey || ""}" /></label>
                </div>
                <div class="stk-row">
                    <label>\u6A21\u578B\u540D\u79F0<input type="text" id="stk_pe_model" class="text_pole" value="${preset?.model || ""}" placeholder="gpt-3.5-turbo" /></label>
                </div>
                <div class="stk-row" style="gap:12px">
                    <label>\u6700\u5927token<input type="number" id="stk_pe_max_tokens" class="text_pole" value="${preset?.parameters?.max_tokens || 2048}" min="256" max="8192" /></label>
                    <label>\u6E29\u5EA6<input type="number" id="stk_pe_temperature" class="text_pole" value="${preset?.parameters?.temperature || 0.7}" min="0" max="2" step="0.1" /></label>
                </div>
                <div class="stk-toggle">
                    <input type="checkbox" id="stk_pe_stream" ${preset?.parameters?.stream ? "checked" : ""} />
                    <span>\u6D41\u5F0F\u4F20\u8F93</span>
                </div>
                <div class="stk-row" style="gap:8px;margin-top:12px">
                    <div class="stk-btn" id="stk_pe_test">\u6D4B\u8BD5\u8FDE\u63A5</div>
                    <div class="stk-btn" id="stk_pe_fetch">\u83B7\u53D6\u6A21\u578B</div>
                </div>
                <div class="stk-row">
                    <label>\u9009\u62E9\u6A21\u578B<select id="stk_pe_model_select" class="text_pole"><option value="">-- \u83B7\u53D6\u6A21\u578B\u5217\u8868 --</option></select></label>
                </div>
            </div>
        `;
      const $dialog = $(`
            <div class="stk-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:32000;display:flex;align-items:center;justify-content:center">
                <div class="stk-modal" style="background:var(--stk-bg);border:1px solid var(--stk-border);border-radius:var(--stk-radius-lg);padding:20px;min-width:400px;max-width:90vw">
                    <h3 style="margin:0 0 16px;color:var(--stk-text)">${isEdit ? "\u7F16\u8F91\u9884\u8BBE" : "\u65B0\u5EFA\u9884\u8BBE"}</h3>
                    ${content}
                    <div class="stk-row" style="justify-content:flex-end;gap:8px;margin-top:16px">
                        <div class="stk-btn stk-modal-cancel">\u53D6\u6D88</div>
                        <div class="stk-btn primary stk-modal-save">${isEdit ? "\u4FDD\u5B58" : "\u521B\u5EFA"}</div>
                    </div>
                </div>
            </div>
        `);
      $("body").append($dialog);
      const closeDialog = () => $dialog.remove();
      $dialog.find(".stk-modal-cancel").on("click", closeDialog);
      $dialog.find("#stk_pe_test").on("click", async function() {
        const $btn = $(this).text("\u6D4B\u8BD5\u4E2D...").prop("disabled", true);
        try {
          const result = await apiPresetManager.testConnectionFromConfig({
            baseUrl: $("#stk_pe_url").val(),
            apiKey: $("#stk_pe_key").val(),
            model: $("#stk_pe_model").val()
          });
          if (result.success) toastr.success("\u8FDE\u63A5\u6210\u529F", "\u6D4B\u8BD5\u7ED3\u679C");
          else toastr.error(result.error || "\u5931\u8D25", "\u6D4B\u8BD5\u7ED3\u679C");
        } catch (e) {
          toastr.error(e.message, "\u6D4B\u8BD5\u5931\u8D25");
        } finally {
          $btn.text("\u6D4B\u8BD5\u8FDE\u63A5").prop("disabled", false);
        }
      });
      $dialog.find("#stk_pe_fetch").on("click", async function() {
        const $btn = $(this).text("\u83B7\u53D6\u4E2D...").prop("disabled", true);
        try {
          const models = await apiPresetManager.fetchModelsFromConfig({
            baseUrl: $("#stk_pe_url").val(),
            apiKey: $("#stk_pe_key").val()
          });
          if (models && models.length > 0) {
            const $select = $("#stk_pe_model_select").empty().append('<option value="">-- \u9009\u62E9\u6A21\u578B --</option>');
            models.forEach((m) => $select.append(`<option value="${m}">${m}</option>`));
            toastr.success(`\u83B7\u53D6\u5230 ${models.length} \u4E2A\u6A21\u578B`, "\u6210\u529F");
          } else {
            toastr.warning("\u672A\u83B7\u53D6\u5230\u6A21\u578B", "\u7ED3\u679C");
          }
        } catch (e) {
          toastr.error(e.message, "\u83B7\u53D6\u5931\u8D25");
        } finally {
          $btn.text("\u83B7\u53D6\u6A21\u578B").prop("disabled", false);
        }
      });
      $dialog.find("#stk_pe_model_select").on("change", function() {
        if (this.value) $("#stk_pe_model").val(this.value);
      });
      $dialog.find(".stk-modal-save").on("click", () => {
        const name = $("#stk_pe_name").val().trim();
        if (!name) {
          toastr.error("\u8BF7\u8F93\u5165\u9884\u8BBE\u540D\u79F0", "\u9519\u8BEF");
          return;
        }
        const config = {
          name,
          baseUrl: $("#stk_pe_url").val().trim(),
          apiKey: $("#stk_pe_key").val(),
          model: $("#stk_pe_model").val().trim(),
          parameters: {
            max_tokens: parseInt($("#stk_pe_max_tokens").val()) || 2048,
            temperature: parseFloat($("#stk_pe_temperature").val()) || 0.7,
            stream: $("#stk_pe_stream").is(":checked")
          }
        };
        if (isEdit) {
          apiPresetManager.updatePreset(presetId, config);
          toastr.success("\u9884\u8BBE\u5DF2\u66F4\u65B0", "API\u9884\u8BBE");
        } else {
          apiPresetManager.createPreset(config);
          toastr.success("\u9884\u8BBE\u5DF2\u521B\u5EFA", "API\u9884\u8BBE");
        }
        this._refreshPresetList();
        closeDialog();
      });
      $dialog.on("click", ".stk-modal-overlay", (e) => {
        if (e.target === $dialog[0]) closeDialog();
      });
    },
    _bindAiInstructionEvents(modules3) {
      this._refreshAiPresetList();
      $(document).on("change", "#stk_ai_preset_select", (e) => {
        AIInstructionsManager.setActivePreset(e.target.value);
        this._refreshAiSegments();
      });
      $(document).on("click", "#stk_ai_preset_new", () => {
        const name = prompt("\u9884\u8BBE\u540D\u79F0\uFF1A", "\u65B0\u9884\u8BBE");
        if (name) {
          AIInstructionsManager.createPreset(name, AIInstructionsManager.getDefaultSegments());
          this._refreshAiPresetList();
          toastr.success("\u5DF2\u521B\u5EFA\u9884\u8BBE", "AI\u6307\u4EE4");
        }
      });
      $(document).on("click", "#stk_ai_preset_dup", () => {
        const activeId = AIInstructionsManager.activePresetId;
        if (!activeId) {
          toastr.warning("\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        const copy = AIInstructionsManager.duplicatePreset(activeId);
        if (copy) {
          this._refreshAiPresetList();
          toastr.success("\u5DF2\u590D\u5236\u9884\u8BBE", "AI\u6307\u4EE4");
        }
      });
      $(document).on("click", "#stk_ai_preset_del", () => {
        const activeId = AIInstructionsManager.activePresetId;
        if (!activeId) return;
        if (AIInstructionsManager.presets.length <= 1) {
          toastr.warning("\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        if (confirm("\u786E\u5B9A\u5220\u9664\u5F53\u524D\u9884\u8BBE\uFF1F")) {
          AIInstructionsManager.deletePreset(activeId);
          this._refreshAiPresetList();
          toastr.success("\u5DF2\u5220\u9664\u9884\u8BBE", "AI\u6307\u4EE4");
        }
      });
      $(document).on("click", "#stk_ai_preset_import", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const result = await AIInstructionsManager.uploadPresets(file);
          if (result.success) {
            toastr.success(`\u5BFC\u5165\u6210\u529F\uFF1A${result.imported} \u4E2A\u9884\u8BBE`, "AI\u6307\u4EE4");
            if (result.skipped > 0) toastr.warning(`\u8DF3\u8FC7 ${result.skipped} \u4E2A`, "AI\u6307\u4EE4");
            this._refreshAiPresetList();
          } else {
            toastr.error(result.error || "\u5BFC\u5165\u5931\u8D25", "AI\u6307\u4EE4");
          }
        };
        input.click();
      });
      $(document).on("click", "#stk_ai_preset_export", () => {
        const activeId = AIInstructionsManager.activePresetId;
        if (!activeId) {
          toastr.warning("\u8BF7\u5148\u9009\u62E9\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        const preset = AIInstructionsManager.presets.find((p) => p.id === activeId);
        AIInstructionsManager.downloadPresets([activeId], `ai-instruction-${preset?.name || "export"}.json`);
        toastr.success("\u5DF2\u5BFC\u51FA\u9884\u8BBE", "AI\u6307\u4EE4");
      });
      $(document).on("click", "#stk_ai_preset_export_all", () => {
        if (AIInstructionsManager.presets.length === 0) {
          toastr.warning("\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        AIInstructionsManager.downloadPresets();
        toastr.success("\u5DF2\u5BFC\u51FA\u5168\u90E8\u9884\u8BBE", "AI\u6307\u4EE4");
      });
      $(document).on("click", "#stk_ai_add_segment", () => {
        const activeId = AIInstructionsManager.activePresetId;
        if (!activeId) {
          toastr.warning("\u8BF7\u5148\u9009\u62E9\u9884\u8BBE", "AI\u6307\u4EE4");
          return;
        }
        AIInstructionsManager.addSegment(activeId, { role: "user", name: "\u65B0\u6BB5\u843D", content: "" });
        this._refreshAiSegments();
      });
      $(document).on("click", ".stk-ai-seg-del", (e) => {
        const activeId = AIInstructionsManager.activePresetId;
        const segId = $(e.currentTarget).data("id");
        if (AIInstructionsManager.deleteSegment(activeId, segId)) {
          this._refreshAiSegments();
          toastr.success("\u5DF2\u5220\u9664\u6BB5\u843D", "AI\u6307\u4EE4");
        }
      });
      $(document).on("input", ".stk-ai-seg-name", (e) => {
        const activeId = AIInstructionsManager.activePresetId;
        const $item = $(e.currentTarget).closest(".stk-ai-segment-item");
        const segId = $item.data("id");
        AIInstructionsManager.updateSegment(activeId, segId, { name: e.target.value });
        this._updateAiPreview();
      });
      $(document).on("change", ".stk-ai-seg-role", (e) => {
        const activeId = AIInstructionsManager.activePresetId;
        const $item = $(e.currentTarget).closest(".stk-ai-segment-item");
        const segId = $item.data("id");
        AIInstructionsManager.updateSegment(activeId, segId, { role: e.target.value });
        this._updateAiPreview();
      });
      $(document).on("input", ".stk-ai-seg-content", (e) => {
        const activeId = AIInstructionsManager.activePresetId;
        const $item = $(e.currentTarget).closest(".stk-ai-segment-item");
        const segId = $item.data("id");
        AIInstructionsManager.updateSegment(activeId, segId, { content: e.target.value });
        this._updateAiPreview();
      });
    },
    _refreshAiPresetList() {
      const presets2 = AIInstructionsManager.presets;
      const activeId = AIInstructionsManager.activePresetId;
      const $select = $("#stk_ai_preset_select");
      if ($select.length) {
        $select.empty().append(presets2.map(
          (p) => `<option value="${p.id}"${p.id === activeId ? " selected" : ""}>${_.escape(p.name)}</option>`
        ).join(""));
      }
      this._refreshAiSegments();
    },
    _refreshAiSegments() {
      const $container = $("#stk_ai_segments_container");
      if (!$container.length) return;
      const preset = AIInstructionsManager.activePreset;
      if (!preset || !preset.segments || preset.segments.length === 0) {
        $container.html('<div style="text-align:center;color:var(--stk-text-3);padding:20px">\u65E0\u6BB5\u843D\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6DFB\u52A0</div><div class="stk-btn" id="stk_ai_add_segment" style="width:100%;margin-top:8px">+ \u6DFB\u52A0\u6BB5\u843D</div>');
        this._updateAiPreview();
        return;
      }
      const sorted = [...preset.segments].sort((a, b) => a.order - b.order);
      const html = sorted.map((seg, idx) => `
            <div class="stk-ai-segment-item" data-id="${seg.id}" style="background:rgba(0,0,0,0.15);border-radius:6px;padding:10px;margin:6px 0">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="color:var(--stk-text-3);font-size:11px">#${idx + 1}</span>
                        <input type="text" class="text_pole stk-ai-seg-name" value="${_.escape(seg.name)}" style="width:120px;font-size:12px" />
                        <select class="text_pole stk-ai-seg-role" style="width:80px;font-size:12px">
                            <option value="system" ${seg.role === "system" ? "selected" : ""}>system</option>
                            <option value="user" ${seg.role === "user" ? "selected" : ""}>user</option>
                            <option value="assistant" ${seg.role === "assistant" ? "selected" : ""}>assistant</option>
                        </select>
                    </div>
                    <div style="display:flex;gap:4px">
                        ${seg.deletable ? `<div class="stk-btn stk-ai-seg-del" data-id="${seg.id}" style="padding:2px 6px;font-size:10px;color:#ff6b6b">\u5220\u9664</div>` : ""}
                    </div>
                </div>
                <textarea class="text_pole stk-ai-seg-content" rows="3" style="font-size:12px;resize:vertical">${_.escape(seg.content)}</textarea>
            </div>
        `).join("") + `<div class="stk-btn" id="stk_ai_add_segment" style="width:100%;margin-top:8px">+ \u6DFB\u52A0\u6BB5\u843D</div>`;
      $container.html(html);
      this._updateAiPreview();
    },
    _updateAiPreview() {
      const $preview = $("#stk_ai_preview");
      if ($preview.length) {
        $preview.val(AIInstructionsManager.buildPrompt());
      }
    },
    _bindWorldbookConfigEvents(modules3) {
      const zeroTkMode = WorldbookConfigManager.zeroTkOccupyMode;
      $("#stk_wb_0tk_mode").prop("checked", zeroTkMode);
      $(document).on("change", "#stk_wb_0tk_mode", async (e) => {
        const enabled = $(e.target).is(":checked");
        await WorldbookConfigManager.setZeroTkOccupyMode(enabled);
        toastr.success(`0TK\u5360\u7528\u6A21\u5F0F\u5DF2${enabled ? "\u542F\u7528" : "\u7981\u7528"}`, "\u4E16\u754C\u4E66\u914D\u7F6E");
        this._refreshWorldbookEntries();
      });
      $(document).on("click", "#stk_wb_sync_now", async () => {
        const result = await WorldbookConfigManager.syncToWorldbook();
        if (result) {
          toastr.success("\u540C\u6B65\u5B8C\u6210", "\u4E16\u754C\u4E66\u914D\u7F6E");
          this._refreshWorldbookEntries();
        } else {
          toastr.error("\u540C\u6B65\u5931\u8D25", "\u4E16\u754C\u4E66\u914D\u7F6E");
        }
      });
      $(document).on("click", "#stk_wb_refresh_list", () => {
        this._refreshWorldbookEntries();
      });
      $(document).on("click", "#stk_wb_export_config", () => {
        const config = WorldbookConfigManager.exportConfig();
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "stk-worldbook-config.json";
        a.click();
        URL.revokeObjectURL(url);
        toastr.success("\u914D\u7F6E\u5DF2\u5BFC\u51FA", "\u4E16\u754C\u4E66\u914D\u7F6E");
      });
      $(document).on("click", "#stk_wb_import_config", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            const result = WorldbookConfigManager.importConfig(data);
            if (result.success) {
              toastr.success("\u914D\u7F6E\u5DF2\u5BFC\u5165", "\u4E16\u754C\u4E66\u914D\u7F6E");
              this._refreshWorldbookConfigUI();
            } else {
              toastr.error(result.error || "\u5BFC\u5165\u5931\u8D25", "\u4E16\u754C\u4E66\u914D\u7F6E");
            }
          } catch (err) {
            toastr.error("\u6587\u4EF6\u89E3\u6790\u5931\u8D25", "\u4E16\u754C\u4E66\u914D\u7F6E");
          }
        };
        input.click();
      });
      $(document).on("click", "#stk_wb_reset_config", () => {
        if (confirm("\u786E\u5B9A\u8981\u91CD\u7F6E\u6240\u6709\u4E16\u754C\u4E66\u914D\u7F6E\u5417\uFF1F")) {
          WorldbookConfigManager.resetConfig();
          toastr.success("\u914D\u7F6E\u5DF2\u91CD\u7F6E", "\u4E16\u754C\u4E66\u914D\u7F6E");
          this._refreshWorldbookConfigUI();
        }
      });
      $(document).on("click", ".stk-wb-entry-toggle", async (e) => {
        const uid = $(e.currentTarget).data("uid");
        const enabled = $(e.currentTarget).data("enabled") === true;
        const result = await WorldbookConfigManager.setEntryEnabled(uid, !enabled);
        if (result) {
          $(e.currentTarget).data("enabled", !enabled);
          $(e.currentTarget).text(!enabled ? "\u7981\u7528" : "\u542F\u7528");
          toastr.success(`\u6761\u76EE\u5DF2${!enabled ? "\u542F\u7528" : "\u7981\u7528"}`, "\u4E16\u754C\u4E66\u914D\u7F6E");
        }
      });
    },
    async _refreshWorldbookEntries() {
      const $list = $("#stk_wb_entries_list");
      if (!$list.length) return;
      $list.html('<div style="text-align:center;padding:20px">\u52A0\u8F7D\u4E2D...</div>');
      const entries = await WorldbookConfigManager.listWorldbookEntries();
      const stkEntries = entries.filter(
        (e) => e.key && e.key.startsWith("stk_") || e.comment && e.comment.includes("STK") || e.comment && e.comment.includes("SmartToolkit")
      );
      if (stkEntries.length === 0) {
        $list.html('<div style="text-align:center;color:var(--stk-text-3);padding:20px">\u6CA1\u6709\u627E\u5230STK\u76F8\u5173\u6761\u76EE</div>');
        return;
      }
      const html = stkEntries.map((e) => `
            <div class="stk-wb-entry-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:rgba(0,0,0,0.15);border-radius:4px;margin:4px 0">
                <div>
                    <div style="font-size:12px;font-weight:500">${_.escape(e.key || e.comment || "\u672A\u547D\u540D")}</div>
                    <div style="font-size:10px;color:var(--stk-text-3)">${e.enabled ? "\u2713 \u542F\u7528" : "\u25CB \u7981\u7528"}</div>
                </div>
                <div class="stk-btn stk-wb-entry-toggle" data-uid="${e.uid}" data-enabled="${e.enabled}" style="padding:2px 8px;font-size:11px">
                    ${e.enabled ? "\u7981\u7528" : "\u542F\u7528"}
                </div>
            </div>
        `).join("");
      $list.html(html);
    },
    _refreshWorldbookConfigUI() {
      const zeroTkMode = WorldbookConfigManager.zeroTkOccupyMode;
      $("#stk_wb_0tk_mode").prop("checked", zeroTkMode);
      this._refreshWorldbookEntries();
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
    setModules(modules3) {
      this._modules = modules3;
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

  // src/utils/RegexExtractor.js
  var RegexExtractor = class _RegexExtractor {
    constructor(config = {}) {
      this.patterns = config.patterns || [];
      this.cleanupPatterns = config.cleanupPatterns || [];
    }
    extract(text, pattern) {
      const regex = pattern || (this.patterns.length > 0 ? this.patterns[0].regex : null);
      if (!regex) return null;
      const match = text.match(regex);
      if (!match) return null;
      return {
        fullMatch: match[0],
        captured: match[1] || null,
        groups: match.groups || null,
        index: match.index
      };
    }
    extractAll(text, pattern) {
      const regex = pattern || (this.patterns.length > 0 ? this.patterns[0].regex : null);
      if (!regex) return [];
      const results = [];
      const globalRegex = regex.global ? regex : new RegExp(regex.source, regex.flags + "g");
      let match;
      while ((match = globalRegex.exec(text)) !== null) {
        results.push({
          fullMatch: match[0],
          captured: match[1] || null,
          groups: match.groups || null,
          index: match.index
        });
      }
      return results;
    }
    cleanup(text, patterns) {
      const patternsToUse = patterns || this.cleanupPatterns;
      let result = text;
      for (const p of patternsToUse) {
        const regex = typeof p === "string" ? new RegExp(p, "gi") : p;
        result = result.replace(regex, "");
      }
      return result.trim();
    }
    addPattern(name, pattern, flags = "gi") {
      const regex = typeof pattern === "string" ? new RegExp(pattern, flags) : pattern;
      this.patterns.push({ name, regex, source: typeof pattern === "string" ? pattern : pattern.source });
      return this;
    }
    addCleanupPattern(pattern, flags = "gi") {
      const regex = typeof pattern === "string" ? new RegExp(pattern, flags) : pattern;
      this.cleanupPatterns.push(regex);
      return this;
    }
    getPatterns() {
      return this.patterns.map((p) => ({
        name: p.name,
        source: p.source
      }));
    }
    getPattern(name) {
      return this.patterns.find((p) => p.name === name) || null;
    }
    removePattern(name) {
      const index = this.patterns.findIndex((p) => p.name === name);
      if (index !== -1) {
        this.patterns.splice(index, 1);
        return true;
      }
      return false;
    }
    clearPatterns() {
      this.patterns = [];
      return this;
    }
    clearCleanupPatterns() {
      this.cleanupPatterns = [];
      return this;
    }
    static parseBlock(text, tagName, sections = null) {
      const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
      const match = text.match(regex);
      if (!match) return null;
      const raw = match[1].trim();
      const result = { raw, fullMatch: match[0] };
      if (sections && Array.isArray(sections)) {
        for (const sec of sections) {
          const secMatch = raw.match(new RegExp(`<${sec}>([\\s\\S]*?)<\\/${sec}>`, "i"));
          result[sec] = secMatch ? secMatch[1].trim() : "";
        }
      }
      return result;
    }
    static removeBlock(text, tagName) {
      const regex = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, "gi");
      return text.replace(regex, "").trim();
    }
    static removeBlocks(text, tagNames) {
      let result = text;
      for (const tag of tagNames) {
        result = _RegexExtractor.removeBlock(result, tag);
      }
      return result.trim();
    }
    static extractWithTag(text, tagName) {
      const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
      const match = text.match(regex);
      if (!match) return null;
      return {
        content: match[1].trim(),
        fullMatch: match[0],
        index: match.index
      };
    }
    static hasTag(text, tagName) {
      const regex = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, "i");
      return regex.test(text);
    }
    static replaceTag(text, tagName, replacement) {
      const regex = new RegExp(`<${tagName}>[\\s\\S]*?<\\/${tagName}>`, "gi");
      return text.replace(regex, replacement);
    }
    static createTag(tagName, content) {
      return `<${tagName}>${content}</${tagName}>`;
    }
    toJSON() {
      return {
        patterns: this.patterns.map((p) => ({ name: p.name, source: p.source })),
        cleanupPatterns: this.cleanupPatterns.map((r) => r.source)
      };
    }
    static fromJSON(json) {
      const config = typeof json === "string" ? JSON.parse(json) : json;
      const extractor = new _RegexExtractor();
      if (config.patterns) {
        for (const p of config.patterns) {
          extractor.addPattern(p.name, p.source);
        }
      }
      if (config.cleanupPatterns) {
        for (const p of config.cleanupPatterns) {
          extractor.addCleanupPattern(p);
        }
      }
      return extractor;
    }
  };

  // src/modules/regexConfig.js
  var _sharedExtractor = null;
  var DEFAULT_SHARED_PATTERNS = [
    { name: "StatusBlock", source: "<StatusBlock>[\\s\\S]*?</StatusBlock>" },
    { name: "auxiliary_tool", source: "<auxiliary_tool>[\\s\\S]*?</auxiliary_tool>" },
    { name: "UpdateVariable", source: "<UpdateVariable>[\\s\\S]*?</UpdateVariable>" },
    { name: "StatusPlaceHolderImpl", source: "<StatusPlaceHolderImpl/>" },
    { name: "StatusBarPlaceholder", source: "<StatusBarPlaceholder/>" }
  ];
  var DEFAULT_CLEANUP_PATTERNS = [
    "<StatusBlock>[\\s\\S]*?</StatusBlock>",
    "<auxiliary_tool>[\\s\\S]*?</auxiliary_tool>",
    "<UpdateVariable>[\\s\\S]*?</UpdateVariable>",
    "<StatusPlaceHolderImpl/>",
    "<StatusBarPlaceholder/>"
  ];
  var RegexConfigModule = {
    id: "regexConfig",
    name: "\u6B63\u5219\u63D0\u53D6\u914D\u7F6E",
    defaultSettings: {
      enabled: true,
      sharedPatterns: [...DEFAULT_SHARED_PATTERNS],
      defaultCleanupPatterns: [...DEFAULT_CLEANUP_PATTERNS]
    },
    getSharedExtractor() {
      if (!_sharedExtractor) {
        const settings = Core.getModuleSettings(this.id, this.defaultSettings);
        _sharedExtractor = new RegexExtractor();
        for (const p of settings.sharedPatterns) {
          _sharedExtractor.addPattern(p.name, p.source);
        }
        for (const p of settings.defaultCleanupPatterns) {
          _sharedExtractor.addCleanupPattern(p);
        }
      }
      return _sharedExtractor;
    },
    refreshSharedExtractor() {
      _sharedExtractor = null;
      return this.getSharedExtractor();
    },
    createExtractor(config = {}) {
      const extractor = new RegexExtractor();
      if (config.patterns) {
        for (const p of config.patterns) {
          extractor.addPattern(p.name, p.source);
        }
      }
      if (config.cleanupPatterns) {
        for (const p of config.cleanupPatterns) {
          extractor.addCleanupPattern(p);
        }
      }
      return extractor;
    },
    renderUI(settings) {
      const patternsHtml = (settings.sharedPatterns || []).map((p, i) => `
            <div class="stk-regex-pattern-row" data-index="${i}">
                <input type="text" class="text_pole stk-regex-name" value="${_.escape(p.name)}" placeholder="\u540D\u79F0" style="width:120px" />
                <input type="text" class="text_pole stk-regex-source" value="${_.escape(p.source)}" placeholder="\u6B63\u5219\u8868\u8FBE\u5F0F" style="flex:1" />
                <button class="stk-btn stk-regex-remove" data-index="${i}">-</button>
            </div>
        `).join("");
      const cleanupHtml = (settings.defaultCleanupPatterns || []).map((p, i) => `
            <div class="stk-regex-cleanup-row" data-index="${i}">
                <input type="text" class="text_pole stk-regex-cleanup-source" value="${_.escape(p)}" placeholder="\u6E05\u7406\u6B63\u5219" style="flex:1" />
                <button class="stk-btn stk-regex-cleanup-remove" data-index="${i}">-</button>
            </div>
        `).join("");
      return `
            <div class="stk-section">
                <div class="stk-section-title">\u5171\u4EAB\u63D0\u53D6\u6A21\u5F0F</div>
                <div class="stk-section-body">
                    <div class="stk-regex-patterns-container">
                        ${patternsHtml}
                    </div>
                    <div class="stk-btn stk-regex-add-pattern" style="margin-top:8px">+ \u6DFB\u52A0\u6A21\u5F0F</div>
                </div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u9ED8\u8BA4\u6E05\u7406\u6A21\u5F0F</div>
                <div class="stk-section-body">
                    <div class="stk-regex-cleanup-container">
                        ${cleanupHtml}
                    </div>
                    <div class="stk-btn stk-regex-add-cleanup" style="margin-top:8px">+ \u6DFB\u52A0\u6E05\u7406</div>
                </div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">\u64CD\u4F5C</div>
                <div class="stk-section-body">
                    <div class="stk-row" style="gap:8px">
                        <div class="stk-btn" id="stk_regex_reset">\u91CD\u7F6E\u4E3A\u9ED8\u8BA4</div>
                        <div class="stk-btn" id="stk_regex_export">\u5BFC\u51FA\u914D\u7F6E</div>
                        <div class="stk-btn" id="stk_regex_import">\u5BFC\u5165\u914D\u7F6E</div>
                    </div>
                </div>
            </div>
        `;
    },
    bindUI(settings, save) {
      const $container = $("#stk_module_settings_regexConfig");
      $container.on("click", ".stk-regex-add-pattern", () => {
        settings.sharedPatterns.push({ name: "", source: "" });
        $container.html(this.renderUI(settings));
        this.bindUI(settings, save);
        save();
      });
      $container.on("click", ".stk-regex-remove", function() {
        const idx = parseInt($(this).data("index"));
        if (!isNaN(idx) && idx >= 0 && idx < settings.sharedPatterns.length) {
          settings.sharedPatterns.splice(idx, 1);
          $container.html(this.renderUI(settings));
          this.bindUI(settings, save);
          save();
        }
      });
      $container.on("click", ".stk-regex-add-cleanup", () => {
        settings.defaultCleanupPatterns.push("");
        $container.html(this.renderUI(settings));
        this.bindUI(settings, save);
        save();
      });
      $container.on("click", ".stk-regex-cleanup-remove", function() {
        const idx = parseInt($(this).data("index"));
        if (!isNaN(idx) && idx >= 0 && idx < settings.defaultCleanupPatterns.length) {
          settings.defaultCleanupPatterns.splice(idx, 1);
          $container.html(this.renderUI(settings));
          this.bindUI(settings, save);
          save();
        }
      });
      $container.on("input", ".stk-regex-name", function() {
        const idx = parseInt($(this).closest(".stk-regex-pattern-row").data("index"));
        if (!isNaN(idx)) {
          settings.sharedPatterns[idx].name = $(this).val();
          save();
        }
      });
      $container.on("input", ".stk-regex-source", function() {
        const idx = parseInt($(this).closest(".stk-regex-pattern-row").data("index"));
        if (!isNaN(idx)) {
          settings.sharedPatterns[idx].source = $(this).val();
          save();
        }
      });
      $container.on("input", ".stk-regex-cleanup-source", function() {
        const idx = parseInt($(this).closest(".stk-regex-cleanup-row").data("index"));
        if (!isNaN(idx)) {
          settings.defaultCleanupPatterns[idx] = $(this).val();
          save();
        }
      });
      $container.on("click", "#stk_regex_reset", () => {
        settings.sharedPatterns = [...DEFAULT_SHARED_PATTERNS];
        settings.defaultCleanupPatterns = [...DEFAULT_CLEANUP_PATTERNS];
        $container.html(this.renderUI(settings));
        this.bindUI(settings, save);
        this.refreshSharedExtractor();
        save();
        toastr.success("\u5DF2\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u914D\u7F6E", "\u6B63\u5219\u914D\u7F6E");
      });
      $container.on("click", "#stk_regex_export", () => {
        const config = {
          sharedPatterns: settings.sharedPatterns,
          defaultCleanupPatterns: settings.defaultCleanupPatterns
        };
        const jsonStr = JSON.stringify(config, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "regex-config.json";
        a.click();
        URL.revokeObjectURL(url);
        toastr.success("\u914D\u7F6E\u5DF2\u5BFC\u51FA", "\u6B63\u5219\u914D\u7F6E");
      });
      $container.on("click", "#stk_regex_import", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const config = JSON.parse(text);
            if (config.sharedPatterns) settings.sharedPatterns = config.sharedPatterns;
            if (config.defaultCleanupPatterns) settings.defaultCleanupPatterns = config.defaultCleanupPatterns;
            $container.html(this.renderUI(settings));
            this.bindUI(settings, save);
            this.refreshSharedExtractor();
            save();
            toastr.success("\u914D\u7F6E\u5DF2\u5BFC\u5165", "\u6B63\u5219\u914D\u7F6E");
          } catch (err) {
            toastr.error("\u5BFC\u5165\u5931\u8D25: " + err.message, "\u6B63\u5219\u914D\u7F6E");
          }
        };
        input.click();
      });
      const origSave = save;
      save = () => {
        origSave();
        this.refreshSharedExtractor();
      };
    },
    async init() {
      this.getSharedExtractor();
    }
  };

  // src/modules/statusbar.js
  var STATUS_TAG = "StatusBlock";
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
    const result = RegexExtractor.parseBlock(text, STATUS_TAG, SECTIONS);
    if (!result) return null;
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
        let text = RegexExtractor.removeBlock(msg.mes || "", STATUS_TAG).replace(PLACEHOLDER, "").trimEnd();
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

  // src/index.js
  var modules2 = [StatusBarModule, PlotOptionsModule];
  jQuery(async function() {
    const ctx = SillyTavern.getContext();
    await apiPresetManager.init();
    modules2.forEach((m) => m.init?.());
    UI.render(modules2);
    await Core.ensureWorldBook(modules2);
    const throttledMessage = _.throttle(async (msgId) => {
      for (const m of modules2) await m.onMessage?.(msgId);
    }, 3e3);
    ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, throttledMessage);
    ctx.eventSource.on(ctx.eventTypes.CHAT_COMPLETION_SETTINGS_READY, (data) => {
      for (const m of modules2) m.onChatReady?.(data);
    });
    console.log("[SmartToolkit] loaded");
  });
})();
