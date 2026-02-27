import { Core } from '../core.js';

const TABLE_ORDER_FIELD = 'orderNo';

let _allChatMessages = [];
let _currentTableData = null;

function logDebug(...args) {
    console.log('[DatabaseManager]', ...args);
}

function logWarn(...args) {
    console.warn('[DatabaseManager]', ...args);
}

function logError(...args) {
    console.error('[DatabaseManager]', ...args);
}

export class DatabaseManager {
    static get TABLE_ORDER_FIELD() {
        return TABLE_ORDER_FIELD;
    }

    static get currentData() {
        return _currentTableData;
    }

    static set currentData(data) {
        _currentTableData = data;
    }

    static async loadAllChatMessages() {
        const context = SillyTavern?.getContext?.();
        if (!context) {
            logWarn('SillyTavern context not available');
            _allChatMessages = [];
            return [];
        }

        try {
            const chat = context.chat;
            if (!chat || chat.length === 0) {
                _allChatMessages = [];
                logDebug('No chat messages');
                return [];
            }

            _allChatMessages = chat.map((msg, idx) => ({ ...msg, id: idx }));
            logDebug(`Loaded ${_allChatMessages.length} messages`);
            return _allChatMessages;
        } catch (error) {
            logError('Failed to load chat messages:', error);
            _allChatMessages = [];
            return [];
        }
    }

    static getChatMessages() {
        return _allChatMessages;
    }

    static async mergeAllIndependentTables(isolationKey = '', settings = {}) {
        const context = SillyTavern?.getContext?.();
        const chat = context?.chat;
        if (!chat || chat.length === 0) {
            logDebug('Cannot merge data: Chat history is empty');
            return null;
        }

        const mergedData = {};
        const foundSheets = {};
        const tableStates = {};

        for (let i = chat.length - 1; i >= 0; i--) {
            const message = chat[i];
            if (message.is_user) continue;

            if (message.TavernDB_STK_IsolatedData?.[isolationKey]) {
                const tagData = message.TavernDB_STK_IsolatedData[isolationKey];
                const independentData = tagData.independentData || {};
                const modifiedKeys = tagData.modifiedKeys || [];

                Object.keys(independentData).forEach(sheetKey => {
                    if (!foundSheets[sheetKey]) {
                        mergedData[sheetKey] = JSON.parse(JSON.stringify(independentData[sheetKey]));
                        foundSheets[sheetKey] = true;

                        if (modifiedKeys.includes(sheetKey)) {
                            if (!tableStates[sheetKey]) tableStates[sheetKey] = {};
                            const currentAiFloor = chat.slice(0, i + 1).filter(m => !m.is_user).length;
                            tableStates[sheetKey].lastUpdatedAiFloor = currentAiFloor;
                        }
                    }
                });
            }

            if (message.TavernDB_STK_Data && this._matchesIsolation(message, isolationKey, settings)) {
                const data = message.TavernDB_STK_Data;
                Object.keys(data).forEach(k => {
                    if (k.startsWith('sheet_') && !foundSheets[k] && data[k]?.name) {
                        mergedData[k] = JSON.parse(JSON.stringify(data[k]));
                        foundSheets[k] = true;
                    }
                });
            }
        }

        const foundCount = Object.keys(foundSheets).length;
        logDebug(`Found ${foundCount} tables for isolation key [${isolationKey || 'default'}]`);

        if (foundCount <= 0) return null;

        return mergedData;
    }

    static _matchesIsolation(message, isolationKey, settings) {
        const msgIdentity = message.TavernDB_STK_Identity;
        if (settings.dataIsolationEnabled) {
            return msgIdentity === settings.dataIsolationCode;
        }
        return !msgIdentity;
    }

    static getSortedSheetKeys(dataObj, options = {}) {
        const { ignoreChatGuide = false, includeMissingFromGuide = false } = options;
        if (!dataObj || typeof dataObj !== 'object') return [];

        const existingKeys = Object.keys(dataObj).filter(k => k.startsWith('sheet_'));
        if (existingKeys.length === 0) return [];

        return existingKeys.sort((a, b) => {
            const ao = this._getOrderValue(dataObj, a);
            const bo = this._getOrderValue(dataObj, b);
            if (ao !== bo) return ao - bo;
            const an = String(dataObj[a]?.name || a);
            const bn = String(dataObj[b]?.name || b);
            return an.localeCompare(bn);
        });
    }

    static _getOrderValue(dataObj, key) {
        const v = dataObj?.[key]?.[TABLE_ORDER_FIELD];
        if (Number.isFinite(v)) return Math.trunc(v);
        return Infinity;
    }

    static reorderDataBySheetKeys(dataObj, orderedSheetKeys) {
        if (!dataObj || typeof dataObj !== 'object') return dataObj;

        const out = {};
        Object.keys(dataObj).forEach(k => {
            if (!k.startsWith('sheet_')) out[k] = dataObj[k];
        });

        const keys = Array.isArray(orderedSheetKeys) ? orderedSheetKeys : this.getSortedSheetKeys(dataObj);
        keys.forEach(k => {
            if (dataObj[k]) out[k] = dataObj[k];
        });

        return out;
    }

