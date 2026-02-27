import { Core } from '../core.js';
import { storage } from '../managers/StorageManager.js';

const STORAGE_KEY = 'stk_ai_instructions';
const PRESETS_KEY = 'stk_ai_instruction_presets';

const DEFAULT_SEGMENTS = [
    { id: 'system', role: 'system', name: '系统指令', content: '你是一个有用的AI助手。', deletable: false, order: 0 },
    { id: 'main', role: 'user', name: '主要提示', content: '', deletable: false, order: 1 }
];

let _presets = null;
let _activePresetId = null;

function ensureId() {
    return 'seg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function getDefaultSegments() {
    return JSON.parse(JSON.stringify(DEFAULT_SEGMENTS));
}

function loadPresets() {
    if (_presets !== null) return _presets;
    try {
        const data = storage.get(PRESETS_KEY);
        if (data && Array.isArray(data.presets)) {
            _presets = data.presets;
            _activePresetId = data.activeId || null;
        } else {
            _presets = [];
            _activePresetId = null;
        }
    } catch (e) {
        console.error('[AIInstructions] 加载预设失败:', e);
        _presets = [];
        _activePresetId = null;
    }
    return _presets;
}

function savePresets() {
    storage.set(PRESETS_KEY, { presets: _presets, activeId: _activePresetId });
}

function getActivePreset() {
    loadPresets();
    if (!_activePresetId && _presets.length > 0) {
        return _presets[0];
    }
    return _presets.find(p => p.id === _activePresetId) || null;
}

function setActivePreset(id) {
    loadPresets();
    if (_presets.find(p => p.id === id)) {
        _activePresetId = id;
        savePresets();
        return true;
    }
    return false;
}

function createPreset(name, segments = null) {
    loadPresets();
    const preset = {
        id: 'preset_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: name || '新预设',
        segments: segments || getDefaultSegments(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    _presets.push(preset);
    if (!_activePresetId) _activePresetId = preset.id;
    savePresets();
    return preset;
}

function updatePreset(id, updates) {
    loadPresets();
    const idx = _presets.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const preset = _presets[idx];
    if (updates.name !== undefined) preset.name = updates.name;
    if (updates.segments !== undefined) preset.segments = updates.segments;
    preset.updatedAt = new Date().toISOString();
    _presets[idx] = preset;
    savePresets();
    return preset;
}

function deletePreset(id) {
    loadPresets();
    const idx = _presets.findIndex(p => p.id === id);
    if (idx === -1) return false;
    _presets.splice(idx, 1);
    if (_activePresetId === id) {
        _activePresetId = _presets.length > 0 ? _presets[0].id : null;
    }
    savePresets();
    return true;
}

function duplicatePreset(id) {
    loadPresets();
    const original = _presets.find(p => p.id === id);
    if (!original) return null;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = 'preset_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    copy.name = original.name + ' (副本)';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    copy.segments.forEach(s => { s.id = ensureId(); });
    _presets.push(copy);
    savePresets();
    return copy;
}

function exportPresets(presetIds = null) {
    loadPresets();
    const toExport = presetIds ? _presets.filter(p => presetIds.includes(p.id)) : _presets;
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        presets: toExport
    };
}

function importPresets(data, options = { merge: true, overwrite: false }) {
    loadPresets();
    if (!data || !data.presets || !Array.isArray(data.presets)) {
        return { success: false, imported: 0, skipped: 0, error: '无效的数据格式' };
    }
    let imported = 0;
    let skipped = 0;
    for (const p of data.presets) {
        if (!p.name || !Array.isArray(p.segments)) {
            skipped++;
            continue;
        }
        const existing = _presets.find(x => x.name === p.name);
        if (existing) {
            if (options.overwrite) {
                existing.segments = p.segments;
                existing.updatedAt = new Date().toISOString();
                imported++;
            } else {
                skipped++;
            }
        } else {
            const newPreset = {
                ...p,
                id: 'preset_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                createdAt: p.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            newPreset.segments = newPreset.segments.map(s => ({ ...s, id: ensureId() }));
            _presets.push(newPreset);
            imported++;
        }
    }
    if (!_activePresetId && _presets.length > 0) {
        _activePresetId = _presets[0].id;
    }
    savePresets();
    return { success: true, imported, skipped };
}

function exportToJSON(presetIds = null) {
    const data = exportPresets(presetIds);
    return JSON.stringify(data, null, 2);
}

function downloadPresets(presetIds = null, filename = 'ai-instructions.json') {
    const json = exportToJSON(presetIds);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function uploadPresets(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const result = importPresets(data, { merge: true, overwrite: false });
                resolve(result);
            } catch (err) {
                resolve({ success: false, imported: 0, skipped: 0, error: 'JSON解析失败: ' + err.message });
            }
        };
        reader.onerror = () => resolve({ success: false, imported: 0, skipped: 0, error: '文件读取失败' });
        reader.readAsText(file);
    });
}

