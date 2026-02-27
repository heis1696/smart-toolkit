import { Core } from '../core.js';
import { storage } from '../managers/StorageManager.js';

const STORAGE_KEY = 'stk_worldbook_config';
const GLOBAL_META_KEY = 'stk_worldbook_global_meta';

const DEFAULT_ENTRY_CONFIG = {
    enabled: true,
    position: 0,
    depth: 4,
    selectivity: 0,
    useProbability: true,
    displayIndex: 100
};

let _config = null;
let _globalMeta = null;

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

function getCurrentCharacterId() {
    const ctx = SillyTavern?.getContext?.();
    return ctx?.characterId || ctx?.name || 'default';
}

const WorldbookConfigManager = {
    get config() { return loadConfig(); },
    
    get globalMeta() { return loadGlobalMeta(); },
    
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
                    `/setentryfield file=${Core.WORLD_BOOK} uid=${find.pipe} field=enabled ${enabled ? 'true' : 'false'}`
                );
                return true;
            }
        } catch (e) {
            console.warn('[SmartToolkit] toggleEntry failed:', e);
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
                if (entry.key && entry.key.startsWith('stk_')) {
                    const shouldEnable = !zeroTkMode;
                    if (entry.enabled !== shouldEnable) {
                        await this.toggleEntry(entry.key, shouldEnable);
                    }
                }
            }
            return true;
        } catch (e) {
            console.warn('[SmartToolkit] syncToWorldbook failed:', e);
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
            console.warn('[SmartToolkit] listWorldbookEntries failed:', e);
            return [];
        }
    },
    
    async getEntryByComment(comment) {
        const entries = await this.listWorldbookEntries();
        return entries.find(e => e.comment === comment);
    },
    
    async setEntryEnabled(uid, enabled) {
        const ctx = SillyTavern?.getContext?.();
        if (!ctx) return false;
        
        try {
            await ctx.executeSlashCommandsWithOptions(
                `/setentryfield file=${Core.WORLD_BOOK} uid=${uid} field=enabled ${enabled ? 'true' : 'false'}`
            );
            return true;
        } catch (e) {
            console.warn('[SmartToolkit] setEntryEnabled failed:', e);
            return false;
        }
    },
    
    exportConfig() {
        const config = loadConfig();
        const meta = loadGlobalMeta();
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            config: config,
            globalMeta: meta
        };
    },
    
    importConfig(data) {
        try {
            if (!data || data.version !== 1) {
                return { success: false, error: 'Invalid config format' };
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

class WorldbookConfigModule {
    constructor() {
        this.id = 'worldbookConfig';
        this.name = '世界书配置';
        this.description = '管理世界书条目状态，支持0TK占用模式';
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
                        <span>0TK 占用模式</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-toggle stk-wb-0tk-toggle">
                            <input type="checkbox" id="stk_wb_0tk_mode" ${zeroTkMode ? 'checked' : ''} />
                            <span>启用 0TK 占用模式</span>
                        </div>
                        <div style="font-size:11px;color:var(--stk-text-3);margin-top:8px">
                            启用后，所有STK相关世界书条目将被禁用，节省Token占用。<br>
                            条目在世界书中显示为"禁用"状态，关闭此选项后自动恢复启用。
                        </div>
                    </div>
                </div>
                
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>同步操作</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_wb_sync_now">立即同步</div>
                            <div class="stk-btn" id="stk_wb_refresh_list">刷新条目列表</div>
                        </div>
                    </div>
                </div>
                
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>条目列表</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_wb_entries_list">
                        <div style="text-align:center;color:var(--stk-text-3);padding:20px">
                            点击"刷新条目列表"加载
                        </div>
                    </div>
                </div>
                
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>配置管理</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_wb_export_config">导出配置</div>
                            <div class="stk-btn" id="stk_wb_import_config">导入配置</div>
                            <div class="stk-btn" id="stk_wb_reset_config" style="color:#ff6b6b">重置</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    bindUI(settings, save) {
        $(document).on('change', '#stk_wb_0tk_mode', async (e) => {
            const enabled = $(e.target).is(':checked');
            await WorldbookConfigManager.setZeroTkOccupyMode(enabled);
            toastr.success(`0TK占用模式已${enabled ? '启用' : '禁用'}`, '世界书配置');
            this._refreshEntriesList();
        });
        
        $(document).on('click', '#stk_wb_sync_now', async () => {
            const result = await WorldbookConfigManager.syncToWorldbook();
            if (result) {
                toastr.success('同步完成', '世界书配置');
                this._refreshEntriesList();
            } else {
                toastr.error('同步失败', '世界书配置');
            }
        });
        
        $(document).on('click', '#stk_wb_refresh_list', () => {
            this._refreshEntriesList();
        });
        
        $(document).on('click', '#stk_wb_export_config', () => {
            const config = WorldbookConfigManager.exportConfig();
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'stk-worldbook-config.json';
            a.click();
            URL.revokeObjectURL(url);
            toastr.success('配置已导出', '世界书配置');
        });
        
        $(document).on('click', '#stk_wb_import_config', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const result = WorldbookConfigManager.importConfig(data);
                    if (result.success) {
                        toastr.success('配置已导入', '世界书配置');
                        this._refreshUI();
                    } else {
                        toastr.error(result.error || '导入失败', '世界书配置');
                    }
                } catch (err) {
                    toastr.error('文件解析失败', '世界书配置');
                }
            };
            input.click();
        });
        
        $(document).on('click', '#stk_wb_reset_config', () => {
            if (confirm('确定要重置所有世界书配置吗？')) {
                WorldbookConfigManager.resetConfig();
                toastr.success('配置已重置', '世界书配置');
                this._refreshUI();
            }
        });
        
        $(document).on('click', '.stk-wb-entry-toggle', async (e) => {
            const uid = $(e.currentTarget).data('uid');
            const enabled = $(e.currentTarget).data('enabled') === true;
            const result = await WorldbookConfigManager.setEntryEnabled(uid, !enabled);
            if (result) {
                $(e.currentTarget).data('enabled', !enabled);
                $(e.currentTarget).text(!enabled ? '禁用' : '启用');
                toastr.success(`条目已${!enabled ? '启用' : '禁用'}`, '世界书配置');
            }
        });
    }
    
    async _refreshEntriesList() {
        const $list = $('#stk_wb_entries_list');
        if (!$list.length) return;
        
        $list.html('<div style="text-align:center;padding:20px">加载中...</div>');
        
        const entries = await WorldbookConfigManager.listWorldbookEntries();
        const stkEntries = entries.filter(e => 
            (e.key && e.key.startsWith('stk_')) || 
            (e.comment && e.comment.includes('STK')) ||
            (e.comment && e.comment.includes('SmartToolkit'))
        );
        
        if (stkEntries.length === 0) {
            $list.html('<div style="text-align:center;color:var(--stk-text-3);padding:20px">没有找到STK相关条目</div>');
            return;
        }
        
        const html = stkEntries.map(e => `
            <div class="stk-wb-entry-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:rgba(0,0,0,0.15);border-radius:4px;margin:4px 0">
                <div>
                    <div style="font-size:12px;font-weight:500">${_.escape(e.key || e.comment || '未命名')}</div>
                    <div style="font-size:10px;color:var(--stk-text-3)">${e.enabled ? '✓ 启用' : '○ 禁用'}</div>
                </div>
                <div class="stk-btn stk-wb-entry-toggle" data-uid="${e.uid}" data-enabled="${e.enabled}" style="padding:2px 8px;font-size:11px">
                    ${e.enabled ? '禁用' : '启用'}
                </div>
            </div>
        `).join('');
        
        $list.html(html);
    }
    
    _refreshUI() {
        const zeroTkMode = WorldbookConfigManager.zeroTkOccupyMode;
        $('#stk_wb_0tk_mode').prop('checked', zeroTkMode);
        this._refreshEntriesList();
    }
}

const worldbookConfigModule = new WorldbookConfigModule();

export { worldbookConfigModule, WorldbookConfigManager };
