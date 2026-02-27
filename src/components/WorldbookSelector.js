export class WorldbookSelector {
    constructor(options) {
        this.id = options.id || `stk-wb-selector-${Date.now()}`;
        this.selectedWorldbooks = options.selectedWorldbooks || [];
        this.className = options.className || '';
        this.multiSelect = options.multiSelect !== false;
        this.showEntryCount = options.showEntryCount !== false;
        this.showSearch = options.showSearch !== false;
        this.onSelectionChange = options.onSelectionChange || null;
        this.$el = null;
        this._worldbooks = [];
        this._filteredWorldbooks = [];
        this._searchQuery = '';
    }

    render() {
        const customClass = this.className ? ` ${this.className}` : '';

        const searchHtml = this.showSearch ? `
            <div class="stk-wb-search">
                <input type="text" class="stk-wb-search-input" placeholder="搜索世界书...">
            </div>
        ` : '';

        return `
            <div class="stk-wb-selector${customClass}" id="${this.id}">
                <div class="stk-wb-header">
                    <span class="stk-wb-title">世界书选择</span>
                    <span class="stk-wb-count"></span>
                </div>
                ${searchHtml}
                <div class="stk-wb-list"></div>
                <div class="stk-wb-actions">
                    <button class="stk-wb-btn stk-wb-select-all interactable">全选</button>
                    <button class="stk-wb-btn stk-wb-deselect-all interactable">取消全选</button>
                </div>
            </div>
        `;
    }

    show(parentSelector = 'body') {
        if (this.$el) {
            this.$el.removeClass('stk-wb-hidden');
            this.refresh();
            return;
        }

        const html = this.render();
        $(parentSelector).append(html);

        this.$el = $(`#${this.id}`);
        this._bindEvents();
        this.refresh();
    }

    _bindEvents() {
        this.$el.on('change', '.stk-wb-checkbox', (e) => {
            const $checkbox = $(e.target);
            const wbName = $checkbox.data('worldbook');
            const isSelected = $checkbox.is(':checked');

            if (this.multiSelect) {
                if (isSelected) {
                    if (!this.selectedWorldbooks.includes(wbName)) {
                        this.selectedWorldbooks.push(wbName);
                    }
                } else {
                    const index = this.selectedWorldbooks.indexOf(wbName);
                    if (index > -1) {
                        this.selectedWorldbooks.splice(index, 1);
                    }
                }
            } else {
                this.selectedWorldbooks = isSelected ? [wbName] : [];
                this.$el.find('.stk-wb-checkbox').not($checkbox).prop('checked', false);
            }

            this._updateCount();
            this._triggerChange();
        });

        this.$el.on('click', '.stk-wb-select-all', () => {
            this.selectAll();
        });

        this.$el.on('click', '.stk-wb-deselect-all', () => {
            this.deselectAll();
        });

        if (this.showSearch) {
            this.$el.on('input', '.stk-wb-search-input', (e) => {
                this._searchQuery = $(e.target).val().toLowerCase();
                this._filterAndRender();
            });
        }
    }

    refresh() {
        this._loadWorldbooks();
        this._filterAndRender();
        this._updateCount();
    }

    _loadWorldbooks() {
        const context = SillyTavern?.getContext?.();
        const worldInfo = context?.worldInfo || [];

        this._worldbooks = worldInfo.map(wb => ({
            name: wb.name || '未命名',
            entries: wb.entries?.length || 0,
            enabled: wb.enabled !== false,
            description: wb.comment || ''
        }));

        this._filteredWorldbooks = [...this._worldbooks];
    }

    _filterAndRender() {
        if (this._searchQuery) {
            this._filteredWorldbooks = this._worldbooks.filter(wb =>
                wb.name.toLowerCase().includes(this._searchQuery) ||
                wb.description.toLowerCase().includes(this._searchQuery)
            );
        } else {
            this._filteredWorldbooks = [...this._worldbooks];
        }

        this._renderList();
    }

    _renderList() {
        const $list = this.$el.find('.stk-wb-list');

        if (this._filteredWorldbooks.length === 0) {
            $list.html('<div class="stk-wb-empty">没有可用的世界书</div>');
            return;
        }

        const itemsHtml = this._filteredWorldbooks.map(wb => {
            const isSelected = this.selectedWorldbooks.includes(wb.name);
            const entryCountHtml = this.showEntryCount
                ? `<span class="stk-wb-entries">(${wb.entries}条)</span>`
                : '';
            const descHtml = wb.description
                ? `<span class="stk-wb-desc">${wb.description}</span>`
                : '';

            return `
                <div class="stk-wb-item${isSelected ? ' stk-wb-selected' : ''}${!wb.enabled ? ' stk-wb-disabled' : ''}">
                    <label class="stk-wb-label">
                        <input type="checkbox"
                               class="stk-wb-checkbox"
                               data-worldbook="${wb.name}"
                               ${isSelected ? 'checked' : ''}
                               ${!wb.enabled ? 'disabled' : ''}>
                        <span class="stk-wb-name">${wb.name}</span>
                        ${entryCountHtml}
                    </label>
                    ${descHtml}
                </div>
            `;
        }).join('');

        $list.html(itemsHtml);
    }

    _updateCount() {
        const total = this._worldbooks.length;
        const selected = this.selectedWorldbooks.length;
        this.$el.find('.stk-wb-count').text(`${selected}/${total}`);
    }

    _triggerChange() {
        if (this.onSelectionChange) {
            this.onSelectionChange([...this.selectedWorldbooks]);
        }
    }

    selectAll() {
        this.selectedWorldbooks = this._worldbooks
            .filter(wb => wb.enabled)
            .map(wb => wb.name);

        this._renderList();
        this._updateCount();
        this._triggerChange();
    }

    deselectAll() {
        this.selectedWorldbooks = [];

        this._renderList();
        this._updateCount();
        this._triggerChange();
    }

    setSelection(worldbookNames) {
        this.selectedWorldbooks = Array.isArray(worldbookNames) ? [...worldbookNames] : [];

        this._renderList();
        this._updateCount();
        this._triggerChange();
    }

    getSelection() {
        return [...this.selectedWorldbooks];
    }

    addWorldbook(name) {
        if (!this.selectedWorldbooks.includes(name)) {
            this.selectedWorldbooks.push(name);
            this._renderList();
            this._updateCount();
            this._triggerChange();
        }
    }

    removeWorldbook(name) {
        const index = this.selectedWorldbooks.indexOf(name);
        if (index > -1) {
            this.selectedWorldbooks.splice(index, 1);
            this._renderList();
            this._updateCount();
            this._triggerChange();
        }
    }

    toggleWorldbook(name) {
        if (this.selectedWorldbooks.includes(name)) {
            this.removeWorldbook(name);
        } else {
            this.addWorldbook(name);
        }
    }

    setSearchQuery(query) {
        this._searchQuery = query.toLowerCase();

        if (this.$el) {
            this.$el.find('.stk-wb-search-input').val(query);
        }

        this._filterAndRender();
    }

    hide() {
        if (this.$el) {
            this.$el.addClass('stk-wb-hidden');
        }
    }

    destroy() {
        if (this.$el) {
            this.$el.remove();
            this.$el = null;
        }

        this._worldbooks = [];
        this._filteredWorldbooks = [];
        this.selectedWorldbooks = [];
    }
}
