export class DynamicList {
    constructor(options) {
        this.id = options.id || `stk-dlist-${Date.now()}`;
        this.containerId = options.containerId || this.id;
        this.itemTemplate = options.itemTemplate || this._defaultItemTemplate;
        this.addButtonText = options.addButtonText || '+ 添加';
        this.deleteButtonText = options.deleteButtonText || '删除';
        this.showAddButton = options.showAddButton !== false;
        this.onAdd = options.onAdd || null;
        this.onDelete = options.onDelete || null;
        this.onChange = options.onChange || null;
        this.onRender = options.onRender || null;
        this.items = [];
        this.$container = null;
        this.$list = null;
    }

    _defaultItemTemplate(data, index) {
        return `
            <div class="stk-dlist-item" data-index="${index}">
                <input type="text" class="text_pole stk-dlist-input" value="${this._escapeHtml(data.value || '')}">
                <button type="button" class="button stk-dlist-delete">${this.deleteButtonText}</button>
            </div>
        `;
    }

    _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    render(items = []) {
        this.items = items.map((item, index) => this._normalizeItem(item, index));

        const itemsHtml = this.items.map((item, index) => this.itemTemplate(item, index)).join('');
        const addButtonHtml = this.showAddButton
            ? `<button type="button" class="button stk-dlist-add">${this.addButtonText}</button>`
            : '';

        return `
            <div class="stk-dlist" id="${this.id}">
                <div class="stk-dlist-items">${itemsHtml}</div>
                ${addButtonHtml}
            </div>
        `;
    }

    _normalizeItem(item, index) {
        if (typeof item === 'string') {
            return { value: item, index };
        }
        return { ...item, index };
    }

    bindEvents(containerSelector = null) {
        const selector = containerSelector ? `${containerSelector} #${this.id}` : `#${this.id}`;
        this.$container = $(selector);

        if (!this.$container.length) {
            this.$container = $(`#${this.containerId}`).find(`#${this.id}`);
        }

        this.$list = this.$container.find('.stk-dlist-items');

        this.$container.on('click', '.stk-dlist-add', (e) => {
            e.preventDefault();
            this.addItem();
        });

        this.$container.on('click', '.stk-dlist-delete', (e) => {
            e.preventDefault();
            const $item = $(e.currentTarget).closest('.stk-dlist-item');
            const index = parseInt($item.data('index'), 10);
            this.deleteItem(index);
        });

        this.$container.on('input change', '.stk-dlist-input, input, select, textarea', (e) => {
            const $item = $(e.currentTarget).closest('.stk-dlist-item');
            const index = parseInt($item.data('index'), 10);
            this._handleItemChange(index, e);
        });

        if (this.onRender) {
            this.onRender(this.items);
        }
    }

    _handleItemChange(index, event) {
        const $target = $(event.currentTarget);
        const field = $target.data('field') || 'value';
        const value = $target.is(':checkbox') ? $target.is(':checked') : $target.val();

        if (this.items[index]) {
            this.items[index][field] = value;
        }

        if (this.onChange) {
            this.onChange(index, this.items[index], field, value);
        }
    }

    addItem(data = null) {
        const newItem = data || (this.onAdd ? this.onAdd() : { value: '' });
        const normalizedItem = this._normalizeItem(newItem, this.items.length);
        this.items.push(normalizedItem);

        const itemHtml = this.itemTemplate(normalizedItem, this.items.length - 1);
        this.$list.append(itemHtml);

        this._updateIndices();
    }

    deleteItem(index) {
        if (index < 0 || index >= this.items.length) return;

        const deletedItem = this.items[index];

        if (this.onDelete) {
            this.onDelete(index, deletedItem);
        }

        this.items.splice(index, 1);

        const $item = this.$list.find(`.stk-dlist-item[data-index="${index}"]`);
        $item.remove();

        this._updateIndices();
    }

    _updateIndices() {
        this.$list.find('.stk-dlist-item').each((i, el) => {
            const $el = $(el);
            $el.attr('data-index', i);
            this.items[i] = { ...this.items[i], index: i };
        });
    }

    getItems() {
        return this.items.map((item, index) => {
            const $item = this.$list.find(`.stk-dlist-item[data-index="${index}"]`);
            const result = { ...item };

            $item.find('input, select, textarea').each((_, el) => {
                const $el = $(el);
                const field = $el.data('field') || 'value';
                result[field] = $el.is(':checkbox') ? $el.is(':checked') : $el.val();
            });

            return result;
        });
    }

    setItems(items) {
        this.items = items.map((item, index) => this._normalizeItem(item, index));

        const itemsHtml = this.items.map((item, index) => this.itemTemplate(item, index)).join('');
        this.$list.html(itemsHtml);
    }

    clear() {
        this.items = [];
        this.$list.empty();
    }

    destroy() {
        if (this.$container) {
            this.$container.off('click', '.stk-dlist-add');
            this.$container.off('click', '.stk-dlist-delete');
            this.$container.off('input change', '.stk-dlist-input, input, select, textarea');
            this.$container = null;
            this.$list = null;
        }
    }
}
