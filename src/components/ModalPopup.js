export class ModalPopup {
    constructor(options) {
        this.id = options.id || `stk-modal-${Date.now()}`;
        this.title = options.title || '';
        this.content = options.content || '';
        this.width = options.width || 'auto';
        this.showClose = options.showClose !== false;
        this.closeOnOverlay = options.closeOnOverlay !== false;
        this.onShow = options.onShow || null;
        this.onHide = options.onHide || null;
        this.onConfirm = options.onConfirm || null;
        this.onCancel = options.onCancel || null;
        this.confirmText = options.confirmText || '确认';
        this.cancelText = options.cancelText || '取消';
        this.showButtons = options.showButtons || false;
        this.$el = null;
        this.$overlay = null;
    }

    render() {
        const widthStyle = this.width === 'auto' ? '' : `style="width: ${this.width}px"`;
        const closeBtnHtml = this.showClose
            ? '<button class="stk-modal-close interactable" tabindex="0"><span class="fa-solid fa-xmark"></span></button>'
            : '';
        const buttonsHtml = this.showButtons
            ? `
                <div class="stk-modal-buttons">
                    <button class="button stk-modal-cancel">${this.cancelText}</button>
                    <button class="button stk-modal-confirm">${this.confirmText}</button>
                </div>
            `
            : '';

        return `
            <div class="stk-modal-overlay" id="${this.id}-overlay">
                <div class="stk-modal" id="${this.id}" ${widthStyle}>
                    <div class="stk-modal-header">
                        <span class="stk-modal-title">${this.title}</span>
                        ${closeBtnHtml}
                    </div>
                    <div class="stk-modal-body">
                        ${typeof this.content === 'string' ? this.content : ''}
                    </div>
                    ${buttonsHtml}
                </div>
            </div>
        `;
    }

    show(parentSelector = 'body') {
        const html = this.render();
        $(parentSelector).append(html);

        this.$el = $(`#${this.id}`);
        this.$overlay = $(`#${this.id}-overlay`);

        this._bindEvents();

        this.$overlay.addClass('stk-modal-visible');

        if (this.onShow) {
            this.onShow();
        }

        const $firstFocusable = this.$el.find('input, select, textarea, button, [tabindex="0"]').first();
        if ($firstFocusable.length) {
            setTimeout(() => $firstFocusable.focus(), 100);
        }
    }

    _bindEvents() {
        this.$overlay.on('click', (e) => {
            if (this.closeOnOverlay && $(e.target).hasClass('stk-modal-overlay')) {
                this.hide();
            }
        });

        this.$el.find('.stk-modal-close').on('click', () => {
            this.hide();
        });

        this.$el.find('.stk-modal-cancel').on('click', () => {
            if (this.onCancel) {
                this.onCancel();
            }
            this.hide();
        });

        this.$el.find('.stk-modal-confirm').on('click', () => {
            if (this.onConfirm) {
                const shouldClose = this.onConfirm();
                if (shouldClose !== false) {
                    this.hide();
                }
            } else {
                this.hide();
            }
        });

        this.$el.on('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });
    }

    hide() {
        if (this.$overlay) {
            this.$overlay.removeClass('stk-modal-visible');

            setTimeout(() => {
                this._destroy();
            }, 200);
        }

        if (this.onHide) {
            this.onHide();
        }
    }

    _destroy() {
        if (this.$overlay) {
            this.$overlay.off();
            this.$overlay.remove();
            this.$overlay = null;
            this.$el = null;
        }
    }

    setContent(content) {
        this.content = content;
        if (this.$el) {
            this.$el.find('.stk-modal-body').html(typeof content === 'string' ? content : '');
        }
    }

    setTitle(title) {
        this.title = title;
        if (this.$el) {
            this.$el.find('.stk-modal-title').text(title);
        }
    }

    destroy() {
        this._destroy();
    }
}

export class Toast {
    static show(message, type = 'info', duration = 3000) {
        const id = `stk-toast-${Date.now()}`;
        const iconMap = {
            info: 'fa-info-circle',
            success: 'fa-check-circle',
            warning: 'fa-exclamation-triangle',
            error: 'fa-times-circle'
        };

        const html = `
            <div class="stk-toast stk-toast-${type}" id="${id}">
                <span class="fa-solid ${iconMap[type] || iconMap.info}"></span>
                <span class="stk-toast-message">${message}</span>
            </div>
        `;

        let $container = $('#stk-toast-container');
        if (!$container.length) {
            $('body').append('<div id="stk-toast-container"></div>');
            $container = $('#stk-toast-container');
        }

        $container.append(html);

        const $toast = $(`#${id}`);
        setTimeout(() => $toast.addClass('stk-toast-visible'), 10);

        setTimeout(() => {
            $toast.removeClass('stk-toast-visible');
            setTimeout(() => $toast.remove(), 300);
        }, duration);

        return id;
    }

    static info(message, duration) {
        return Toast.show(message, 'info', duration);
    }

    static success(message, duration) {
        return Toast.show(message, 'success', duration);
    }

    static warning(message, duration) {
        return Toast.show(message, 'warning', duration);
    }

    static error(message, duration) {
        return Toast.show(message, 'error', duration);
    }
}

export class ConfirmDialog {
    static show(options) {
        return new Promise((resolve) => {
            const modal = new ModalPopup({
                title: options.title || '确认',
                content: options.message || '确定要执行此操作吗？',
                width: options.width || 400,
                showButtons: true,
                confirmText: options.confirmText || '确认',
                cancelText: options.cancelText || '取消',
                onConfirm: () => {
                    resolve(true);
                    return true;
                },
                onCancel: () => {
                    resolve(false);
                },
                onHide: () => {
                    resolve(false);
                }
            });

            modal.show();
        });
    }
}
