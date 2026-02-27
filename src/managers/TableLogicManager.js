import { DatabaseManager } from './DatabaseManager.js';
import { storage } from './StorageManager.js';

const LOG_PREFIX = '[TableLogic]';

function logDebug(...args) {
    console.log(LOG_PREFIX, ...args);
}

export class TableLogicManager {
    static _instance = null;

    static getInstance() {
        if (!TableLogicManager._instance) {
            TableLogicManager._instance = new TableLogicManager();
        }
        return TableLogicManager._instance;
    }

    constructor() {
        this._auditLog = [];
        this._pendingCommands = [];
        this._maxAuditLogSize = 100;
    }

    async getCurrentData() {
        const isolationKey = storage.getIsolationKey();
        return await DatabaseManager.mergeAllIndependentTables(isolationKey);
    }

    async getTable(sheetKey) {
        const data = await this.getCurrentData();
        return data?.[sheetKey] || null;
    }

    async updateTable(sheetKey, updates, options = {}) {
        const { reason = 'update', skipAudit = false } = options;

        const context = SillyTavern?.getContext?.();
        const chat = context?.chat;
        if (!chat || chat.length === 0) {
            logDebug('Cannot update table: No chat history');
            return false;
        }

        const existingData = await this.getTable(sheetKey);
        const newData = {
            ...existingData,
            ...updates,
            modified: Date.now()
        };

        const isolationKey = storage.getIsolationKey();
        const lastAiMessage = this._findLastAiMessage(chat);

        if (!lastAiMessage) {
            logDebug('Cannot update table: No AI message found');
            return false;
        }

        if (!lastAiMessage.TavernDB_STK_IsolatedData) {
            lastAiMessage.TavernDB_STK_IsolatedData = {};
        }

        if (!lastAiMessage.TavernDB_STK_IsolatedData[isolationKey]) {
            lastAiMessage.TavernDB_STK_IsolatedData[isolationKey] = {
                independentData: {},
                modifiedKeys: []
            };
        }

        const tagData = lastAiMessage.TavernDB_STK_IsolatedData[isolationKey];
        tagData.independentData[sheetKey] = newData;

        if (!tagData.modifiedKeys.includes(sheetKey)) {
            tagData.modifiedKeys.push(sheetKey);
        }

        if (!skipAudit) {
            this._addAuditEntry({
                action: 'updateTable',
                sheetKey,
                reason,
                timestamp: Date.now()
            });
        }

        logDebug(`Table updated: ${sheetKey}`);
        return true;
    }

    async createTable(sheetKey, tableData, options = {}) {
        const { name, orderNo, ...restData } = tableData;

        const newData = {
            name: name || sheetKey,
            orderNo: orderNo ?? Date.now(),
            created: Date.now(),
            ...restData
        };

        return await this.updateTable(sheetKey, newData, { ...options, reason: 'create' });
    }

    async deleteTable(sheetKey, options = {}) {
        const context = SillyTavern?.getContext?.();
        const chat = context?.chat;
        if (!chat || chat.length === 0) {
            return false;
        }

        const isolationKey = storage.getIsolationKey();
        const lastAiMessage = this._findLastAiMessage(chat);

        if (!lastAiMessage?.TavernDB_STK_IsolatedData?.[isolationKey]) {
            return false;
        }

        const tagData = lastAiMessage.TavernDB_STK_IsolatedData[isolationKey];

        if (tagData.independentData?.[sheetKey]) {
            delete tagData.independentData[sheetKey];
        }

        const modIndex = tagData.modifiedKeys?.indexOf(sheetKey);
        if (modIndex > -1) {
            tagData.modifiedKeys.splice(modIndex, 1);
        }

        this._addAuditEntry({
            action: 'deleteTable',
            sheetKey,
            reason: options.reason || 'delete',
            timestamp: Date.now()
        });

        logDebug(`Table deleted: ${sheetKey}`);
        return true;
    }

    async updateField(sheetKey, fieldName, value, options = {}) {
        const table = await this.getTable(sheetKey);
        if (!table) {
            logDebug(`Table not found: ${sheetKey}`);
            return false;
        }

        const updates = { [fieldName]: value };
        return await this.updateTable(sheetKey, updates, options);
    }

    async reorderTable(sheetKey, newOrderNo, options = {}) {
        const table = await this.getTable(sheetKey);
        if (!table) return false;

        return await this.updateTable(sheetKey, { orderNo: newOrderNo }, { ...options, reason: 'reorder' });
    }

