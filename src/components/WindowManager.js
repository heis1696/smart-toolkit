import { storage } from '../managers/StorageManager.js';

const WINDOW_STATE_KEY = 'stk-window-states';

export class WindowManager {
    static _instance = null;
    windows = new Map();
    topZIndex = 1000;
    activeWindowId = null;

    static getInstance() {
        if (!WindowManager._instance) {
            WindowManager._instance = new WindowManager();
        }
        return WindowManager._instance;
    }

    constructor() {
        this._loadStates();
    }

    _loadStates() {
        const states = storage.getObject(WINDOW_STATE_KEY) || {};
        if (states.topZIndex) {
            this.topZIndex = states.topZIndex;
        }
    }

    _saveStates() {
        const states = {
            topZIndex: this.topZIndex,
            windows: {}
        };

        this.windows.forEach((win, id) => {
            if (win.persistState) {
                states.windows[id] = {
                    position: win.position,
                    size: win.size,
                    collapsed: win.collapsed
                };
            }
        });

        storage.setObject(WINDOW_STATE_KEY, states);
    }

    register(windowInstance) {
        const id = windowInstance.id;

        if (this.windows.has(id)) {
            console.warn(`WindowManager: Window ${id} already registered`);
            return;
        }

        this.windows.set(id, windowInstance);

        const savedState = this._getSavedWindowState(id);
        if (savedState && windowInstance.persistState) {
            windowInstance.restoreState(savedState);
        }

        this._bindWindowEvents(windowInstance);
    }

    _getSavedWindowState(id) {
        const states = storage.getObject(WINDOW_STATE_KEY) || {};
        return states.windows ? states.windows[id] : null;
    }

    _bindWindowEvents(windowInstance) {
        const originalOnFocus = windowInstance.onFocus;
        windowInstance.onFocus = () => {
            this.bringToFront(windowInstance.id);
            if (originalOnFocus) originalOnFocus.call(windowInstance);
        };

        const originalOnClose = windowInstance.onClose;
        windowInstance.onClose = () => {
            this.unregister(windowInstance.id);
            if (originalOnClose) originalOnClose.call(windowInstance);
        };
    }

    unregister(id) {
        if (this.windows.has(id)) {
            const win = this.windows.get(id);
            if (win.persistState) {
                this._saveStates();
            }
            this.windows.delete(id);

            if (this.activeWindowId === id) {
                this.activeWindowId = null;
            }
        }
    }

    bringToFront(id) {
        const win = this.windows.get(id);
        if (!win) return;

        this.topZIndex++;
        win.setZIndex(this.topZIndex);
        this.activeWindowId = id;

        this.windows.forEach((w, wid) => {
            if (wid !== id && w.$el) {
                w.$el.removeClass('stk-window-active');
            }
        });

        if (win.$el) {
            win.$el.addClass('stk-window-active');
        }
    }

    getWindow(id) {
        return this.windows.get(id);
    }

    hideAll() {
        this.windows.forEach((win) => {
            if (win.hide) {
                win.hide();
            }
        });
    }

    showAll() {
        this.windows.forEach((win) => {
            if (win.show) {
                win.show();
            }
        });
    }

    closeAll() {
        const windowsToClose = Array.from(this.windows.values());
        windowsToClose.forEach((win) => {
            if (win.close) {
                win.close();
            }
        });
    }

    getActiveWindow() {
        return this.activeWindowId ? this.windows.get(this.activeWindowId) : null;
    }

    saveAllStates() {
        this._saveStates();
    }
}

export const windowManager = WindowManager.getInstance();
