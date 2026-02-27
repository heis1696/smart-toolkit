export class TabbedPanel {
    constructor(options) {
        this.id = options.id || `stk-tabs-${Date.now()}`;
        this.tabs = options.tabs || [];
        this.activeTab = options.activeTab || null;
        this.className = options.className || '';
        this.onTabChange = options.onTabChange || null;
        this.tabPosition = options.tabPosition || 'top';
        this.$el = null;
        this.$tabList = null;
        this.$tabContent = null;
        this._tabContents = new Map();
    }

    render() {
        const positionClass = `stk-tabs-${this.tabPosition}`;
        const customClass = this.className ? ` ${this.className}` : '';

        const tabsHtml = this.tabs.map(tab => {
            const activeClass = tab.id === this.activeTab ? ' stk-tab-active' : '';
            const iconHtml = tab.icon ? `<span class="stk-tab-icon ${tab.icon}"></span>` : '';
            const badgeHtml = tab.badge ? `<span class="stk-tab-badge">${tab.badge}</span>` : '';
            return `
                <button class="stk-tab${activeClass}" data-tab-id="${tab.id}" tabindex="0">
                    ${iconHtml}
                    <span class="stk-tab-label">${tab.label}</span>
                    ${badgeHtml}
                </button>
            `;
        }).join('');

        const activeTabData = this.tabs.find(t => t.id === this.activeTab) || this.tabs[0];
        const initialContent = activeTabData?.content || '';

        return `
            <div class="stk-tabs ${positionClass}${customClass}" id="${this.id}">
                <div class="stk-tab-list">${tabsHtml}</div>
                <div class="stk-tab-content">${initialContent}</div>
            </div>
        `;
    }

    show(parentSelector = 'body') {
        if (this.$el) {
            this.$el.removeClass('stk-tabs-hidden');
            return;
        }

        if (!this.activeTab && this.tabs.length > 0) {
            this.activeTab = this.tabs[0].id;
        }

        const html = this.render();
        $(parentSelector).append(html);

        this.$el = $(`#${this.id}`);
        this.$tabList = this.$el.find('.stk-tab-list');
        this.$tabContent = this.$el.find('.stk-tab-content');

        this._bindEvents();
    }

    _bindEvents() {
        this.$tabList.on('click', '.stk-tab', (e) => {
            const $tab = $(e.currentTarget);
            const tabId = $tab.data('tab-id');
            this.switchTab(tabId);
        });

        this.$tabList.on('keydown', '.stk-tab', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const $tab = $(e.currentTarget);
                const tabId = $tab.data('tab-id');
                this.switchTab(tabId);
            }
        });
    }

    switchTab(tabId) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        this.activeTab = tabId;

        this.$tabList.find('.stk-tab').removeClass('stk-tab-active');
        this.$tabList.find(`[data-tab-id="${tabId}"]`).addClass('stk-tab-active');

        let content = this._tabContents.get(tabId) || tab.content || '';
        this.$tabContent.html(content);

        if (this.onTabChange) {
            this.onTabChange(tabId, tab);
        }
    }

    setTabContent(tabId, content) {
        this._tabContents.set(tabId, content);

        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.content = content;
        }

        if (this.activeTab === tabId && this.$tabContent) {
            this.$tabContent.html(content);
        }
    }

    getTabContent(tabId) {
        return this._tabContents.get(tabId) || this.tabs.find(t => t.id === tabId)?.content || '';
    }

    addTab(tab) {
        this.tabs.push(tab);

        if (this.$tabList) {
            const iconHtml = tab.icon ? `<span class="stk-tab-icon ${tab.icon}"></span>` : '';
            const badgeHtml = tab.badge ? `<span class="stk-tab-badge">${tab.badge}</span>` : '';
            const tabHtml = `
                <button class="stk-tab" data-tab-id="${tab.id}" tabindex="0">
                    ${iconHtml}
                    <span class="stk-tab-label">${tab.label}</span>
                    ${badgeHtml}
                </button>
            `;
            this.$tabList.append(tabHtml);
        }
    }

    removeTab(tabId) {
        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        this.tabs.splice(index);
        this._tabContents.delete(tabId);

        if (this.$tabList) {
            this.$tabList.find(`[data-tab-id="${tabId}"]`).remove();
        }

        if (this.activeTab === tabId && this.tabs.length > 0) {
            this.switchTab(this.tabs[0].id);
        }
    }

    updateTabBadge(tabId, badge) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        tab.badge = badge;

        if (this.$tabList) {
            const $tab = this.$tabList.find(`[data-tab-id="${tabId}"]`);
            let $badge = $tab.find('.stk-tab-badge');

            if (badge) {
                if ($badge.length === 0) {
                    $tab.append(`<span class="stk-tab-badge">${badge}</span>`);
                } else {
                    $badge.text(badge);
                }
            } else {
                $badge.remove();
            }
        }
    }

    updateTabLabel(tabId, label) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        tab.label = label;

        if (this.$tabList) {
            this.$tabList.find(`[data-tab-id="${tabId}"] .stk-tab-label`).text(label);
        }
    }

    hide() {
        if (this.$el) {
            this.$el.addClass('stk-tabs-hidden');
        }
    }

    destroy() {
        if (this.$el) {
            this.$el.remove();
            this.$el = null;
            this.$tabList = null;
            this.$tabContent = null;
            this._tabContents.clear();
        }
    }

    getActiveTab() {
        return this.activeTab;
    }

    getActiveTabData() {
        return this.tabs.find(t => t.id === this.activeTab) || null;
    }
}
