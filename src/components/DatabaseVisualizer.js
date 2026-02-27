import { DatabaseManager } from '../managers/DatabaseManager.js';
import { storage } from '../managers/StorageManager.js';

export class DatabaseVisualizer {
    constructor(options) {
        this.id = options.id || `stk-db-viz-${Date.now()}`;
        this.isolationKey = options.isolationKey || null;
        this.className = options.className || '';
        this.onTableSelect = options.onTableSelect || null;
        this.onDataChange = options.onDataChange || null;
        this.$el = null;
        this.$tableList = null;
        this.$editor = null;
        this._data = null;
        this._sortedKeys = [];
        this._selectedSheetKey = null;
        this._expandedSheets = new Set();
    }

    render() {
        const customClass = this.className ? ` ${this.className}` : '';

        return `
            <div class="stk-db-visualizer${customClass}" id="${this.id}">
                <div class="stk-db-toolbar">
                    <button class="stk-db-btn stk-db-refresh interactable" title="刷新数据">
                        <span class="fa-solid fa-rotate"></span>
                    </button>
                    <button class="stk-db-btn stk-db-expand-all interactable" title="展开全部">
                        <span class="fa-solid fa-expand"></span>
                    </button>
                    <button class="stk-db-btn stk-db-collapse-all interactable" title="折叠全部">
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

    async show(parentSelector = 'body') {
        if (this.$el) {
            this.$el.removeClass('stk-db-hidden');
            await this.refresh();
            return;
        }

        const html = this.render();
        $(parentSelector).append(html);

        this.$el = $(`#${this.id}`);
        this.$tableList = this.$el.find('.stk-db-table-list');
        this.$editor = this.$el.find('.stk-db-editor');

        this._bindEvents();
        await this.refresh();
    }

    _bindEvents() {
        this.$el.on('click', '.stk-db-refresh', () => this.refresh());

        this.$el.on('click', '.stk-db-expand-all', () => this._expandAll());

        this.$el.on('click', '.stk-db-collapse-all', () => this._collapseAll());

        this.$tableList.on('click', '.stk-db-table-header', (e) => {
            const $header = $(e.currentTarget);
            const sheetKey = $header.data('sheet-key');
            this._toggleSheet(sheetKey);
        });

        this.$tableList.on('click', '.stk-db-table-item', (e) => {
            const $item = $(e.currentTarget);
            const sheetKey = $item.data('sheet-key');
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
            this.$tableList.html('<div class="stk-db-empty">暂无数据表</div>');
            return;
        }

        const html = this._sortedKeys.map(sheetKey => {
            const sheetData = this._data[sheetKey];
            const name = sheetData?.name || sheetKey;
            const orderNo = sheetData?.orderNo ?? 999;
            const isExpanded = this._expandedSheets.has(sheetKey);
            const isSelected = this._selectedSheetKey === sheetKey;
            const expandIcon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';

            const fields = this._extractFields(sheetData);
            const fieldsHtml = isExpanded ? fields.map(f => `
                <div class="stk-db-field" data-field="${f}">
                    <span class="fa-solid fa-minus"></span>
                    <span class="stk-db-field-name">${f}</span>
                </div>
            `).join('') : '';

            return `
                <div class="stk-db-table${isSelected ? ' stk-db-selected' : ''}" data-sheet-key="${sheetKey}">
                    <div class="stk-db-table-header interactable" data-sheet-key="${sheetKey}">
                        <span class="fa-solid ${expandIcon} stk-db-expand-icon"></span>
                        <span class="stk-db-table-name">${name}</span>
                        <span class="stk-db-table-order">#${orderNo}</span>
                    </div>
                    <div class="stk-db-table-fields">${fieldsHtml}</div>
                </div>
            `;
        }).join('');

        this.$tableList.html(html);
    }

    _extractFields(sheetData) {
        if (!sheetData || typeof sheetData !== 'object') return [];

        const excludeKeys = ['name', 'orderNo', 'created', 'modified'];
        return Object.keys(sheetData).filter(k => !excludeKeys.includes(k) && !k.startsWith('_'));
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
        this._sortedKeys.forEach(key => this._expandedSheets.add(key));
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
            this.$editor.html('<div class="stk-db-empty">请选择一个数据表</div>');
            return;
        }

        const fields = this._extractFields(sheetData);
        const name = sheetData.name || sheetKey;
        const orderNo = sheetData.orderNo ?? 999;

        const fieldsHtml = fields.map(f => {
            const value = sheetData[f];
            const displayValue = this._formatValue(value);
            const inputType = typeof value === 'object' ? 'textarea' : 'text';

            return `
                <div class="stk-db-edit-field">
                    <label class="stk-db-edit-label">${f}</label>
                    ${inputType === 'textarea'
                        ? `<textarea class="stk-db-edit-input stk-db-edit-textarea" data-field="${f}">${displayValue}</textarea>`
                        : `<input type="${inputType}" class="stk-db-edit-input" data-field="${f}" value="${displayValue}">`
                    }
                </div>
            `;
        }).join('');

        this.$editor.html(`
            <div class="stk-db-edit-header">
                <span class="stk-db-edit-title">${name}</span>
                <span class="stk-db-edit-order">顺序: ${orderNo}</span>
            </div>
            <div class="stk-db-edit-fields">${fieldsHtml}</div>
            <div class="stk-db-edit-actions">
                <button class="stk-db-btn stk-db-save interactable">保存</button>
                <button class="stk-db-btn stk-db-cancel interactable">取消</button>
            </div>
        `);
    }

    _formatValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
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
        this.$el.find('.stk-db-info').text(`共 ${count} 个表 | 隔离键: ${key || '默认'}`);
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
            this.$el.addClass('stk-db-hidden');
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
}