function addSegment(presetId, segment) {
    const preset = _presets.find(p => p.id === presetId);
    if (!preset) return null;
    const newSeg = {
        id: ensureId(),
        role: segment.role || 'user',
        name: segment.name || '新段落',
        content: segment.content || '',
        deletable: segment.deletable !== false,
        order: preset.segments.length
    };
    preset.segments.push(newSeg);
    preset.updatedAt = new Date().toISOString();
    savePresets();
    return newSeg;
}

function updateSegment(presetId, segmentId, updates) {
    const preset = _presets.find(p => p.id === presetId);
    if (!preset) return null;
    const seg = preset.segments.find(s => s.id === segmentId);
    if (!seg) return null;
    if (updates.role !== undefined) seg.role = updates.role;
    if (updates.name !== undefined) seg.name = updates.name;
    if (updates.content !== undefined) seg.content = updates.content;
    if (updates.order !== undefined) seg.order = updates.order;
    preset.updatedAt = new Date().toISOString();
    savePresets();
    return seg;
}

function deleteSegment(presetId, segmentId) {
    const preset = _presets.find(p => p.id === presetId);
    if (!preset) return false;
    const idx = preset.segments.findIndex(s => s.id === segmentId);
    if (idx === -1) return false;
    if (preset.segments[idx].deletable === false) return false;
    preset.segments.splice(idx, 1);
    preset.segments.forEach((s, i) => { s.order = i; });
    preset.updatedAt = new Date().toISOString();
    savePresets();
    return true;
}

function reorderSegments(presetId, segmentIds) {
    const preset = _presets.find(p => p.id === presetId);
    if (!preset) return false;
    const reordered = [];
    segmentIds.forEach((id, i) => {
        const seg = preset.segments.find(s => s.id === id);
        if (seg) {
            seg.order = i;
            reordered.push(seg);
        }
    });
    preset.segments = reordered;
    preset.updatedAt = new Date().toISOString();
    savePresets();
    return true;
}

function buildPrompt(presetId = null) {
    const preset = presetId ? _presets.find(p => p.id === presetId) : getActivePreset();
    if (!preset) return '';
    return preset.segments
        .sort((a, b) => a.order - b.order)
        .map(s => s.content)
        .filter(c => c && c.trim())
        .join('\n\n');
}

function buildMessages(presetId = null) {
    const preset = presetId ? _presets.find(p => p.id === presetId) : getActivePreset();
    if (!preset) return [];
    return preset.segments
        .sort((a, b) => a.order - b.order)
        .filter(s => s.content && s.content.trim())
        .map(s => ({ role: s.role, content: s.content }));
}

const AIInstructionsManager = {
    get presets() { return loadPresets(); },
    get activePreset() { return getActivePreset(); },
    get activePresetId() { return _activePresetId; },
    setActivePreset,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    exportPresets,
    importPresets,
    exportToJSON,
    downloadPresets,
    uploadPresets,
    addSegment,
    updateSegment,
    deleteSegment,
    reorderSegments,
    buildPrompt,
    buildMessages,
    getDefaultSegments
};

class AIInstructionsModule {
    constructor() {
        this.id = 'aiInstructions';
        this.name = 'AI 指令预设';
        this.description = '管理和构建AI系统指令，支持动态段落、预设导入导出';
        this.defaultSettings = {
            enabled: false,
            autoApply: true,
            defaultPresetId: null
        };
    }

