import { DatabaseManager } from './DatabaseManager.js';
import { storage } from './StorageManager.js';

const LOG_PREFIX = '[PlotAdvance]';

function logDebug(...args) {
    console.log(LOG_PREFIX, ...args);
}

export class PlotAdvanceManager {
    static _instance = null;

    static getInstance() {
        if (!PlotAdvanceManager._instance) {
            PlotAdvanceManager._instance = new PlotAdvanceManager();
        }
        return PlotAdvanceManager._instance;
    }

    constructor() {
        this._defaultSettings = {
            memoryRecallCount: 5,
            enableLoop: true,
            maxLoops: 3,
            selectedWorldbooks: [],
            customPromptTemplate: '',
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

        return parts.filter(Boolean).join('\n\n');
    }

    async _buildMemorySection(count) {
        const context = SillyTavern?.getContext?.();
        const chat = context?.chat;

        if (!chat || chat.length === 0) {
            return '';
        }

        const messages = [];
        const startIndex = Math.max(0, chat.length - count);

        for (let i = startIndex; i < chat.length; i++) {
            const msg = chat[i];
            const role = msg.is_user ? '用户' : 'AI';
            const content = msg.mes || '';
            messages.push(`[${role}]: ${content}`);
        }

        if (messages.length === 0) return '';

        return `[记忆回溯]\n最近 ${messages.length} 条消息:\n${messages.join('\n')}\n[/记忆回溯]`;
    }

    async _buildTableSection(selectedSheets) {
        const data = await this.getCurrentData();
        if (!data) return '';

        const keys = selectedSheets.length > 0
            ? selectedSheets
            : DatabaseManager.getSortedSheetKeys(data);

        if (keys.length === 0) return '';

        const tables = keys.map(key => {
            const table = data[key];
            if (!table) return '';

            const name = table.name || key;
            const fields = Object.entries(table)
                .filter(([k]) => !['name', 'orderNo', 'created', 'modified'].includes(k))
                .map(([k, v]) => `${k}: ${this._formatValue(v)}`);

            return `[${name}]\n${fields.join('\n')}`;
        }).filter(Boolean);

        if (tables.length === 0) return '';

        return `[当前状态]\n${tables.join('\n\n')}\n[/当前状态]`;
    }

    async _buildWorldbookSection(selectedWorldbooks) {
        if (!selectedWorldbooks || selectedWorldbooks.length === 0) {
            return '';
        }

        const context = SillyTavern?.getContext?.();
        const worldbooks = context?.worldInfo || [];

        const entries = [];

        for (const wbName of selectedWorldbooks) {
            const wb = worldbooks.find(w => w.name === wbName);
            if (!wb) continue;

            const wbEntries = wb?.entries || [];
            for (const entry of wbEntries) {
                if (entry.enabled && entry.content) {
                    entries.push(entry.content);
                }
            }
        }

        if (entries.length === 0) return '';

        return `[世界书参考]\n${entries.join('\n\n')}\n[/世界书参考]`;
    }

    _processCustomTemplate(template, loopIndex) {
        return template
            .replace(/\{\{loopIndex\}\}/g, String(loopIndex))
            .replace(/\{\{timestamp\}\}/g, String(Date.now()))
            .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
            .replace(/\{\{time\}\}/g, new Date().toLocaleTimeString());
    }

    async getCurrentData() {
        const isolationKey = storage.getIsolationKey();
        return await DatabaseManager.mergeAllIndependentTables(isolationKey);
    }

    shouldTriggerLoop(userMessage, loopCount, settings) {
        if (!settings.enableLoop) return false;
        if (loopCount >= settings.maxLoops) return false;

        if (settings.triggerKeywords.length > 0) {
            return settings.triggerKeywords.some(keyword =>
                userMessage.toLowerCase().includes(keyword.toLowerCase())
            );
        }

        return false;
    }

    async advancePlot(options = {}) {
        const settings = this.getSettings();
        const {
            loopCount = 0,
            userMessage = ''
        } = options;

        const shouldLoop = this.shouldTriggerLoop(userMessage, loopCount, settings);

        const prompt = await this.generatePlotPrompt({
            includeMemory: true,
            includeTables: true,
            loopIndex: loopCount
        });

        return {
            prompt,
            shouldContinue: shouldLoop,
            nextLoopIndex: shouldLoop ? loopCount + 1 : loopCount
        };
    }

    getAvailableWorldbooks() {
        const context = SillyTavern?.getContext?.();
        const worldbooks = context?.worldInfo || [];

        return worldbooks.map(wb => ({
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
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return String(value);
    }

    generateQuickPrompt(type = 'default') {
        const templates = {
            default: '[剧情推进]\n请根据当前状态推进剧情发展。\n[/剧情推进]',
            combat: '[剧情推进]\n当前场景: 战斗\n请描述战斗过程和结果。\n[/剧情推进]',
            dialogue: '[剧情推进]\n当前场景: 对话\n请继续角色对话。\n[/剧情推进]',
            exploration: '[剧情推进]\n当前场景: 探索\n请描述探索发现。\n[/剧情推进]',
            rest: '[剧情推进]\n当前场景: 休息\n请描述休息期间的互动。\n[/剧情推进]'
        };

        return templates[type] || templates.default;
    }
}

export const plotAdvance = PlotAdvanceManager.getInstance();
