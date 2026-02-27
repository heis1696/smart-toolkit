import { storage } from './StorageManager.js';

const TEMPLATES_KEY = 'stk-templates';
const ACTIVE_TEMPLATE_KEY = 'stk-active-template';

export class TemplateManager {
    static _instance = null;
    templates = new Map();
    activeTemplateId = null;
    onTemplateChange = null;

    static getInstance() {
        if (!TemplateManager._instance) {
            TemplateManager._instance = new TemplateManager();
        }
        return TemplateManager._instance;
    }

    constructor() {
        this._loadTemplates();
    }

    _loadTemplates() {
        const templatesData = storage.getObject(TEMPLATES_KEY) || {};
        const activeId = storage.get(ACTIVE_TEMPLATE_KEY);

        for (const [id, template] of Object.entries(templatesData)) {
            this.templates.set(id, template);
        }

        if (activeId && this.templates.has(activeId)) {
            this.activeTemplateId = activeId;
        } else if (this.templates.size > 0) {
            this.activeTemplateId = this.templates.keys().next().value;
        }
    }

    _saveTemplates() {
        const templatesData = {};
        this.templates.forEach((template, id) => {
            templatesData[id] = template;
        });
        storage.setObject(TEMPLATES_KEY, templatesData);

        if (this.activeTemplateId) {
            storage.set(ACTIVE_TEMPLATE_KEY, this.activeTemplateId);
        }
    }

    createTemplate(options) {
        const id = options.id || `template-${Date.now()}`;
        const template = {
            id,
            name: options.name || '未命名模板',
            description: options.description || '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            data: options.data || {},
            metadata: options.metadata || {}
        };

        this.templates.set(id, template);
        this._saveTemplates();

        return template;
    }

    getTemplate(id) {
        return this.templates.get(id);
    }

    getActiveTemplate() {
        if (!this.activeTemplateId) return null;
        return this.templates.get(this.activeTemplateId);
    }

    setActiveTemplate(id) {
        if (!this.templates.has(id)) {
            console.warn(`TemplateManager: Template ${id} not found`);
            return false;
        }

        this.activeTemplateId = id;
        this._saveTemplates();

        if (this.onTemplateChange) {
            this.onTemplateChange(this.getTemplate(id));
        }

        return true;
    }

    updateTemplate(id, updates) {
        const template = this.templates.get(id);
        if (!template) return false;

        const updatedTemplate = {
            ...template,
            ...updates,
            id: template.id,
            createdAt: template.createdAt,
            updatedAt: Date.now()
        };

        this.templates.set(id, updatedTemplate);
        this._saveTemplates();

        if (this.activeTemplateId === id && this.onTemplateChange) {
            this.onTemplateChange(updatedTemplate);
        }

        return true;
    }

    updateTemplateData(id, data) {
        return this.updateTemplate(id, { data });
    }

    deleteTemplate(id) {
        if (!this.templates.has(id)) return false;

        this.templates.delete(id);
        this._saveTemplates();

        if (this.activeTemplateId === id) {
            this.activeTemplateId = this.templates.size > 0
                ? this.templates.keys().next().value
                : null;

            if (this.onTemplateChange) {
                this.onTemplateChange(this.getActiveTemplate());
            }
        }

        return true;
    }

    duplicateTemplate(id, newName) {
        const template = this.templates.get(id);
        if (!template) return null;

        return this.createTemplate({
            name: newName || `${template.name} (副本)`,
            description: template.description,
            data: JSON.parse(JSON.stringify(template.data)),
            metadata: JSON.parse(JSON.stringify(template.metadata))
        });
    }

    getAllTemplates() {
        const result = [];
        this.templates.forEach((template) => {
            result.push(template);
        });
        return result.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    exportTemplate(id) {
        const template = this.templates.get(id);
        if (!template) return null;

        return JSON.stringify({
            version: '1.0',
            exportedAt: Date.now(),
            template: {
                name: template.name,
                description: template.description,
                data: template.data,
                metadata: template.metadata
            }
        }, null, 2);
    }

    importTemplate(jsonString) {
        try {
            const imported = JSON.parse(jsonString);

            if (!imported.template || !imported.template.data) {
                throw new Error('Invalid template format');
            }

            return this.createTemplate({
                name: imported.template.name || '导入的模板',
                description: imported.template.description || '',
                data: imported.template.data,
                metadata: imported.template.metadata || {}
            });
        } catch (error) {
            console.error('TemplateManager: Import failed', error);
            return null;
        }
    }

    exportAllTemplates() {
        const exportData = {
            version: '1.0',
            exportedAt: Date.now(),
            templates: []
        };

        this.templates.forEach((template) => {
            exportData.templates.push({
                id: template.id,
                name: template.name,
                description: template.description,
                data: template.data,
                metadata: template.metadata
            });
        });

        return JSON.stringify(exportData, null, 2);
    }

    importAllTemplates(jsonString, merge = true) {
        try {
            const imported = JSON.parse(jsonString);

            if (!imported.templates || !Array.isArray(imported.templates)) {
                throw new Error('Invalid templates format');
            }

            if (!merge) {
                this.templates.clear();
            }

            let importedCount = 0;
            for (const templateData of imported.templates) {
                if (templateData.data) {
                    this.createTemplate({
                        id: merge ? undefined : templateData.id,
                        name: templateData.name,
                        description: templateData.description,
                        data: templateData.data,
                        metadata: templateData.metadata
                    });
                    importedCount++;
                }
            }

            this._saveTemplates();
            return importedCount;
        } catch (error) {
            console.error('TemplateManager: Import all failed', error);
            return 0;
        }
    }

    async syncToWorldBook(templateId, worldBookData) {
        const template = this.templates.get(templateId);
        if (!template) return false;

        template.data = {
            ...template.data,
            worldBook: worldBookData
        };
        template.updatedAt = Date.now();

        this._saveTemplates();
        return true;
    }

    getTemplateCount() {
        return this.templates.size;
    }

    searchTemplates(query) {
        const lowerQuery = query.toLowerCase();
        const results = [];

        this.templates.forEach((template) => {
            if (
                template.name.toLowerCase().includes(lowerQuery) ||
                template.description.toLowerCase().includes(lowerQuery)
            ) {
                results.push(template);
            }
        });

        return results.sort((a, b) => b.updatedAt - a.updatedAt);
    }
}

export const templateManager = TemplateManager.getInstance();