    async init() {
        loadPresets();
        if (_presets.length === 0) {
            createPreset('默认预设', getDefaultSegments());
        }
    }

    renderUI($container, settings) {
        const presets = loadPresets();
        const activePreset = getActivePreset();

        const html = `
            <div class="stk-ai-inst-container">
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>预设管理</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px;margin-bottom:8px">
                            <select id="stk_ai_preset_select" class="text_pole" style="flex:1">
                                ${presets.map(p => `<option value="${p.id}"${p.id === _activePresetId ? ' selected' : ''}>${_.escape(p.name)}</option>`).join('')}
                            </select>
                            <div class="stk-btn primary" id="stk_ai_preset_new">+ 新建</div>
                            <div class="stk-btn" id="stk_ai_preset_dup">复制</div>
                            <div class="stk-btn" id="stk_ai_preset_del" style="color:#ff6b6b">删除</div>
                        </div>
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_ai_preset_import">导入</div>
                            <div class="stk-btn" id="stk_ai_preset_export">导出当前</div>
                            <div class="stk-btn" id="stk_ai_preset_export_all">导出全部</div>
                        </div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>段落编辑 - ${activePreset ? _.escape(activePreset.name) : '无预设'}</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_ai_segments_container">
                        ${this._renderSegments(activePreset)}
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>预览</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <textarea id="stk_ai_preview" class="text_pole" rows="6" readonly style="font-size:12px;resize:vertical">${_.escape(buildPrompt())}</textarea>
                    </div>
                </div>
            </div>
        `;
        $container.html(html);
    }

    _renderSegments(preset) {
        if (!preset || !preset.segments || preset.segments.length === 0) {
            return '<div style="text-align:center;color:var(--stk-text-3);padding:20px">无段落，点击下方添加</div>';
        }
        const sorted = [...preset.segments].sort((a, b) => a.order - b.order);
        return sorted.map((seg, idx) => `
            <div class="stk-segment-item" data-id="${seg.id}" style="background:rgba(0,0,0,0.15);border-radius:6px;padding:10px;margin:6px 0">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="color:var(--stk-text-3);font-size:11px">#${idx + 1}</span>
                        <input type="text" class="text_pole stk-seg-name" value="${_.escape(seg.name)}" style="width:120px;font-size:12px" />
                        <select class="text_pole stk-seg-role" style="width:80px;font-size:12px">
                            <option value="system" ${seg.role === 'system' ? 'selected' : ''}>system</option>
                            <option value="user" ${seg.role === 'user' ? 'selected' : ''}>user</option>
                            <option value="assistant" ${seg.role === 'assistant' ? 'selected' : ''}>assistant</option>
                        </select>
                    </div>
                    <div style="display:flex;gap:4px">
                        ${seg.deletable ? `<div class="stk-btn stk-seg-del" data-id="${seg.id}" style="padding:2px 6px;font-size:10px;color:#ff6b6b">删除</div>` : ''}
                    </div>
                </div>
                <textarea class="text_pole stk-seg-content" rows="3" style="font-size:12px;resize:vertical">${_.escape(seg.content)}</textarea>
            </div>
        `).join('') + `
            <div class="stk-btn" id="stk_ai_add_segment" style="width:100%;margin-top:8px">+ 添加段落</div>
        `;
    }