    async batchUpdate(updates, options = {}) {
        const results = [];

        for (const update of updates) {
            const { sheetKey, data } = update;
            const result = await this.updateTable(sheetKey, data, { ...options, skipAudit: true });
            results.push({ sheetKey, success: result });
        }

        this._addAuditEntry({
            action: 'batchUpdate',
            count: updates.length,
            reason: options.reason || 'batch',
            timestamp: Date.now()
        });

        return results;
    }

    parseTableEditCommand(text) {
        const patterns = [
            /\[表格编辑\]([\s\S]*?)\[\/表格编辑\]/i,
            /\[TABLE_EDIT\]([\s\S]*?)\[\/TABLE_EDIT\]/i,
            /```table_edit\n([\s\S]*?)```/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return this._parseEditContent(match[1].trim());
            }
        }

        return null;
    }

    _parseEditContent(content) {
        const commands = [];
        const lines = content.split('\n');

        let currentCommand = null;

        for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed) continue;

            if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

            const actionMatch = trimmed.match(/^\[(\w+)\]$/);
            if (actionMatch) {
                if (currentCommand) {
                    commands.push(currentCommand);
                }
                currentCommand = { action: actionMatch[1].toLowerCase(), data: {} };
                continue;
            }

            if (currentCommand) {
                const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
                if (kvMatch) {
                    const key = kvMatch[1].trim();
                    let value = kvMatch[2].trim();

                    if (value.startsWith('{') || value.startsWith('[')) {
                        try {
                            value = JSON.parse(value);
                        } catch {}
                    } else if (value === 'true') {
                        value = true;
                    } else if (value === 'false') {
                        value = false;
                    } else if (!isNaN(Number(value))) {
                        value = Number(value);
                    }

                    currentCommand.data[key] = value;
                }
            }
        }

        if (currentCommand) {
            commands.push(currentCommand);
        }

        return commands;
    }

    async executeCommands(commands, options = {}) {
        const results = [];

        for (const cmd of commands) {
            let result = { action: cmd.action, success: false };

            try {
                switch (cmd.action) {
                    case 'update':
                    case 'set':
                        result.success = await this.updateTable(
                            cmd.data.sheetKey,
                            cmd.data.updates || cmd.data,
                            options
                        );
                        break;

                    case 'create':
                    case 'add':
                        result.success = await this.createTable(
                            cmd.data.sheetKey,
                            cmd.data,
                            options
                        );
                        break;

                    case 'delete':
                    case 'remove':
                        result.success = await this.deleteTable(
                            cmd.data.sheetKey,
                            options
                        );
                        break;

                    case 'reorder':
                        result.success = await this.reorderTable(
                            cmd.data.sheetKey,
                            cmd.data.orderNo,
                            options
                        );
                        break;

                    default:
                        logDebug(`Unknown command action: ${cmd.action}`);
                }
            } catch (err) {
                logDebug(`Command execution error:`, err);
                result.error = err.message;
            }

            results.push(result);
        }

        return results;
    }

    _findLastAiMessage(chat) {
        for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i].is_user) {
                return chat[i];
            }
        }
        return null;
    }

    _addAuditEntry(entry) {
        this._auditLog.push(entry);

        if (this._auditLog.length > this._maxAuditLogSize) {
            this._auditLog = this._auditLog.slice(-this._maxAuditLogSize);
        }
    }

    getAuditLog(limit = 50) {
        return this._auditLog.slice(-limit);
    }

    clearAuditLog() {
        this._auditLog = [];
    }

    generatePromptTemplate(sheetKeys, options = {}) {
        const { includeFields = true, format = 'standard' } = options;

        if (format === 'compact') {
            return this._generateCompactTemplate(sheetKeys);
        }

        const data = this.getCurrentData();

        const tablesSection = sheetKeys.map(key => {
            const table = data?.[key];
            if (!table) return '';

            const name = table.name || key;
            const fields = Object.keys(table).filter(k =>
                !['name', 'orderNo', 'created', 'modified'].includes(k)
            );

            let content = `[${name}]\n`;

            if (includeFields && fields.length > 0) {
                fields.forEach(f => {
                    content += `${f}: ${table[f]}\n`;
                });
            }

            return content;
        }).filter(Boolean).join('\n');

        return `[表格编辑]
// 使用以下格式编辑表格:
// [update] 或 [set] - 更新表格
// [create] 或 [add] - 创建新表格
// [delete] 或 [remove] - 删除表格

// 示例:
// [update]
// sheetKey: sheet_001
// 字段名: 新值

当前表格数据:
${tablesSection}
[/表格编辑]`;
    }

    _generateCompactTemplate(sheetKeys) {
        return `[TABLE_EDIT]
// action: update|create|delete
// sheetKey: target_sheet
// field: value
[/TABLE_EDIT]`;
    }
}

export const tableLogic = TableLogicManager.getInstance();
