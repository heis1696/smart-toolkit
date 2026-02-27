import { Core } from '../core.js';
import { RegexExtractor } from '../utils/RegexExtractor.js';

let _sharedExtractor = null;

const DEFAULT_SHARED_PATTERNS = [
    { name: 'StatusBlock', source: '<StatusBlock>[\\s\\S]*?</StatusBlock>' },
    { name: 'auxiliary_tool', source: '<auxiliary_tool>[\\s\\S]*?</auxiliary_tool>' },
    { name: 'UpdateVariable', source: '<UpdateVariable>[\\s\\S]*?</UpdateVariable>' },
    { name: 'StatusPlaceHolderImpl', source: '<StatusPlaceHolderImpl/>' },
    { name: 'StatusBarPlaceholder', source: '<StatusBarPlaceholder/>' }
];

const DEFAULT_CLEANUP_PATTERNS = [
    '<StatusBlock>[\\s\\S]*?</StatusBlock>',
    '<auxiliary_tool>[\\s\\S]*?</auxiliary_tool>',
    '<UpdateVariable>[\\s\\S]*?</UpdateVariable>',
    '<StatusPlaceHolderImpl/>',
    '<StatusBarPlaceholder/>'
];

export const RegexConfigModule = {
    id: 'regexConfig',
    name: '正则提取配置',

    defaultSettings: {
        enabled: true,
        sharedPatterns: [...DEFAULT_SHARED_PATTERNS],
        defaultCleanupPatterns: [...DEFAULT_CLEANUP_PATTERNS]
    },

    getSharedExtractor() {
        if (!_sharedExtractor) {
            const settings = Core.getModuleSettings(this.id, this.defaultSettings);
            _sharedExtractor = new RegexExtractor();
            
            for (const p of settings.sharedPatterns) {
                _sharedExtractor.addPattern(p.name, p.source);
            }
            
            for (const p of settings.defaultCleanupPatterns) {
                _sharedExtractor.addCleanupPattern(p);
            }
        }
        return _sharedExtractor;
    },

    refreshSharedExtractor() {
        _sharedExtractor = null;
        return this.getSharedExtractor();
    },

    createExtractor(config = {}) {
        const extractor = new RegexExtractor();
        
        if (config.patterns) {
            for (const p of config.patterns) {
                extractor.addPattern(p.name, p.source);
            }
        }
        
        if (config.cleanupPatterns) {
            for (const p of config.cleanupPatterns) {
                extractor.addCleanupPattern(p);
            }
        }
        
        return extractor;
    },

    renderUI(settings) {
        const patternsHtml = (settings.sharedPatterns || []).map((p, i) => `
            <div class="stk-regex-pattern-row" data-index="${i}">
                <input type="text" class="text_pole stk-regex-name" value="${_.escape(p.name)}" placeholder="名称" style="width:120px" />
                <input type="text" class="text_pole stk-regex-source" value="${_.escape(p.source)}" placeholder="正则表达式" style="flex:1" />
                <button class="stk-btn stk-regex-remove" data-index="${i}">-</button>
            </div>
        `).join('');

        const cleanupHtml = (settings.defaultCleanupPatterns || []).map((p, i) => `
            <div class="stk-regex-cleanup-row" data-index="${i}">
                <input type="text" class="text_pole stk-regex-cleanup-source" value="${_.escape(p)}" placeholder="清理正则" style="flex:1" />
                <button class="stk-btn stk-regex-cleanup-remove" data-index="${i}">-</button>
            </div>
        `).join('');

        return `
            <div class="stk-section">
                <div class="stk-section-title">共享提取模式</div>
                <div class="stk-section-body">
                    <div class="stk-regex-patterns-container">
                        ${patternsHtml}
                    </div>
                    <div class="stk-btn stk-regex-add-pattern" style="margin-top:8px">+ 添加模式</div>
                </div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">默认清理模式</div>
                <div class="stk-section-body">
                    <div class="stk-regex-cleanup-container">
                        ${cleanupHtml}
                    </div>
                    <div class="stk-btn stk-regex-add-cleanup" style="margin-top:8px">+ 添加清理</div>
                </div>
            </div>
            <div class="stk-section">
                <div class="stk-section-title">操作</div>
                <div class="stk-section-body">
                    <div class="stk-row" style="gap:8px">
                        <div class="stk-btn" id="stk_regex_reset">重置为默认</div>
                        <div class="stk-btn" id="stk_regex_export">导出配置</div>
                        <div class="stk-btn" id="stk_regex_import">导入配置</div>
                    </div>
                </div>
            </div>
        `;
    },

    bindUI(settings, save) {
        const $container = $('#stk_module_settings_regexConfig');

        $container.on('click', '.stk-regex-add-pattern', () => {
            settings.sharedPatterns.push({ name: '', source: '' });
            $container.html(this.renderUI(settings));
            this.bindUI(settings, save);
            save();
        });

        $container.on('click', '.stk-regex-remove', function() {
            const idx = parseInt($(this).data('index'));
            if (!isNaN(idx) && idx >= 0 && idx < settings.sharedPatterns.length) {
                settings.sharedPatterns.splice(idx, 1);
                $container.html(this.renderUI(settings));
                this.bindUI(settings, save);
                save();
            }
        });

        $container.on('click', '.stk-regex-add-cleanup', () => {
            settings.defaultCleanupPatterns.push('');
            $container.html(this.renderUI(settings));
            this.bindUI(settings, save);
            save();
        });

        $container.on('click', '.stk-regex-cleanup-remove', function() {
            const idx = parseInt($(this).data('index'));
            if (!isNaN(idx) && idx >= 0 && idx < settings.defaultCleanupPatterns.length) {
                settings.defaultCleanupPatterns.splice(idx, 1);
                $container.html(this.renderUI(settings));
                this.bindUI(settings, save);
                save();
            }
        });

        $container.on('input', '.stk-regex-name', function() {
            const idx = parseInt($(this).closest('.stk-regex-pattern-row').data('index'));
            if (!isNaN(idx)) {
                settings.sharedPatterns[idx].name = $(this).val();
                save();
            }
        });

        $container.on('input', '.stk-regex-source', function() {
            const idx = parseInt($(this).closest('.stk-regex-pattern-row').data('index'));
            if (!isNaN(idx)) {
                settings.sharedPatterns[idx].source = $(this).val();
                save();
            }
        });

        $container.on('input', '.stk-regex-cleanup-source', function() {
            const idx = parseInt($(this).closest('.stk-regex-cleanup-row').data('index'));
            if (!isNaN(idx)) {
                settings.defaultCleanupPatterns[idx] = $(this).val();
                save();
            }
        });

        $container.on('click', '#stk_regex_reset', () => {
            settings.sharedPatterns = [...DEFAULT_SHARED_PATTERNS];
            settings.defaultCleanupPatterns = [...DEFAULT_CLEANUP_PATTERNS];
            $container.html(this.renderUI(settings));
            this.bindUI(settings, save);
            this.refreshSharedExtractor();
            save();
            toastr.success('已重置为默认配置', '正则配置');
        });

        $container.on('click', '#stk_regex_export', () => {
            const config = {
                sharedPatterns: settings.sharedPatterns,
                defaultCleanupPatterns: settings.defaultCleanupPatterns
            };
            const jsonStr = JSON.stringify(config, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'regex-config.json';
            a.click();
            URL.revokeObjectURL(url);
            toastr.success('配置已导出', '正则配置');
        });

        $container.on('click', '#stk_regex_import', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const config = JSON.parse(text);
                    if (config.sharedPatterns) settings.sharedPatterns = config.sharedPatterns;
                    if (config.defaultCleanupPatterns) settings.defaultCleanupPatterns = config.defaultCleanupPatterns;
                    $container.html(this.renderUI(settings));
                    this.bindUI(settings, save);
                    this.refreshSharedExtractor();
                    save();
                    toastr.success('配置已导入', '正则配置');
                } catch (err) {
                    toastr.error('导入失败: ' + err.message, '正则配置');
                }
            };
            input.click();
        });

        const origSave = save;
        save = () => {
            origSave();
            this.refreshSharedExtractor();
        };
    },

    async init() {
        this.getSharedExtractor();
    }
};
