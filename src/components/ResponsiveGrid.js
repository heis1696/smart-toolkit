export class ResponsiveGrid {
    constructor(options) {
        this.id = options.id || `stk-grid-${Date.now()}`;
        this.items = options.items || [];
        this.breakpoints = options.breakpoints || this._getDefaultBreakpoints();
        this.className = options.className || '';
        this.gap = options.gap || 12;
        this.onItemClick = options.onItemClick || null;
        this.onLayoutChange = options.onLayoutChange || null;
        this.$el = null;
        this._currentBreakpoint = null;
        this._resizeObserver = null;
    }

    _getDefaultBreakpoints() {
        return [
            { name: 'xs', maxWidth: 320, columns: 1 },
            { name: 'sm', maxWidth: 480, columns: 2 },
            { name: 'md', maxWidth: 768, columns: 3 },
            { name: 'lg', maxWidth: 1024, columns: 4 },
            { name: 'xl', maxWidth: Infinity, columns: 5 }
        ];
    }

    render() {
        const customClass = this.className ? ` ${this.className}` : '';
        const currentCols = this._getCurrentColumns();

        const itemsHtml = this.items.map((item, index) => {
            const colSpan = Math.min(item.colSpan || 1, currentCols);
            const rowSpan = item.rowSpan || 1;

            return `
                <div class="stk-grid-item"
                     data-index="${index}"
                     data-id="${item.id || index}"
                     style="grid-column: span ${colSpan}; grid-row: span ${rowSpan};">
                    <div class="stk-grid-item-content">
                        ${item.content || ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="stk-grid${customClass}" id="${this.id}"
                 style="grid-template-columns: repeat(${currentCols}, 1fr); gap: ${this.gap}px;">
                ${itemsHtml}
            </div>
        `;
    }

    show(parentSelector = 'body') {
        if (this.$el) {
            this.$el.removeClass('stk-grid-hidden');
            this._updateLayout();
            return;
        }

        const html = this.render();
        $(parentSelector).append(html);

        this.$el = $(`#${this.id}`);
        this._bindEvents();
        this._observeResize();
        this._updateLayout();
    }

    _bindEvents() {
        this.$el.on('click', '.stk-grid-item', (e) => {
            const $item = $(e.currentTarget);
            const index = parseInt($item.data('index'), 10);
            const item = this.items[index];

            if (this.onItemClick) {
                this.onItemClick(item, index, $item);
            }
        });
    }

    _observeResize() {
        if (typeof ResizeObserver === 'undefined') return;

        this._resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this._handleResize(entry.contentRect.width);
            }
        });

        this._resizeObserver.observe(this.$el[0]);
    }

    _handleResize(width) {
        const newBreakpoint = this._getBreakpointForWidth(width);

        if (newBreakpoint !== this._currentBreakpoint) {
            this._currentBreakpoint = newBreakpoint;
            this._updateLayout();

            if (this.onLayoutChange) {
                this.onLayoutChange(newBreakpoint, width);
            }
        }
    }

    _getBreakpointForWidth(width) {
        for (const bp of this.breakpoints) {
            if (width <= bp.maxWidth) {
                return bp.name;
            }
        }
        return 'xl';
    }

    _getCurrentColumns() {
        if (!this.$el) {
            return this.breakpoints[0].columns;
        }

        const width = this.$el.width();
        const bp = this.breakpoints.find(b => width <= b.maxWidth) || this.breakpoints[this.breakpoints.length - 1];
        return bp.columns;
    }

    _updateLayout() {
        if (!this.$el) return;

        const currentCols = this._getCurrentColumns();
        this.$el.css('grid-template-columns', `repeat(${currentCols}, 1fr)`);

        this.$el.find('.stk-grid-item').each((index, el) => {
            const $item = $(el);
            const item = this.items[index];
            if (!item) return;

            const colSpan = Math.min(item.colSpan || 1, currentCols);
            const rowSpan = item.rowSpan || 1;

            $item.css({
                'grid-column': `span ${colSpan}`,
                'grid-row': `span ${rowSpan}`
            });
        });
    }

    setItems(items) {
        this.items = items;

        if (this.$el) {
            const currentCols = this._getCurrentColumns();

            const itemsHtml = items.map((item, index) => {
                const colSpan = Math.min(item.colSpan || 1, currentCols);
                const rowSpan = item.rowSpan || 1;

                return `
                    <div class="stk-grid-item"
                         data-index="${index}"
                         data-id="${item.id || index}"
                         style="grid-column: span ${colSpan}; grid-row: span ${rowSpan};">
                        <div class="stk-grid-item-content">
                            ${item.content || ''}
                        </div>
                    </div>
                `;
            }).join('');

            this.$el.html(itemsHtml);
        }
    }

    addItem(item) {
        this.items.push(item);

        if (this.$el) {
            const currentCols = this._getCurrentColumns();
            const index = this.items.length - 1;
            const colSpan = Math.min(item.colSpan || 1, currentCols);
            const rowSpan = item.rowSpan || 1;

            const itemHtml = `
                <div class="stk-grid-item"
                     data-index="${index}"
                     data-id="${item.id || index}"
                     style="grid-column: span ${colSpan}; grid-row: span ${rowSpan};">
                    <div class="stk-grid-item-content">
                        ${item.content || ''}
                    </div>
                </div>
            `;

            this.$el.append(itemHtml);
        }
    }

    removeItem(index) {
        if (index < 0 || index >= this.items.length) return;

        this.items.splice(index, 1);

        if (this.$el) {
            this.$el.find(`.stk-grid-item[data-index="${index}"]`).remove();

            this.$el.find('.stk-grid-item').each((i, el) => {
                const $item = $(el);
                const oldIndex = parseInt($item.data('index'), 10);
                if (oldIndex > index) {
                    $item.data('index', oldIndex - 1);
                    $item.attr('data-index', oldIndex - 1);
                }
            });
        }
    }

    updateItem(index, item) {
        if (index < 0 || index >= this.items.length) return;

        this.items[index] = { ...this.items[index], ...item };

        if (this.$el) {
            const $item = this.$el.find(`.stk-grid-item[data-index="${index}"]`);
            $item.find('.stk-grid-item-content').html(item.content || '');
        }
    }

    setBreakpoints(breakpoints) {
        this.breakpoints = breakpoints;
        this._updateLayout();
    }

    setGap(gap) {
        this.gap = gap;
        if (this.$el) {
            this.$el.css('gap', `${gap}px`);
        }
    }

    getCurrentBreakpoint() {
        return this._currentBreakpoint;
    }

    getCurrentColumns() {
        return this._getCurrentColumns();
    }

    hide() {
        if (this.$el) {
            this.$el.addClass('stk-grid-hidden');
        }
    }

    destroy() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        if (this.$el) {
            this.$el.remove();
            this.$el = null;
        }

        this.items = [];
    }
}