    static ensureSheetOrderNumbers(dataObj, options = {}) {
        const { baseOrderKeys = null, forceRebuild = false } = options;
        if (!dataObj || typeof dataObj !== 'object') return;

        const existingKeys = Object.keys(dataObj).filter(k => k.startsWith('sheet_'));
        if (existingKeys.length === 0) return;

        const needsNumbering = forceRebuild || existingKeys.some(k => {
            const v = dataObj[k]?.[TABLE_ORDER_FIELD];
            return !Number.isFinite(v);
        });

        if (!needsNumbering) return;

        const baseKeys = baseOrderKeys || existingKeys;
        baseKeys.forEach((k, idx) => {
            if (dataObj[k] && typeof dataObj[k] === 'object') {
                dataObj[k][TABLE_ORDER_FIELD] = idx + 1;
            }
        });

        existingKeys.forEach(k => {
            if (!baseKeys.includes(k) && dataObj[k] && typeof dataObj[k] === 'object') {
                const maxOrder = Math.max(0, ...existingKeys
                    .filter(sk => baseKeys.includes(sk))
                    .map(sk => dataObj[sk]?.[TABLE_ORDER_FIELD] || 0));
                dataObj[k][TABLE_ORDER_FIELD] = maxOrder + 1;
            }
        });
    }

    static sanitizeSheetForStorage(sheet) {
        if (!sheet || typeof sheet !== 'object') return sheet;

        const KEEP_KEYS = new Set([
            'uid', 'name', 'sourceData', 'content',
            'updateConfig', 'exportConfig', TABLE_ORDER_FIELD
        ]);

        const out = {};
        KEEP_KEYS.forEach(k => {
            if (sheet[k] !== undefined) out[k] = sheet[k];
        });

        if (!out.name && sheet.name) out.name = sheet.name;
        if (!out.content && Array.isArray(sheet.content)) out.content = sheet.content;
        if (!out.sourceData && sheet.sourceData) out.sourceData = sheet.sourceData;

        return out;
    }

    static sanitizeChatSheetsObject(dataObj, options = {}) {
        const { ensureMate = false } = options;
        if (!dataObj || typeof dataObj !== 'object') return dataObj;

        const out = {};
        Object.keys(dataObj).forEach(k => {
            if (k.startsWith('sheet_')) {
                out[k] = this.sanitizeSheetForStorage(dataObj[k]);
            } else if (k === 'mate') {
                out.mate = dataObj.mate;
            } else {
                out[k] = dataObj[k];
            }
        });

        if (ensureMate) {
            if (!out.mate || typeof out.mate !== 'object') {
                out.mate = { type: 'chatSheets', version: 1 };
            }
            if (!out.mate.type) out.mate.type = 'chatSheets';
            if (!out.mate.version) out.mate.version = 1;
        }

        return out;
    }

    static validateTableData(data) {
        if (!data || typeof data !== 'object') return { valid: false, errors: ['No data provided'] };

        const errors = [];
        const sheetKeys = Object.keys(data).filter(k => k.startsWith('sheet_'));

        sheetKeys.forEach(key => {
            const sheet = data[key];
            if (!sheet.name) {
                errors.push(`Sheet ${key}: missing name`);
            }
            if (!Array.isArray(sheet.content)) {
                errors.push(`Sheet ${key}: content is not an array`);
            }
        });

        return { valid: errors.length === 0, errors };
    }

    static extractTableEdits(message) {
        const text = message?.mes || message?.message || '';
        if (!text) return null;

        const tableEditRegex = /<tableEdit\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tableEdit>/gi;
        const edits = [];
        let match;

        while ((match = tableEditRegex.exec(text)) !== null) {
            const tableName = match[1];
            const content = match[2].trim();
            edits.push({ tableName, content });
        }

        return edits.length > 0 ? edits : null;
    }

    static parseTableEditContent(content) {
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        return lines.map(line => {
            const cells = line.split('|').map(c => c.trim()).filter(c => c);
            return cells;
        }).filter(row => row.length > 0);
    }

    static applyTableEdits(edits, tableData) {
        if (!edits || !tableData) return tableData;

        const result = JSON.parse(JSON.stringify(tableData));

        edits.forEach(edit => {
            const sheetKey = Object.keys(result).find(k =>
                k.startsWith('sheet_') && result[k]?.name === edit.tableName
            );

            if (sheetKey && result[sheetKey]) {
                const parsedContent = this.parseTableEditContent(edit.content);
                if (parsedContent.length > 0) {
                    const existingHeader = result[sheetKey].content?.[0] || [];
                    const hasHeaderRow = existingHeader.length > 0;

                    if (hasHeaderRow) {
                        const headerLength = existingHeader.length;
                        result[sheetKey].content = [existingHeader, ...parsedContent.map(row => {
                            while (row.length < headerLength) row.push('');
                            return row.slice(0, headerLength);
                        })];
                    } else {
                        result[sheetKey].content = parsedContent;
                    }
                }
            }
        });

        return result;
    }

    static convertTableToText(tableData, options = {}) {
        const { includeHeaders = true, separator = ' | ', rowSeparator = '\n' } = options;
        if (!tableData || !Array.isArray(tableData)) return '';

        return tableData.map((row, idx) => {
            if (!includeHeaders && idx === 0) return null;
            if (!Array.isArray(row)) return null;
            return row.map(cell => String(cell ?? '')).join(separator);
        }).filter(Boolean).join(rowSeparator);
    }

    static async refresh(isolationKey = '', settings = {}) {
        await this.loadAllChatMessages();
        const freshData = await this.mergeAllIndependentTables(isolationKey, settings);

        if (freshData) {
            const stableKeys = this.getSortedSheetKeys(freshData);
            _currentTableData = this.reorderDataBySheetKeys(freshData, stableKeys);
        } else {
            _currentTableData = null;
        }

        return _currentTableData;
    }
}

export const databaseManager = DatabaseManager;
