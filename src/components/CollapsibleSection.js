export class CollapsibleSection {
    constructor(options) {
        this.id = options.id || `stk-section-${Date.now()}`;
        this.title = options.title || '';
        this.collapsed = options.collapsed !== false;
        this.content = options.content || '';
        this.className = options.className || 'stk-section';
        this.headerClassName = options.headerClassName || 'stk-section-header';
        this.bodyClassName = options.bodyClassName || 'stk-section-body';
        this.onToggle = options.onToggle || null;
        this.$el = null;
    }

    render() {
        const collapsedClass = this.collapsed ? 'collapsed' : '';
        const hiddenClass = this.collapsed ? 'stk-hidden' : '';

        return `
            <div class="${this.className}" id="${this.id}">
                <div class="${this.headerClassName} interactable ${collapsedClass}" tabindex="0">
                    <span>${this.title}</span>
                    <span class="stk-arrow fa-solid fa-chevron-down"></span>
                </div>
                <div class="${this.bodyClassName} ${hiddenClass}">
                    ${typeof this.content === 'string' ? this.content : ''}
                </div>
            </div>
        `;
    }

    bindEvents() {
        this.$el = $(`#${this.id}`);
        const $header = this.$el.find(`.${this.headerClassName.split(' ')[0]}`);

        $header.on('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        $header.on('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    toggle() {
        this.collapsed = !this.collapsed;

        if (this.$el) {
            const $header = this.$el.find(`.${this.headerClassName.split(' ')[0]}`);
            const $body = this.$el.find(`.${this.bodyClassName.split(' ')[0]}`);

            $header.toggleClass('collapsed', this.collapsed);
            $body.toggleClass('stk-hidden', this.collapsed);
        }

        if (this.onToggle) {
            this.onToggle(this.collapsed);
        }
    }

    expand() {
        if (this.collapsed) {
            this.toggle();
        }
    }

    collapse() {
        if (!this.collapsed) {
            this.toggle();
        }
    }

    setContent(content) {
        this.content = content;
        if (this.$el) {
            const $body = this.$el.find(`.${this.bodyClassName.split(' ')[0]}`);
            $body.html(typeof content === 'string' ? content : '');
        }
    }

    destroy() {
        if (this.$el) {
            this.$el.find(`.${this.headerClassName.split(' ')[0]}`).off();
            this.$el = null;
        }
    }
}

export class CollapsibleSubSection {
    constructor(options) {
        this.id = options.id || `stk-sub-${Date.now()}`;
        this.title = options.title || '';
        this.collapsed = options.collapsed !== false;
        this.content = options.content || '';
        this.$el = null;
    }

    render() {
        const collapsedClass = this.collapsed ? 'collapsed' : '';
        const hiddenClass = this.collapsed ? 'stk-hidden' : '';

        return `
            <div class="stk-sub-section" id="${this.id}">
                <div class="stk-sub-header interactable" tabindex="0">
                    <span class="stk-arrow fa-solid fa-chevron-down ${collapsedClass}" style="font-size:10px"></span>
                    ${this.title}
                </div>
                <div class="stk-sub-body ${hiddenClass}">
                    ${typeof this.content === 'string' ? this.content : ''}
                </div>
            </div>
        `;
    }

    bindEvents() {
        this.$el = $(`#${this.id}`);
        const $header = this.$el.find('.stk-sub-header');

        $header.on('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        $header.on('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    toggle() {
        this.collapsed = !this.collapsed;

        if (this.$el) {
            const $arrow = this.$el.find('.stk-sub-header .stk-arrow');
            const $body = this.$el.find('.stk-sub-body');

            $arrow.toggleClass('collapsed', this.collapsed);
            $body.toggleClass('stk-hidden', this.collapsed);
        }
    }

    expand() {
        if (this.collapsed) {
            this.toggle();
        }
    }

    collapse() {
        if (!this.collapsed) {
            this.toggle();
        }
    }

    destroy() {
        if (this.$el) {
            this.$el.find('.stk-sub-header').off();
            this.$el = null;
        }
    }
}
