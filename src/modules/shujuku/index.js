import { storage } from '../../managers/StorageManager.js';
import { DatabaseManager } from '../../managers/DatabaseManager.js';
import { TableLogicManager, tableLogic } from '../../managers/TableLogicManager.js';
import { PlotAdvanceManager, plotAdvance } from '../../managers/PlotAdvanceManager.js';
import { TabbedPanel } from '../../components/TabbedPanel.js';
import { DatabaseVisualizer } from '../../components/DatabaseVisualizer.js';
import { DraggableWindow } from '../../components/DraggableWindow.js';
import { windowManager } from '../../components/WindowManager.js';

const MODULE_ID = 'stk-shujuku';
const MODULE_NAME = 'Shujuku 数据库';

const LOG_PREFIX = '[Shujuku]';

function logDebug(...args) {
    console.log(LOG_PREFIX, ...args);
}

class ShujukuModule {
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
            activeTab: 'database',
            autoRefresh: true,
            refreshInterval: 5000
        };
    }

    async init() {
        if (this._initialized) return;

        await storage.init();
        storage.loadActiveProfileCode();
        this._loadSettings();

        this._registerMenu();
        this._initialized = true;

        logDebug('Shujuku module initialized');
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
            logDebug('SillyTavern context not available');
            return;
        }

        if (typeof registerSlashCommand === 'function') {
            registerSlashCommand('shujuku', () => this.toggleMainWindow(), [], '数据库管理', true, true);
        }

        logDebug('Menu registered');
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
            id: 'stk-shujuku-window',
            title: MODULE_NAME,
            width: this._settings.windowWidth,
            height: this._settings.windowHeight,
            className: 'stk-shujuku-window',
            resizable: true,
            draggable: true,
            showClose: true,
            showMinimize: false,
            position: { x: null, y: null },
            anchor: 'center',
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
            { id: 'database', label: '数据库', icon: 'fa-solid fa-database' },
            { id: 'plot', label: '剧情推进', icon: 'fa-solid fa-forward' },
            { id: 'settings', label: '设置', icon: 'fa-solid fa-gear' }
        ];

        this._tabPanel = new TabbedPanel({
            id: 'stk-shujuku-tabs',
            tabs: tabs,
            activeTab: this._settings.activeTab,
            className: 'stk-shujuku-tabs',
            onTabChange: (tabId) => this._onTabChange(tabId)
        });

        this._tabPanel.show(`#${this._mainWindow.id} .stk-window-body`);
    }

    async _onTabChange(tabId) {
        this._settings.activeTab = tabId;
        this._saveSettings();

        switch (tabId) {
            case 'database':
                await this._renderDatabaseTab();
                break;
            case 'plot':
                await this._renderPlotTab();
                break;
            case 'settings':
                await this._renderSettingsTab();
                break;
        }
    }

    async _renderDatabaseTab() {
        if (!this._dbVisualizer) {
            this._dbVisualizer = new DatabaseVisualizer({
                id: 'stk-shujuku-db',
                className: 'stk-shujuku-db',
                onTableSelect: (key, data) => this._onTableSelect(key, data)
            });
        }

        const content = this._dbVisualizer.render();
        this._tabPanel.setTabContent('database', content);
        this._dbVisualizer.$el = $(`#${this._dbVisualizer.id}`);
        this._dbVisualizer.$tableList = this._dbVisualizer.$el.find('.stk-db-table-list');
        this._dbVisualizer.$editor = this._dbVisualizer.$el.find('.stk-db-editor');
        this._dbVisualizer._bindEvents();
        await this._dbVisualizer.refresh();
    }

    async _renderPlotTab() {
        const settings = plotAdvance.getSettings();
        const worldbooks = plotAdvance.getAvailableWorldbooks();
        const selectedWb = plotAdvance.getSelectedWorldbooks();

        const worldbookOptions = worldbooks.map(wb => {
            const isSelected = selectedWb.includes(wb.name);
            return `
                <label class="stk-checkbox-item">
                    <input type="checkbox" data-worldbook="${wb.name}" ${isSelected ? 'checked' : ''}>
                    <span>${wb.name}</span>
                    <span class="stk-wb-count">(${wb.entries}条)</span>
                </label>
            `;
        }).join('');

        const content = `
            <div class="stk-plot-panel">
                <div class="stk-plot-section">
                    <h4>记忆回溯</h4>
                    <div class="stk-plot-row">
                        <label>回溯消息数:</label>
                        <input type="number" id="stk-memory-count" value="${settings.memoryRecallCount}" min="1" max="50">
                    </div>
                </div>

                <div class="stk-plot-section">
                    <h4>循环推进</h4>
                    <div class="stk-plot-row">
                        <label class="stk-checkbox-item">
                            <input type="checkbox" id="stk-enable-loop" ${settings.enableLoop ? 'checked' : ''}>
                            <span>启用循环</span>
                        </label>
                    </div>
                    <div class="stk-plot-row">
                        <label>最大循环次数:</label>
                        <input type="number" id="stk-max-loops" value="${settings.maxLoops}" min="1" max="10">
                    </div>
                </div>

                <div class="stk-plot-section">
                    <h4>世界书选择</h4>
                    <div class="stk-worldbook-list">
                        ${worldbookOptions || '<span class="stk-empty-msg">无可用的世界书</span>'}
                    </div>
                </div>

                <div class="stk-plot-section">
                    <h4>快速操作</h4>
                    <div class="stk-plot-actions">
                        <button class="stk-btn interactable" data-action="generate-prompt">生成推进提示</button>
                        <button class="stk-btn interactable" data-action="quick-combat">战斗场景</button>
                        <button class="stk-btn interactable" data-action="quick-dialogue">对话场景</button>
                    </div>
                </div>
            </div>
        `;

        this._tabPanel.setTabContent('plot', content);
        this._bindPlotEvents();
    }

    _bindPlotEvents() {
        const $panel = this._tabPanel.$tabContent;

        $panel.on('change', '#stk-memory-count', (e) => {
            const count = parseInt($(e.target).val(), 10);
            plotAdvance.setMemoryRecallCount(count);
        });

        $panel.on('change', '#stk-enable-loop', (e) => {
            const enabled = $(e.target).is(':checked');
            const maxLoops = parseInt($('#stk-max-loops').val(), 10);
            plotAdvance.setLoopSettings(enabled, maxLoops);
        });

        $panel.on('change', '#stk-max-loops', (e) => {
            const maxLoops = parseInt($(e.target).val(), 10);
            const enabled = $('#stk-enable-loop').is(':checked');
            plotAdvance.setLoopSettings(enabled, maxLoops);
        });

        $panel.on('change', '[data-worldbook]', (e) => {
            const selected = [];
            $panel.find('[data-worldbook]:checked').each(function() {
                selected.push($(this).data('worldbook'));
            });
            plotAdvance.setSelectedWorldbooks(selected);
        });

        $panel.on('click', '[data-action]', async (e) => {
            const action = $(e.currentTarget).data('action');
            await this._handlePlotAction(action);
        });
    }

    async _handlePlotAction(action) {
        switch (action) {
            case 'generate-prompt':
                const prompt = await plotAdvance.generatePlotPrompt();
                this._copyToClipboard(prompt);
                this._showToast('推进提示已复制到剪贴板');
                break;
            case 'quick-combat':
                this._copyToClipboard(plotAdvance.generateQuickPrompt('combat'));
                this._showToast('战斗场景提示已复制');
                break;
            case 'quick-dialogue':
                this._copyToClipboard(plotAdvance.generateQuickPrompt('dialogue'));
                this._showToast('对话场景提示已复制');
                break;
        }
    }

    async _renderSettingsTab() {
        const profiles = storage.listProfiles();
        const currentProfile = storage.getCurrentProfileCode();

        const profileOptions = Object.entries(profiles).map(([code, info]) => {
            const isSelected = code === currentProfile;
            return `
                <option value="${code}" ${isSelected ? 'selected' : ''}>
                    ${info.name} (${code})
                </option>
            `;
        }).join('');

        const content = `
            <div class="stk-settings-panel">
                <div class="stk-settings-section">
                    <h4>Profile 管理</h4>
                    <div class="stk-settings-row">
                        <label>当前 Profile:</label>
                        <select id="stk-profile-select">
                            ${profileOptions}
                        </select>
                    </div>
                    <div class="stk-settings-row">
                        <input type="text" id="stk-new-profile-name" placeholder="新 Profile 名称">
                        <button class="stk-btn interactable" id="stk-create-profile">创建</button>
                    </div>
                </div>

                <div class="stk-settings-section">
                    <h4>窗口设置</h4>
                    <div class="stk-settings-row">
                        <label>窗口宽度:</label>
                        <input type="number" id="stk-window-width" value="${this._settings.windowWidth}" min="300" max="1200">
                    </div>
                    <div class="stk-settings-row">
                        <label>窗口高度:</label>
                        <input type="number" id="stk-window-height" value="${this._settings.windowHeight}" min="200" max="800">
                    </div>
                </div>

                <div class="stk-settings-section">
                    <h4>数据操作</h4>
                    <div class="stk-settings-actions">
                        <button class="stk-btn interactable" id="stk-export-data">导出数据</button>
                        <button class="stk-btn interactable" id="stk-import-data">导入数据</button>
                        <button class="stk-btn stk-btn-danger interactable" id="stk-clear-data">清除当前Profile数据</button>
                    </div>
                </div>
            </div>
        `;

        this._tabPanel.setTabContent('settings', content);
        this._bindSettingsEvents();
    }

    _bindSettingsEvents() {
        const $panel = this._tabPanel.$tabContent;

        $panel.on('change', '#stk-profile-select', (e) => {
            const code = $(e.target).val();
            if (storage.switchProfile(code)) {
                this._showToast(`已切换到 Profile: ${code}`);
                if (this._dbVisualizer) {
                    this._dbVisualizer.isolationKey = storage.getIsolationKey();
                    this._dbVisualizer.refresh();
                }
            }
        });

        $panel.on('click', '#stk-create-profile', () => {
            const name = $('#stk-new-profile-name').val().trim();
            if (!name) {
                this._showToast('请输入 Profile 名称', 'error');
                return;
            }
            const code = 'profile_' + Date.now();
            if (storage.createProfile(code, name)) {
                this._showToast(`Profile "${name}" 已创建`);
                this._renderSettingsTab();
            } else {
                this._showToast('创建失败', 'error');
            }
        });

        $panel.on('change', '#stk-window-width', (e) => {
            this._settings.windowWidth = parseInt($(e.target).val(), 10);
            this._saveSettings();
        });

        $panel.on('change', '#stk-window-height', (e) => {
            this._settings.windowHeight = parseInt($(e.target).val(), 10);
            this._saveSettings();
        });

        $panel.on('click', '#stk-export-data', () => this._exportData());
        $panel.on('click', '#stk-import-data', () => this._importData());
        $panel.on('click', '#stk-clear-data', () => this._clearData());
    }

    async _exportData() {
        const data = await tableLogic.getCurrentData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `shujuku-export-${storage.getIsolationKey()}-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this._showToast('数据已导出');
    }

    _importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

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
                    this._showToast(`导入完成: ${results.filter(r => r.success).length} 条成功`);
                    if (this._dbVisualizer) {
                        await this._dbVisualizer.refresh();
                    }
                } catch (err) {
                    this._showToast('导入失败: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    async _clearData() {
        if (!confirm('确定要清除当前 Profile 的所有数据吗？此操作不可撤销。')) {
            return;
        }

        const data = await tableLogic.getCurrentData();
        if (!data) return;

        for (const key of Object.keys(data)) {
            await tableLogic.deleteTable(key);
        }

        this._showToast('数据已清除');
        if (this._dbVisualizer) {
            await this._dbVisualizer.refresh();
        }
    }

    _onTableSelect(key, data) {
        logDebug('Table selected:', key);
    }

    _onWindowShow() {
        logDebug('Window shown');
    }

    _onWindowHide() {
        logDebug('Window hidden');
    }

    _onWindowClose() {
        this._mainWindow = null;
        this._tabPanel = null;
        this._dbVisualizer = null;
        logDebug('Window closed');
    }

    _copyToClipboard(text) {
        navigator.clipboard.writeText(text).catch(err => {
            logDebug('Failed to copy:', err);
        });
    }

    _showToast(message, type = 'success') {
        if (typeof toastr !== 'undefined') {
            toastr[type](message);
        } else {
            logDebug(`[Toast ${type}]: ${message}`);
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
}

const shujukuModule = new ShujukuModule();

export { shujukuModule, ShujukuModule };
export default shujukuModule;
