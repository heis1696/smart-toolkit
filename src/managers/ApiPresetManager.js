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
}

export const apiPresetManager = ApiPresetManager.getInstance();
