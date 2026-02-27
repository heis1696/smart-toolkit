import { storage } from './StorageManager.js';
import { Core } from '../core.js';

class ApiPresetManager {
    static _instance = null;
    _presets = {};
    _moduleBindings = {};
    _initialized = false;

    static getInstance() {
        if (!ApiPresetManager._instance) {
            ApiPresetManager._instance = new ApiPresetManager();
        }
        return ApiPresetManager._instance;
    }

    async init() {
        if (this._initialized) return;
        this._presets = storage.getObject('api_presets') || {};
        this._moduleBindings = storage.getObject('api_module_bindings') || {};
        this._initialized = true;
    }

    createPreset(config) {
        const id = config.id || `preset_${Date.now()}`;
        this._presets[id] = {
            id,
            name: config.name || '未命名预设',
            baseUrl: config.baseUrl || '',
            apiKey: config.apiKey || '',
            model: config.model || '',
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
        if (!preset) return { success: false, error: '预设不存在' };

        const url = Core.normalizeBaseURL(preset.baseUrl) + '/chat/completions';
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${preset.apiKey}`
                },
                body: JSON.stringify({
                    model: preset.model,
                    messages: [{ role: 'user', content: 'test' }],
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
        if (!preset) return { success: false, models: [], error: '预设不存在' };

        const url = Core.normalizeBaseURL(preset.baseUrl) + '/models';
        try {
            const resp = await fetch(url, {
                headers: { 'Authorization': `Bearer ${preset.apiKey}` }
            });
            const json = await resp.json();
            const models = (json.data || []).map(m => m.id);
            return { success: true, models };
        } catch (e) {
            return { success: false, models: [], error: e.message };
        }
    }

    async testConnectionFromConfig(config) {
        if (!config.baseUrl) return { success: false, error: 'API 地址不能为空' };
        const url = Core.normalizeBaseURL(config.baseUrl) + '/chat/completions';
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey || ''}`
                },
                body: JSON.stringify({
                    model: config.model || 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'test' }],
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
        const url = Core.normalizeBaseURL(config.baseUrl) + '/models';
        try {
            const resp = await fetch(url, {
                headers: { 'Authorization': `Bearer ${config.apiKey || ''}` }
            });
            const json = await resp.json();
            return (json.data || []).map(m => m.id);
        } catch (e) {
            console.error('[ApiPresetManager] fetchModels error:', e);
            return [];
        }
    }

    _save() {
        storage.setObject('api_presets', this._presets);
        storage.setObject('api_module_bindings', this._moduleBindings);
    }

    exportPresets(presetIds = null) {
        const presetsToExport = presetIds 
            ? presetIds.map(id => this._presets[id]).filter(Boolean)
            : Object.values(this._presets);
        
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            presets: presetsToExport,
            moduleBindings: presetIds 
                ? Object.fromEntries(Object.entries(this._moduleBindings).filter(([, pid]) => presetIds.includes(pid)))
                : { ...this._moduleBindings }
        };
    }

    importPresets(data, options = {}) {
        const { merge = true, overwrite = false } = options;
        
        if (!data || !data.presets || !Array.isArray(data.presets)) {
            return { success: false, imported: 0, skipped: 0, error: '无效的导入数据格式' };
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
                    conflicts.push({ originalId: preset.id, reason: 'ID已存在' });
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
            return { success: false, imported: 0, skipped: 0, error: 'JSON解析失败: ' + e.message };
        }
    }

    downloadPresets(presetIds = null, filename = 'api-presets.json') {
        const json = this.exportToJSON(presetIds);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
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
                resolve({ success: false, imported: 0, skipped: 0, error: '文件读取失败' });
            };
            reader.readAsText(file);
        });
    }
}

export const apiPresetManager = ApiPresetManager.getInstance();