    bindUI(settings, save) {
        $(document).on('change', '#stk_ai_preset_select', (e) => {
            setActivePreset(e.target.value);
            this._refreshSegments();
        });

        $(document).on('click', '#stk_ai_preset_new', () => {
            const name = prompt('预设名称：', '新预设');
            if (name) {
                createPreset(name, getDefaultSegments());
                this._refreshPresetList();
                toastr.success('已创建预设', 'AI指令');
            }
        });

        $(document).on('click', '#stk_ai_preset_dup', () => {
            if (!_activePresetId) {
                toastr.warning('请先选择一个预设', 'AI指令');
                return;
            }
            const copy = duplicatePreset(_activePresetId);
            if (copy) {
                this._refreshPresetList();
                toastr.success('已复制预设', 'AI指令');
            }
        });

        $(document).on('click', '#stk_ai_preset_del', () => {
            if (!_activePresetId) return;
            if (presets.length <= 1) {
                toastr.warning('至少保留一个预设', 'AI指令');
                return;
            }
            if (confirm('确定删除当前预设？')) {
                deletePreset(_activePresetId);
                this._refreshPresetList();
                toastr.success('已删除预设', 'AI指令');
            }
        });

        $(document).on('click', '#stk_ai_preset_import', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const result = await uploadPresets(file);
                if (result.success) {
                    toastr.success(`导入成功：${result.imported} 个预设`, 'AI指令');
                    if (result.skipped > 0) toastr.warning(`跳过 ${result.skipped} 个`, 'AI指令');
                    this._refreshPresetList();
                } else {
                    toastr.error(result.error || '导入失败', 'AI指令');
                }
            };
            input.click();
        });

        $(document).on('click', '#stk_ai_preset_export', () => {
            if (!_activePresetId) {
                toastr.warning('请先选择预设', 'AI指令');
                return;
            }
            const preset = _presets.find(p => p.id === _activePresetId);
            downloadPresets([_activePresetId], `ai-instruction-${preset?.name || 'export'}.json`);
            toastr.success('已导出预设', 'AI指令');
        });

        $(document).on('click', '#stk_ai_preset_export_all', () => {
            if (_presets.length === 0) {
                toastr.warning('没有可导出的预设', 'AI指令');
                return;
            }
            downloadPresets();
            toastr.success('已导出全部预设', 'AI指令');
        });

        $(document).on('click', '#stk_ai_add_segment', () => {
            if (!_activePresetId) {
                toastr.warning('请先选择预设', 'AI指令');
                return;
            }
            addSegment(_activePresetId, { role: 'user', name: '新段落', content: '' });
            this._refreshSegments();
        });

        $(document).on('click', '.stk-seg-del', (e) => {
            const segId = $(e.currentTarget).data('id');
            if (deleteSegment(_activePresetId, segId)) {
                this._refreshSegments();
                toastr.success('已删除段落', 'AI指令');
            }
        });

        $(document).on('input', '.stk-seg-name', (e) => {
            const $item = $(e.currentTarget).closest('.stk-segment-item');
            const segId = $item.data('id');
            updateSegment(_activePresetId, segId, { name: e.target.value });
            this._updatePreview();
        });

        $(document).on('change', '.stk-seg-role', (e) => {
            const $item = $(e.currentTarget).closest('.stk-segment-item');
            const segId = $item.data('id');
            updateSegment(_activePresetId, segId, { role: e.target.value });
            this._updatePreview();
        });

        $(document).on('input', '.stk-seg-content', (e) => {
            const $item = $(e.currentTarget).closest('.stk-segment-item');
            const segId = $item.data('id');
            updateSegment(_activePresetId, segId, { content: e.target.value });
            this._updatePreview();
        });
    }

    _refreshPresetList() {
        const presets = loadPresets();
        const $select = $('#stk_ai_preset_select');
        if ($select.length) {
            $select.empty().append(presets.map(p => 
                `<option value="${p.id}"${p.id === _activePresetId ? ' selected' : ''}>${_.escape(p.name)}</option>`
            ).join(''));
        }
        this._refreshSegments();
    }

    _refreshSegments() {
        const $container = $('#stk_ai_segments_container');
        if ($container.length) {
            const preset = getActivePreset();
            $container.html(this._renderSegments(preset));
            const $header = $container.closest('.stk-section').find('.stk-section-header span:first');
            if ($header.length) $header.text('段落编辑 - ' + (preset ? preset.name : '无预设'));
        }
        this._updatePreview();
    }

    _updatePreview() {
        const $preview = $('#stk_ai_preview');
        if ($preview.length) {
            $preview.val(buildPrompt());
        }
    }
}

const aiInstructionsModule = new AIInstructionsModule();
export { aiInstructionsModule, AIInstructionsManager };
