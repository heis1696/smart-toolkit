const PLUGIN_NAME = 'smart-toolkit';
const DB_NAME = 'smart-toolkit-cache';
const DB_VERSION = 1;
const STORE_NAME = 'config';

export class StorageManager {
    static _instance = null;
    _db = null;
    _cache = new Map();
    _initialized = false;
    _initPromise = null;

    static getInstance() {
        if (!StorageManager._instance) {
            StorageManager._instance = new StorageManager();
        }
        return StorageManager._instance;
    }

    async init() {
        if (this._initialized) return;
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._doInit();
        await this._initPromise;
        this._initPromise = null;
    }

    async _doInit() {
        const cachedData = await this._loadFromIndexedDB();
        if (cachedData) {
            for (const [key, value] of Object.entries(cachedData)) {
                this._cache.set(key, value);
            }
        }
        this._initialized = true;
    }

    async _loadFromIndexedDB() {
        return new Promise((resolve) => {
            if (!window.indexedDB) {
                resolve(null);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => resolve(null);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                const transaction = this._db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const getAllRequest = store.getAll();

                getAllRequest.onsuccess = () => {
                    const result = {};
                    for (const item of getAllRequest.result) {
                        result[item.key] = item.value;
                    }
                    resolve(result);
                };

                getAllRequest.onerror = () => resolve(null);
            };
        });
    }

    _getTavernSettings() {
        try {
            const ctx = SillyTavern?.getContext?.();
            if (ctx?.extensionSettings?.[PLUGIN_NAME]) {
                return ctx.extensionSettings[PLUGIN_NAME];
            }
        } catch {}
        return null;
    }

    _persistTavernSettings() {
        try {
            const ctx = SillyTavern?.getContext?.();
            if (ctx?.saveSettingsDebounced) {
                ctx.saveSettingsDebounced();
            }
        } catch {}
    }

    get(key) {
        const tavernSettings = this._getTavernSettings();
        if (tavernSettings && Object.prototype.hasOwnProperty.call(tavernSettings, key)) {
            return tavernSettings[key];
        }

        if (this._cache.has(key)) {
            return this._cache.get(key);
        }

        return null;
    }

    set(key, value) {
        const strValue = typeof value === 'string' ? value : JSON.stringify(value);

        const tavernSettings = this._getTavernSettings();
        if (tavernSettings !== null) {
            tavernSettings[key] = strValue;
            this._persistTavernSettings();
        }

        this._cache.set(key, strValue);
        this._saveToIndexedDB(key, strValue);
    }

    _saveToIndexedDB(key, value) {
        if (!this._db) return;

        try {
            const transaction = this._db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.put({ key, value });
        } catch {}
    }

    getObject(key) {
        const value = this.get(key);
        if (value === null) return null;

        try {
            return JSON.parse(value);
        } catch {
            return null;
        }
    }

    setObject(key, value) {
        this.set(key, JSON.stringify(value));
    }

    delete(key) {
        const tavernSettings = this._getTavernSettings();
        if (tavernSettings && Object.prototype.hasOwnProperty.call(tavernSettings, key)) {
            delete tavernSettings[key];
            this._persistTavernSettings();
        }

        this._cache.delete(key);

        if (this._db) {
            try {
                const transaction = this._db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                store.delete(key);
            } catch {}
        }
    }

    getModuleSettings(moduleId, defaults) {
        const settings = this.getObject(moduleId) || {};
        const result = { ...defaults };

        for (const [key, defaultValue] of Object.entries(defaults)) {
            if (settings[key] !== undefined) {
                result[key] = settings[key];
            } else {
                result[key] = JSON.parse(JSON.stringify(defaultValue));
            }
        }

        return result;
    }

    saveModuleSettings(moduleId, settings) {
        this.setObject(moduleId, settings);
    }

    getSettings() {
        return this._getTavernSettings() || {};
    }

    saveSettings() {
        this._persistTavernSettings();
    }
}

export const storage = StorageManager.getInstance();
