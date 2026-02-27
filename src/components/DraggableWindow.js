import { windowManager } from './WindowManager.js';

export class DraggableWindow {
    constructor(options) {
        this.id = options.id || `stk-window-${Date.now()}`;
        this.title = options.title || '';
        this.content = options.content || '';
        this.width = options.width || 340;
        this.height = options.height || 'auto';
        this.minWidth = options.minWidth || 200;
        this.minHeight = options.minHeight || 100;
        this.position = options.position || { x: null, y: null };
        this.anchor = options.anchor || 'bottom-right';
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
        this.className = options.className || '';
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
        const heightStyle = this.size.height !== 'auto' ? `height: ${this.size.height}px;` : '';
        const resizeClass = this.resizable ? 'stk-window-resizable' : '';
        const customClass = this.className ? ` ${this.className}` : '';

        const minimizeBtnHtml = this.showMinimize
            ? '<button class="stk-window-btn stk-window-minimize interactable" tabindex="0"><span class="fa-solid fa-minus"></span></button>'
            : '';
        const closeBtnHtml = this.showClose
            ? '<button class="stk-window-btn stk-window-close interactable" tabindex="0"><span class="fa-solid fa-xmark"></span></button>'
            : '';

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
                    ${typeof this.content === 'string' ? this.content : ''}
                </div>
                ${this.resizable ? '<div class="stk-window-resize-handle"></div>' : ''}
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
        const height = typeof this.size.height === 'number' ? this.size.height : 300;

        let x, y;

        switch (this.anchor) {
            case 'top-left':
                x = this.offset.x;
                y = this.offset.y;
                break;
            case 'top-right':
                x = viewportWidth - width - this.offset.x;
                y = this.offset.y;
                break;
            case 'bottom-left':
                x = this.offset.x;
                y = viewportHeight - height - this.offset.y;
                break;
            case 'bottom-right':
            default:
                x = viewportWidth - width - this.offset.x;
                y = viewportHeight - height - this.offset.y;
                break;
            case 'center':
                x = (viewportWidth - width) / 2;
                y = (viewportHeight - height) / 2;
                break;
        }

        this.position = { x: Math.max(0, x), y: Math.max(0, y) };
        return `left: ${this.position.x}px; top: ${this.position.y}px;`;
    }

    show(parentSelector = 'body') {
        if (this.$el) {
            this.$el.removeClass('stk-window-hidden');
            this.isVisible = true;
            windowManager.bringToFront(this.id);
            if (this.onShow) this.onShow();
            return;
        }

        const html = this.render();
        $(parentSelector).append(html);

        this.$el = $(`#${this.id}`);
        this.$header = this.$el.find('.stk-window-header');
        this.$body = this.$el.find('.stk-window-body');

        this._bindEvents();
        windowManager.register(this);
        windowManager.bringToFront(this.id);

        this.isVisible = true;

        if (this.onShow) {
            this.onShow();
        }
    }

    _bindEvents() {
        this.$header.on('mousedown', (e) => {
            if ($(e.target).closest('.stk-window-buttons').length) return;
            if (!this.draggable) return;

            this._isDragging = true;
            this._dragOffset = {
                x: e.clientX - this.position.x,
                y: e.clientY - this.position.y
            };

            this.$el.addClass('stk-window-dragging');

            $(document).on('mousemove.stk-window', (e) => {
                if (!this._isDragging) return;

                this.position.x = e.clientX - this._dragOffset.x;
                this.position.y = e.clientY - this._dragOffset.y;

                this.position.x = Math.max(0, Math.min(this.position.x, window.innerWidth - this.$el.outerWidth()));
                this.position.y = Math.max(0, Math.min(this.position.y, window.innerHeight - this.$el.outerHeight()));

                this.$el.css({
                    left: this.position.x,
                    top: this.position.y
                });
            });

            $(document).on('mouseup.stk-window', () => {
                this._isDragging = false;
                this.$el.removeClass('stk-window-dragging');
                $(document).off('mousemove.stk-window mouseup.stk-window');
                windowManager.saveAllStates();
            });
        });

        this.$header.on('click', () => {
            windowManager.bringToFront(this.id);
            if (this.onFocus) this.onFocus();
        });

        this.$el.find('.stk-window-close').on('click', () => {
            this.close();
        });

        this.$el.find('.stk-window-minimize').on('click', () => {
            this.toggleCollapse();
        });

        if (this.resizable) {
            const $handle = this.$el.find('.stk-window-resize-handle');

            $handle.on('mousedown', (e) => {
                e.preventDefault();
                this._isResizing = true;

                const startX = e.clientX;
                const startY = e.clientY;
                const startWidth = this.$el.outerWidth();
                const startHeight = this.$el.outerHeight();

                $(document).on('mousemove.stk-resize', (e) => {
                    if (!this._isResizing) return;

                    const newWidth = Math.max(this.minWidth, startWidth + (e.clientX - startX));
                    const newHeight = Math.max(this.minHeight, startHeight + (e.clientY - startY));

                    this.size.width = newWidth;
                    this.size.height = newHeight;

                    this.$el.css({
                        width: newWidth,
                        height: newHeight
                    });
                });

                $(document).on('mouseup.stk-resize', () => {
                    this._isResizing = false;
                    $(document).off('mousemove.stk-resize mouseup.stk-resize');
                    windowManager.saveAllStates();
                    if (this.onResize) this.onResize(this.size);
                });
            });
        }
    }

    hide() {
        if (this.$el) {
            this.$el.addClass('stk-window-hidden');
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
            this.$el.toggleClass('stk-window-collapsed', this.collapsed);
        }
    }

    setContent(content) {
        this.content = content;
        if (this.$body) {
            this.$body.html(typeof content === 'string' ? content : '');
        }
    }

    setTitle(title) {
        this.title = title;
        if (this.$header) {
            this.$header.find('.stk-window-title').text(title);
        }
    }

    setZIndex(zIndex) {
        if (this.$el) {
            this.$el.css('z-index', zIndex);
        }
    }

    restoreState(state) {
        if (state.position) {
            this.position = state.position;
        }
        if (state.size) {
            this.size = state.size;
        }
        if (state.collapsed !== undefined) {
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
}
