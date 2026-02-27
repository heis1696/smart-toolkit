// @ts-nocheck
import { Core } from './core.js';
import { apiPresetManager } from './managers/index.js';
import { AIInstructionsManager } from './modules/aiInstructions.js';
import { WorldbookConfigManager } from './modules/worldbookConfig.js';

const SHARED_DEFAULTS = {
    use_preset: false,
    api_url: '',
    api_key: '',
    model_name: '',
    max_tokens: 2048,
    temperature: 0.7,
    stream: false,
};

const CSS = `
<style id="stk-styles">
:root {
  --stk-bg: var(--SmartThemeBlurTintColor, #1a1a2e);
  --stk-border: var(--SmartThemeBorderColor, rgba(255,255,255,0.1));
  --stk-text: var(--SmartThemeBodyColor, #e0e0e0);
  --stk-text-2: rgba(255,255,255,0.7);
  --stk-text-3: rgba(255,255,255,0.5);
  --stk-accent: linear-gradient(135deg, rgba(123, 183, 255, 0.22), rgba(155, 123, 255, 0.14));
  --stk-accent-solid: #7bb7ff;
  --stk-radius: 8px;
  --stk-radius-lg: 12px;
}

#stk-window {
  position: fixed;
  background: var(--stk-bg);
  border: 1px solid var(--stk-border);
  border-radius: var(--stk-radius-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
  z-index: 31000;
  display: none;
  flex-direction: column;
  overflow: hidden;
  min-width: 400px;
  min-height: 300px;
}
#stk-window.open { display: flex; }
#stk-window.maximized {
  top: 0 !important; left: 0 !important;
  width: 100vw !important; height: 100vh !important;
  border-radius: 0;
}

#stk-window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--stk-border);
  cursor: move;
  user-select: none;
  background: var(--stk-accent);
  flex-shrink: 0;
}
#stk-window-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--stk-text);
}
#stk-window-title i { color: var(--stk-accent-solid); }
#stk-window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stk-window-btn {
  width: 28px; height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.7;
  transition: all 0.15s;
  color: var(--stk-text);
}
.stk-window-btn:hover { opacity: 1; background: rgba(255,255,255,0.1); }
.stk-window-btn.close:hover { background: rgba(255,100,100,0.3); }

#stk-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

#stk-nav {
  width: 180px;
  background: rgba(0,0,0,0.15);
  border-right: 1px solid var(--stk-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
}
.stk-nav-section {
  padding: 8px 0;
  border-bottom: 1px solid var(--stk-border);
}
.stk-nav-section:last-child { border-bottom: none; }
.stk-nav-title {
  padding: 6px 14px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--stk-text-3);
}
.stk-nav-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--stk-text-2);
  transition: all 0.15s;
  border-left: 3px solid transparent;
}
.stk-nav-btn:hover { background: rgba(255,255,255,0.05); color: var(--stk-text); }
.stk-nav-btn.active {
  background: var(--stk-accent);
  color: var(--stk-text);
  border-left-color: var(--stk-accent-solid);
}
.stk-nav-btn i { width: 16px; text-align: center; }

#stk-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.stk-tab { display: none; }
.stk-tab.active { display: block; }

.stk-section {
  border: 1px solid var(--stk-border);
  border-radius: var(--stk-radius);
  overflow: hidden;
  margin-bottom: 12px;
}
.stk-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  font-size: 13px;
  color: var(--stk-text);
  background: rgba(255,255,255,0.03);
}
.stk-section-header:hover { background: rgba(255,255,255,0.06); }
.stk-section-header .stk-arrow { transition: transform 0.2s; font-size: 11px; }
.stk-section-header.collapsed .stk-arrow { transform: rotate(-90deg); }
.stk-section-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--stk-border);
}
.stk-section-body.stk-hidden { display: none; }

.stk-row { display: flex; align-items: center; gap: 8px; }
.stk-row label {
  font-size: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--stk-text);
}
.stk-row label > span { font-size: 11px; opacity: 0.7; }
.stk-row .text_pole {
  font-size: 12px;
  padding: 6px 10px;
  background: rgba(0,0,0,0.2);
  border: 1px solid var(--stk-border);
  border-radius: 6px;
  color: var(--stk-text);
}
.stk-row .text_pole:focus { outline: none; border-color: var(--stk-accent-solid); }
.stk-row select.text_pole { padding: 5px 8px; }
.stk-row textarea.text_pole { font-family: monospace; font-size: 11px; resize: vertical; min-height: 80px; }

.stk-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--stk-text); }
.stk-toggle input[type=checkbox] { margin: 0; width: 16px; height: 16px; }

.stk-btn {
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  border: 1px solid var(--stk-border);
  background: rgba(255,255,255,0.05);
  color: var(--stk-text);
  transition: all 0.15s;
}
.stk-btn:hover { background: rgba(255,255,255,0.1); }
.stk-btn.primary { background: var(--stk-accent); border-color: transparent; }
.stk-btn.primary:hover { filter: brightness(1.1); }

.stk-sub-section {
  border: 1px dashed var(--stk-border);
  border-radius: 6px;
  overflow: hidden;
  margin-top: 4px;
}
.stk-sub-header {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--stk-text-2);
}
.stk-sub-header:hover { background: rgba(255,255,255,0.03); }
.stk-sub-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--stk-border);
}
.stk-sub-body.stk-hidden { display: none; }

.stk-resize-handle {
  position: absolute;
  background: transparent;
}
.stk-resize-handle.se {
  right: 0; bottom: 0;
  width: 16px; height: 16px;
  cursor: se-resize;
}
.stk-resize-handle.e { right: 0; top: 50px; width: 6px; height: calc(100% - 100px); cursor: e-resize; }
.stk-resize-handle.s { bottom: 0; left: 50px; width: calc(100% - 100px); height: 6px; cursor: s-resize; }
.stk-resize-handle.w { left: 0; top: 50px; width: 6px; height: calc(100% - 100px); cursor: w-resize; }
.stk-resize-handle.n { top: 0; left: 50px; width: calc(100% - 100px); height: 6px; cursor: n-resize; }

#stk-plot-options {
  position: fixed;
  bottom: 80px;
  right: 20px;
  width: 340px;
  background: var(--stk-bg);
  border: 1px solid var(--stk-border);
  border-radius: var(--stk-radius-lg);
  z-index: 31001;
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
  overflow: hidden;
}
.stk-po-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid var(--stk-border);
  cursor: move;
  user-select: none;
}
#stk-po-close { cursor: pointer; padding: 4px; opacity: 0.7; }
#stk-po-close:hover { opacity: 1; }
.stk-po-item {
  padding: 10px 14px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid var(--stk-border);
  transition: background 0.15s;
  color: var(--stk-text);
}
.stk-po-item:hover { background: rgba(255,255,255,0.05); }
.stk-po-item:last-child { border-bottom: none; }

@media (max-width: 1100px) {
  #stk-nav { width: 50px; }
  .stk-nav-title { display: none; }
  .stk-nav-btn { justify-content: center; padding: 12px 0; }
  .stk-nav-btn span { display: none; }
}
@media (max-width: 768px) {
  #stk-window { width: 100vw !important; height: 100vh !important; top: 0 !important; left: 0 !important; border-radius: 0; }
  #stk-nav { width: 50px; }
}
</style>`;

let windowState = {
    x: 100, y: 80,
    width: 900, height: 650,
    activeTab: 'modules',
    maximized: false
};

function loadWindowState() {
    try {
        const saved = localStorage.getItem('stk-window-state');
        if (saved) {
            const parsed = JSON.parse(saved);
            windowState = { ...windowState, ...parsed };
        }
    } catch (e) {}
}

function saveWindowState() {
    localStorage.setItem('stk-window-state', JSON.stringify(windowState));
}

export const UI = {
    getSharedAPI() {
        const s = Core.getSettings();
        if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
        const sh = s._shared;
        return {
            use_preset: sh.use_preset, url: sh.api_url, key: sh.api_key,
            model: sh.model_name, max_tokens: sh.max_tokens,
            temperature: sh.temperature, stream: sh.stream,
        };
    },

    toggle() {
        const $win = $('#stk-window');
        if ($win.length) {
            $win.toggleClass('open');
            if ($win.hasClass('open')) this._bringToFront();
        }
    },

    show() {
        const $win = $('#stk-window');
        if ($win.length) {
            $win.addClass('open');
            this._bringToFront();
        }
    },

    hide() {
        $('#stk-window').removeClass('open');
    },

    _bringToFront() {
        const maxZ = Math.max(31000, ...$('body > *').map(function() {
            const z = parseInt($(this).css('z-index')) || 0;
            return z;
        }).get());
        $('#stk-window').css('z-index', maxZ + 1);
    },

    _registerExtensionMenu() {
        if (typeof addAutoCardMenuItem_ACU === 'function') {
            addAutoCardMenuItem_ACU(
                'Smart Toolkit',
                'fa-solid fa-toolbox',
                () => this.toggle()
            );
            return;
        }

        const tryRegister = () => {
            const $menu = $('#extensionsMenu');
            if ($menu.length) {
                const $item = $(`
                    <div class="list-group-item flex-container flexGap5 interactable" id="stk-menu-item">
                        <span class="fa-solid fa-toolbox extensionsMenuButtonIcon"></span>
                        <span>Smart Toolkit</span>
                    </div>
                `);
                $item.on('click', () => this.toggle());
                $menu.append($item);
            }
        };

        if (typeof eventSource !== 'undefined' && eventSource.on) {
            eventSource.on('extensions_loaded', tryRegister);
        }
        setTimeout(tryRegister, 1000);
    },

    render(modules) {
        const s = Core.getSettings();
        if (!s._shared) s._shared = { ...SHARED_DEFAULTS };
        const sh = s._shared;

        loadWindowState();
        $('head').append(CSS);
        this._registerExtensionMenu();

        const moduleOverviewHtml = modules.map(m => {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            return `
            <div class="stk-row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">
                <div class="stk-toggle">
                    <input type="checkbox" id="stk_mod_${m.id}_enabled" ${ms.enabled ? 'checked' : ''} />
                    <span style="font-weight:500">${m.name}</span>
                </div>
                ${m.defaultSettings.update_mode !== undefined ? `
                <select id="stk_mod_${m.id}_mode" class="text_pole" style="width:auto;font-size:11px;padding:2px 4px;">
                    <option value="inline"${ms.update_mode === 'inline' ? ' selected' : ''}>随AI输出</option>
                    <option value="extra_model"${ms.update_mode === 'extra_model' ? ' selected' : ''}>额外模型</option>
                </select>` : ''}
            </div>`;
        }).join('');

        const moduleSettingsHtml = modules.map(m => {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            return `
            <div class="stk-section" id="stk_module_${m.id}">
                <div class="stk-section-header interactable collapsed" tabindex="0">
                    <span>${m.name} 设置</span>
                    <span class="stk-arrow fa-solid fa-chevron-down"></span>
                </div>
                <div class="stk-section-body stk-hidden">
                    ${m.renderUI(ms)}
                </div>
            </div>`;
        }).join('');

        const promptsHtml = modules.map(m => {
            if (!m.templatePrompts) return '';
            return Object.entries(m.templatePrompts).map(([key, def]) => `
                <div class="stk-sub-section">
                    <div class="stk-sub-header interactable" tabindex="0">
                        <span class="stk-arrow fa-solid fa-chevron-down" style="font-size:10px"></span>
                        ${m.name} - ${key}
                    </div>
                    <div class="stk-sub-body stk-hidden">
                        <textarea id="stk_prompt_${key}" class="text_pole" rows="8" style="font-family:monospace;font-size:11px;white-space:pre;resize:vertical">${_.escape(def)}</textarea>
                        <div class="stk-btn interactable stk_prompt_save" data-key="${key}" style="align-self:flex-end" tabindex="0">保存到世界书</div>
                    </div>
                </div>
            `).join('');
        }).join('');

        const navHtml = `
            <div class="stk-nav-section">
                <div class="stk-nav-title">核心</div>
                <div class="stk-nav-btn active" data-tab="modules"><i class="fa-solid fa-puzzle-piece"></i><span>模块管理</span></div>
                <div class="stk-nav-btn" data-tab="api"><i class="fa-solid fa-plug"></i><span>API 配置</span></div>
                <div class="stk-nav-btn" data-tab="api_presets"><i class="fa-solid fa-database"></i><span>API 预设管理</span></div>
                <div class="stk-nav-btn" data-tab="ai_instructions"><i class="fa-solid fa-wand-magic-sparkles"></i><span>AI 指令预设</span></div>
                <div class="stk-nav-btn" data-tab="worldbook_config"><i class="fa-solid fa-book"></i><span>世界书配置</span></div>
                <div class="stk-nav-btn" data-tab="prompts"><i class="fa-solid fa-file-lines"></i><span>模板提示词</span></div>
            </div>
            <div class="stk-nav-section">
                <div class="stk-nav-title">模块设置</div>
                ${modules.map(m => `
                    <div class="stk-nav-btn" data-tab="module_${m.id}"><i class="fa-solid fa-cog"></i><span>${m.name}</span></div>
                `).join('')}
            </div>
        `;

        const contentHtml = `
            <div class="stk-tab active" id="stk-tab-modules">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">模块管理</h3>
                ${moduleOverviewHtml}
            </div>
            <div class="stk-tab" id="stk-tab-api">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">API 配置</h3>
                <div class="stk-section">
                    <div class="stk-section-body">
                        <div class="stk-toggle">
                            <input type="checkbox" id="stk_use_preset" ${sh.use_preset ? 'checked' : ''} />
                            <span>使用当前预设</span>
                        </div>
                        <div id="stk_custom_api" style="display:${sh.use_preset ? 'none' : 'flex'};flex-direction:column;gap:8px;">
                            <div class="stk-row"><label>API 地址<input type="text" id="stk_api_url" class="text_pole" value="${sh.api_url || ''}" placeholder="http://localhost:1234/v1" /></label></div>
                            <div class="stk-row"><label>API 密钥<input type="password" id="stk_api_key" class="text_pole" value="${sh.api_key || ''}" /></label></div>
                            <div class="stk-row"><label>模型名称<input type="text" id="stk_model_name" class="text_pole" value="${sh.model_name || ''}" /></label></div>
                            <div class="stk-row" style="gap:12px">
                                <label>最大token<input type="number" id="stk_max_tokens" class="text_pole" value="${sh.max_tokens}" min="256" max="8192" step="256" /></label>
                                <label>温度<input type="number" id="stk_temperature" class="text_pole" value="${sh.temperature}" min="0" max="2" step="0.1" /></label>
                            </div>
                            <div class="stk-toggle">
                                <input type="checkbox" id="stk_stream" ${sh.stream ? 'checked' : ''} />
                                <span>流式传输</span>
                            </div>
                            <div class="stk-row" style="gap:8px;margin-top:4px">
                                <div class="stk-btn" id="stk_test_connection">测试连接</div>
                                <div class="stk-btn" id="stk_fetch_models">获取模型</div>
                            </div>
                            <div class="stk-row">
                                <label>模型选择
                                    <select id="stk_model_select" class="text_pole">
                                        <option value="">-- 手动输入或获取模型列表 --</option>
                                    </select>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="stk-tab" id="stk-tab-api_presets">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">API 预设管理</h3>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>预设列表</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px;margin-bottom:8px">
                            <div class="stk-btn primary" id="stk_preset_new">+ 新建预设</div>
                            <div class="stk-btn" id="stk_preset_import">导入</div>
                            <div class="stk-btn" id="stk_preset_export_all">导出全部</div>
                        </div>
                        <div id="stk_preset_list"></div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>模块预设绑定</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_preset_module_bindings">
                        ${modules.map(m => `
                            <div class="stk-row">
                                <label style="flex-direction:row;align-items:center;gap:8px">
                                    <span style="min-width:100px">${m.name}</span>
                                    <select class="text_pole stk-preset-binding" data-module="${m.id}" style="flex:1">
                                        <option value="">-- 使用全局配置 --</option>
                                    </select>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="stk-tab" id="stk-tab-ai_instructions">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">AI 指令预设</h3>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>预设管理</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px;margin-bottom:8px">
                            <select id="stk_ai_preset_select" class="text_pole" style="flex:1"></select>
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
                        <span>段落编辑</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_ai_segments_container"></div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>预览</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <textarea id="stk_ai_preview" class="text_pole" rows="6" readonly style="font-size:12px;resize:vertical"></textarea>
                    </div>
                </div>
            </div>
            <div class="stk-tab" id="stk-tab-worldbook_config">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">世界书配置</h3>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>0TK 占用模式</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-toggle">
                            <input type="checkbox" id="stk_wb_0tk_mode" />
                            <span>启用 0TK 占用模式</span>
                        </div>
                        <div style="font-size:11px;color:var(--stk-text-3);margin-top:8px">
                            启用后，所有STK相关世界书条目将被禁用，节省Token占用。条目在世界书中显示为"禁用"状态，关闭此选项后自动恢复启用。
                        </div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>同步操作</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_wb_sync_now">立即同步</div>
                            <div class="stk-btn" id="stk_wb_refresh_list">刷新条目列表</div>
                        </div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>条目列表</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body" id="stk_wb_entries_list">
                        <div style="text-align:center;color:var(--stk-text-3);padding:20px">点击"刷新条目列表"加载</div>
                    </div>
                </div>
                <div class="stk-section">
                    <div class="stk-section-header interactable" tabindex="0">
                        <span>配置管理</span>
                        <span class="stk-arrow fa-solid fa-chevron-down"></span>
                    </div>
                    <div class="stk-section-body">
                        <div class="stk-row" style="gap:8px">
                            <div class="stk-btn" id="stk_wb_export_config">导出配置</div>
                            <div class="stk-btn" id="stk_wb_import_config">导入配置</div>
                            <div class="stk-btn" id="stk_wb_reset_config" style="color:#ff6b6b">重置</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="stk-tab" id="stk-tab-prompts">
                <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">模板提示词</h3>
                <div style="font-size:11px;opacity:.6;margin-bottom:12px;">提示词存储在世界书「${Core.WORLD_BOOK}」中，修改后自动同步。</div>
                ${promptsHtml}
            </div>
            ${modules.map(m => `
                <div class="stk-tab" id="stk-tab-module_${m.id}">
                    <h3 style="margin:0 0 12px;font-size:15px;color:var(--stk-text)">${m.name} 设置</h3>
                    <div id="stk_module_settings_${m.id}"></div>
                </div>
            `).join('')}
        `;

        const windowHtml = `
            <div id="stk-window" style="left:${windowState.x}px;top:${windowState.y}px;width:${windowState.width}px;height:${windowState.height}px;">
                <div id="stk-window-header">
                    <div id="stk-window-title">
                        <i class="fa-solid fa-toolbox"></i>
                        <span>Smart Toolkit</span>
                    </div>
                    <div id="stk-window-controls">
                        <div class="stk-window-btn maximize" title="最大化"><i class="fa-solid fa-expand"></i></div>
                        <div class="stk-window-btn close" title="关闭"><i class="fa-solid fa-times"></i></div>
                    </div>
                </div>
                <div id="stk-layout">
                    <div id="stk-nav">${navHtml}</div>
                    <div id="stk-content">${contentHtml}</div>
                </div>
                <div class="stk-resize-handle se"></div>
                <div class="stk-resize-handle e"></div>
                <div class="stk-resize-handle s"></div>
                <div class="stk-resize-handle w"></div>
                <div class="stk-resize-handle n"></div>
            </div>
        `;

        $('body').append(windowHtml);

        modules.forEach(m => {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            $(`#stk_module_settings_${m.id}`).html(m.renderUI(ms));
        });

        this._bindWindowEvents();
        this._bindModuleEvents(modules, sh);

        if (windowState.activeTab) {
            this._switchTab(windowState.activeTab);
        }
    },

    _switchTab(tabId) {
        windowState.activeTab = tabId;
        saveWindowState();

        $('.stk-nav-btn').removeClass('active');
        $(`.stk-nav-btn[data-tab="${tabId}"]`).addClass('active');

        $('.stk-tab').removeClass('active');
        $(`#stk-tab-${tabId}`).addClass('active');
    },

    _bindWindowEvents() {
        const $win = $('#stk-window');
        const $header = $('#stk-window-header');

        $header.on('mousedown', (e) => {
            if ($(e.target).closest('.stk-window-btn').length) return;
            if (windowState.maximized) return;

            const isDragging = true;
            const startX = e.clientX - windowState.x;
            const startY = e.clientY - windowState.y;

            $(document).on('mousemove.stkdrag', (e) => {
                windowState.x = Math.max(0, Math.min(e.clientX - startX, window.innerWidth - 100));
                windowState.y = Math.max(0, Math.min(e.clientY - startY, window.innerHeight - 100));
                $win.css({ left: windowState.x, top: windowState.y });
            });

            $(document).on('mouseup.stkdrag', () => {
                $(document).off('.stkdrag');
                saveWindowState();
            });
        });

        $('.stk-resize-handle').on('mousedown', (e) => {
            if (windowState.maximized) return;
            e.preventDefault();

            const $handle = $(e.target);
            const dir = $handle.hasClass('se') ? 'se' : $handle.hasClass('e') ? 'e' : $handle.hasClass('s') ? 's' : $handle.hasClass('w') ? 'w' : 'n';
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = windowState.width;
            const startH = windowState.height;
            const startLeft = windowState.x;
            const startTop = windowState.y;

            $(document).on('mousemove.stkresize', (e) => {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                if (dir.includes('e')) {
                    windowState.width = Math.max(400, startW + dx);
                }
                if (dir.includes('w')) {
                    const newW = Math.max(400, startW - dx);
                    windowState.x = startLeft + startW - newW;
                    windowState.width = newW;
                }
                if (dir.includes('s')) {
                    windowState.height = Math.max(300, startH + dy);
                }
                if (dir.includes('n')) {
                    const newH = Math.max(300, startH - dy);
                    windowState.y = startTop + startH - newH;
                    windowState.height = newH;
                }

                $win.css({
                    left: windowState.x,
                    top: windowState.y,
                    width: windowState.width,
                    height: windowState.height
                });
            });

            $(document).on('mouseup.stkresize', () => {
                $(document).off('.stkresize');
                saveWindowState();
            });
        });

        $('.stk-window-btn.maximize').on('click', () => {
            windowState.maximized = !windowState.maximized;
            $win.toggleClass('maximized', windowState.maximized);
            saveWindowState();
        });

        $('.stk-window-btn.close').on('click', () => this.hide());

        $('.stk-nav-btn').on('click', (e) => {
            const tabId = $(e.currentTarget).data('tab');
            if (tabId) this._switchTab(tabId);
        });

        $('#stk-window').on('click', '.stk-section-header', function(e) {
            e.stopPropagation();
            $(this).toggleClass('collapsed').next('.stk-section-body').toggleClass('stk-hidden');
        });

        $('#stk-window').on('click', '.stk-sub-header', function(e) {
            e.stopPropagation();
            $(this).find('.stk-arrow').toggleClass('collapsed');
            $(this).next('.stk-sub-body').toggleClass('stk-hidden');
        });
    },

    _bindModuleEvents(modules, sh) {
        const save = () => Core.saveSettings();

        $('#stk_use_preset').on('change', function() {
            sh.use_preset = this.checked;
            $('#stk_custom_api').toggle(!this.checked);
            save();
        });
        $('#stk_api_url').on('input', function() { sh.api_url = this.value; save(); });
        $('#stk_api_key').on('input', function() { sh.api_key = this.value; save(); });
        $('#stk_model_name').on('input', function() { sh.model_name = this.value; save(); });
        $('#stk_max_tokens').on('input', function() { sh.max_tokens = Number(this.value); save(); });
        $('#stk_temperature').on('input', function() { sh.temperature = Number(this.value); save(); });
        $('#stk_stream').on('change', function() { sh.stream = this.checked; save(); });

        $('#stk_test_connection').on('click', async function() {
            const $btn = $(this).text('测试中...').prop('disabled', true);
            try {
                const result = await apiPresetManager.testConnectionFromConfig({
                    baseUrl: sh.api_url,
                    apiKey: sh.api_key,
                    model: sh.model_name
                });
                if (result.success) {
                    toastr.success('API 连接成功', '测试结果');
                } else {
                    toastr.error(result.error || '连接失败', '测试结果');
                }
            } catch (e) {
                toastr.error(e.message, '测试失败');
            } finally {
                $btn.text('测试连接').prop('disabled', false);
            }
        });

        $('#stk_fetch_models').on('click', async function() {
            const $btn = $(this).text('获取中...').prop('disabled', true);
            try {
                const models = await apiPresetManager.fetchModelsFromConfig({
                    baseUrl: sh.api_url,
                    apiKey: sh.api_key
                });
                if (models && models.length > 0) {
                    const $select = $('#stk_model_select').empty().append('<option value="">-- 选择模型 --</option>');
                    models.forEach(m => {
                        const id = typeof m === 'string' ? m : m.id;
                        $select.append(`<option value="${id}">${id}</option>`);
                    });
                    if (sh.model_name) $select.val(sh.model_name);
                    toastr.success(`获取到 ${models.length} 个模型`, '成功');
                } else {
                    toastr.warning('未获取到模型列表', '结果');
                }
            } catch (e) {
                toastr.error(e.message, '获取失败');
            } finally {
                $btn.text('获取模型').prop('disabled', false);
            }
        });

        $('#stk_model_select').on('change', function() {
            if (this.value) {
                sh.model_name = this.value;
                $('#stk_model_name').val(this.value);
                save();
            }
        });

        modules.forEach(m => {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            $(`#stk_mod_${m.id}_enabled`).on('change', function() { ms.enabled = this.checked; save(); });
            if (m.defaultSettings.update_mode !== undefined) {
                $(`#stk_mod_${m.id}_mode`).on('change', function() { ms.update_mode = this.value; save(); });
            }
        });

        $('.stk_prompt_save').on('click', async function() {
            const key = $(this).data('key');
            const content = $(`#stk_prompt_${key}`).val();
            await Core.setWorldBookEntry(key, content);
            toastr.success(`已保存到世界书`, key);
        });

        modules.forEach(m => {
            const ms = Core.getModuleSettings(m.id, m.defaultSettings);
            m.bindUI(ms, save);
        });

        this._bindApiPresetEvents(modules);
        this._bindAiInstructionEvents(modules);
        this._bindWorldbookConfigEvents(modules);
    },

    _refreshPresetList() {
        const presets = apiPresetManager.getAllPresets();
        const $list = $('#stk_preset_list').empty();
        
        if (presets.length === 0) {
            $list.html('<div style="text-align:center;color:var(--stk-text-3);padding:20px">暂无预设，点击"新建预设"创建</div>');
            return;
        }

        presets.forEach(p => {
            $list.append(`
                <div class="stk-preset-item" data-id="${p.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;margin:4px 0;background:rgba(0,0,0,0.15);border-radius:6px">
                    <div>
                        <div style="font-weight:500;color:var(--stk-text)">${_.escape(p.name)}</div>
                        <div style="font-size:11px;color:var(--stk-text-3)">${_.escape(p.baseUrl)} | ${_.escape(p.model)}</div>
                    </div>
                    <div style="display:flex;gap:4px">
                        <div class="stk-btn stk-preset-edit" data-id="${p.id}" style="padding:4px 8px;font-size:11px">编辑</div>
                        <div class="stk-btn stk-preset-test" data-id="${p.id}" style="padding:4px 8px;font-size:11px">测试</div>
                        <div class="stk-btn stk-preset-export" data-id="${p.id}" style="padding:4px 8px;font-size:11px">导出</div>
                        <div class="stk-btn stk-preset-delete" data-id="${p.id}" style="padding:4px 8px;font-size:11px;color:#ff6b6b">删除</div>
                    </div>
                </div>
            `);
        });

        this._refreshPresetBindings(modules);
    },

    _refreshPresetBindings(modules) {
        const presets = apiPresetManager.getAllPresets();
        $('.stk-preset-binding').each(function() {
            const moduleId = $(this).data('module');
            const currentPresetId = apiPresetManager.getModulePreset(moduleId)?.id || '';
            
            $(this).empty().append('<option value="">-- 使用全局配置 --</option>');
            presets.forEach(p => {
                $(this).append(`<option value="${p.id}"${p.id === currentPresetId ? ' selected' : ''}>${_.escape(p.name)}</option>`);
            });
        });
    },

    _bindApiPresetEvents(modules) {
        this._refreshPresetList();

        $('#stk_preset_new').on('click', () => {
            this._showPresetEditor(null);
        });

        $('#stk_preset_import').on('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const result = await apiPresetManager.uploadPresets(file);
                if (result.success) {
                    toastr.success(`导入成功：${result.imported} 个预设`, 'API预设');
                    if (result.skipped > 0) {
                        toastr.warning(`跳过 ${result.skipped} 个`, 'API预设');
                    }
                    this._refreshPresetList();
                } else {
                    toastr.error(result.error || '导入失败', 'API预设');
                }
            };
            input.click();
        });

        $('#stk_preset_export_all').on('click', () => {
            const presets = apiPresetManager.getAllPresets();
            if (presets.length === 0) {
                toastr.warning('没有可导出的预设', 'API预设');
                return;
            }
            apiPresetManager.downloadPresets();
            toastr.success('已导出全部预设', 'API预设');
        });

        $('#stk_preset_list').on('click', '.stk-preset-edit', (e) => {
            const id = $(e.currentTarget).data('id');
            this._showPresetEditor(id);
        });

        $('#stk_preset_list').on('click', '.stk-preset-test', async (e) => {
            const id = $(e.currentTarget).data('id');
            const $btn = $(e.currentTarget).text('测试中...').prop('disabled', true);
            try {
                const result = await apiPresetManager.testConnection(id);
                if (result.success) {
                    toastr.success('连接成功', 'API预设');
                } else {
                    toastr.error(result.error || '连接失败', 'API预设');
                }
            } catch (err) {
                toastr.error(err.message, '测试失败');
            } finally {
                $btn.text('测试').prop('disabled', false);
            }
        });

        $('#stk_preset_list').on('click', '.stk-preset-export', (e) => {
            const id = $(e.currentTarget).data('id');
            const preset = apiPresetManager.getPreset(id);
            if (preset) {
                apiPresetManager.downloadPresets([id], `api-preset-${preset.name}.json`);
                toastr.success('已导出预设', 'API预设');
            }
        });

        $('#stk_preset_list').on('click', '.stk-preset-delete', (e) => {
            const id = $(e.currentTarget).data('id');
            const preset = apiPresetManager.getPreset(id);
            if (confirm(`确定删除预设「${preset?.name || id}」吗？`)) {
                apiPresetManager.deletePreset(id);
                toastr.success('已删除预设', 'API预设');
                this._refreshPresetList();
            }
        });

        $('#stk_preset_module_bindings').on('change', '.stk-preset-binding', (e) => {
            const moduleId = $(e.target).data('module');
            const presetId = e.target.value || null;
            apiPresetManager.setModulePreset(moduleId, presetId);
            toastr.success('绑定已更新', 'API预设');
        });
    },

    _showPresetEditor(presetId) {
        const preset = presetId ? apiPresetManager.getPreset(presetId) : null;
        const isEdit = !!preset;

        const content = `
            <div class="stk-preset-editor">
                <div class="stk-row">
                    <label>预设名称<input type="text" id="stk_pe_name" class="text_pole" value="${preset?.name || ''}" placeholder="输入预设名称" /></label>
                </div>
                <div class="stk-row">
                    <label>API 地址<input type="text" id="stk_pe_url" class="text_pole" value="${preset?.baseUrl || ''}" placeholder="http://localhost:1234/v1" /></label>
                </div>
                <div class="stk-row">
                    <label>API 密钥<input type="password" id="stk_pe_key" class="text_pole" value="${preset?.apiKey || ''}" /></label>
                </div>
                <div class="stk-row">
                    <label>模型名称<input type="text" id="stk_pe_model" class="text_pole" value="${preset?.model || ''}" placeholder="gpt-3.5-turbo" /></label>
                </div>
                <div class="stk-row" style="gap:12px">
                    <label>最大token<input type="number" id="stk_pe_max_tokens" class="text_pole" value="${preset?.parameters?.max_tokens || 2048}" min="256" max="8192" /></label>
                    <label>温度<input type="number" id="stk_pe_temperature" class="text_pole" value="${preset?.parameters?.temperature || 0.7}" min="0" max="2" step="0.1" /></label>
                </div>
                <div class="stk-toggle">
                    <input type="checkbox" id="stk_pe_stream" ${preset?.parameters?.stream ? 'checked' : ''} />
                    <span>流式传输</span>
                </div>
                <div class="stk-row" style="gap:8px;margin-top:12px">
                    <div class="stk-btn" id="stk_pe_test">测试连接</div>
                    <div class="stk-btn" id="stk_pe_fetch">获取模型</div>
                </div>
                <div class="stk-row">
                    <label>选择模型<select id="stk_pe_model_select" class="text_pole"><option value="">-- 获取模型列表 --</option></select></label>
                </div>
            </div>
        `;

        const $dialog = $(`
            <div class="stk-modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:32000;display:flex;align-items:center;justify-content:center">
                <div class="stk-modal" style="background:var(--stk-bg);border:1px solid var(--stk-border);border-radius:var(--stk-radius-lg);padding:20px;min-width:400px;max-width:90vw">
                    <h3 style="margin:0 0 16px;color:var(--stk-text)">${isEdit ? '编辑预设' : '新建预设'}</h3>
                    ${content}
                    <div class="stk-row" style="justify-content:flex-end;gap:8px;margin-top:16px">
                        <div class="stk-btn stk-modal-cancel">取消</div>
                        <div class="stk-btn primary stk-modal-save">${isEdit ? '保存' : '创建'}</div>
                    </div>
                </div>
            </div>
        `);

        $('body').append($dialog);

        const closeDialog = () => $dialog.remove();

        $dialog.find('.stk-modal-cancel').on('click', closeDialog);

        $dialog.find('#stk_pe_test').on('click', async function() {
            const $btn = $(this).text('测试中...').prop('disabled', true);
            try {
                const result = await apiPresetManager.testConnectionFromConfig({
                    baseUrl: $('#stk_pe_url').val(),
                    apiKey: $('#stk_pe_key').val(),
                    model: $('#stk_pe_model').val()
                });
                if (result.success) toastr.success('连接成功', '测试结果');
                else toastr.error(result.error || '失败', '测试结果');
            } catch (e) {
                toastr.error(e.message, '测试失败');
            } finally {
                $btn.text('测试连接').prop('disabled', false);
            }
        });

        $dialog.find('#stk_pe_fetch').on('click', async function() {
            const $btn = $(this).text('获取中...').prop('disabled', true);
            try {
                const models = await apiPresetManager.fetchModelsFromConfig({
                    baseUrl: $('#stk_pe_url').val(),
                    apiKey: $('#stk_pe_key').val()
                });
                if (models && models.length > 0) {
                    const $select = $('#stk_pe_model_select').empty().append('<option value="">-- 选择模型 --</option>');
                    models.forEach(m => $select.append(`<option value="${m}">${m}</option>`));
                    toastr.success(`获取到 ${models.length} 个模型`, '成功');
                } else {
                    toastr.warning('未获取到模型', '结果');
                }
            } catch (e) {
                toastr.error(e.message, '获取失败');
            } finally {
                $btn.text('获取模型').prop('disabled', false);
            }
        });

        $dialog.find('#stk_pe_model_select').on('change', function() {
            if (this.value) $('#stk_pe_model').val(this.value);
        });

        $dialog.find('.stk-modal-save').on('click', () => {
            const name = $('#stk_pe_name').val().trim();
            if (!name) {
                toastr.error('请输入预设名称', '错误');
                return;
            }

            const config = {
                name,
                baseUrl: $('#stk_pe_url').val().trim(),
                apiKey: $('#stk_pe_key').val(),
                model: $('#stk_pe_model').val().trim(),
                parameters: {
                    max_tokens: parseInt($('#stk_pe_max_tokens').val()) || 2048,
                    temperature: parseFloat($('#stk_pe_temperature').val()) || 0.7,
                    stream: $('#stk_pe_stream').is(':checked')
                }
            };

            if (isEdit) {
                apiPresetManager.updatePreset(presetId, config);
                toastr.success('预设已更新', 'API预设');
            } else {
                apiPresetManager.createPreset(config);
                toastr.success('预设已创建', 'API预设');
            }

            this._refreshPresetList();
            closeDialog();
        });

        $dialog.on('click', '.stk-modal-overlay', (e) => {
            if (e.target === $dialog[0]) closeDialog();
        });
    },

    _bindAiInstructionEvents(modules) {
        this._refreshAiPresetList();

        $(document).on('change', '#stk_ai_preset_select', (e) => {
            AIInstructionsManager.setActivePreset(e.target.value);
            this._refreshAiSegments();
        });

        $(document).on('click', '#stk_ai_preset_new', () => {
            const name = prompt('预设名称：', '新预设');
            if (name) {
                AIInstructionsManager.createPreset(name, AIInstructionsManager.getDefaultSegments());
                this._refreshAiPresetList();
                toastr.success('已创建预设', 'AI指令');
            }
        });

        $(document).on('click', '#stk_ai_preset_dup', () => {
            const activeId = AIInstructionsManager.activePresetId;
            if (!activeId) {
                toastr.warning('请先选择一个预设', 'AI指令');
                return;
            }
            const copy = AIInstructionsManager.duplicatePreset(activeId);
            if (copy) {
                this._refreshAiPresetList();
                toastr.success('已复制预设', 'AI指令');
            }
        });

        $(document).on('click', '#stk_ai_preset_del', () => {
            const activeId = AIInstructionsManager.activePresetId;
            if (!activeId) return;
            if (AIInstructionsManager.presets.length <= 1) {
                toastr.warning('至少保留一个预设', 'AI指令');
                return;
            }
            if (confirm('确定删除当前预设？')) {
                AIInstructionsManager.deletePreset(activeId);
                this._refreshAiPresetList();
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
                const result = await AIInstructionsManager.uploadPresets(file);
                if (result.success) {
                    toastr.success(`导入成功：${result.imported} 个预设`, 'AI指令');
                    if (result.skipped > 0) toastr.warning(`跳过 ${result.skipped} 个`, 'AI指令');
                    this._refreshAiPresetList();
                } else {
                    toastr.error(result.error || '导入失败', 'AI指令');
                }
            };
            input.click();
        });

        $(document).on('click', '#stk_ai_preset_export', () => {
            const activeId = AIInstructionsManager.activePresetId;
            if (!activeId) {
                toastr.warning('请先选择预设', 'AI指令');
                return;
            }
            const preset = AIInstructionsManager.presets.find(p => p.id === activeId);
            AIInstructionsManager.downloadPresets([activeId], `ai-instruction-${preset?.name || 'export'}.json`);
            toastr.success('已导出预设', 'AI指令');
        });

        $(document).on('click', '#stk_ai_preset_export_all', () => {
            if (AIInstructionsManager.presets.length === 0) {
                toastr.warning('没有可导出的预设', 'AI指令');
                return;
            }
            AIInstructionsManager.downloadPresets();
            toastr.success('已导出全部预设', 'AI指令');
        });

        $(document).on('click', '#stk_ai_add_segment', () => {
            const activeId = AIInstructionsManager.activePresetId;
            if (!activeId) {
                toastr.warning('请先选择预设', 'AI指令');
                return;
            }
            AIInstructionsManager.addSegment(activeId, { role: 'user', name: '新段落', content: '' });
            this._refreshAiSegments();
        });

        $(document).on('click', '.stk-ai-seg-del', (e) => {
            const activeId = AIInstructionsManager.activePresetId;
            const segId = $(e.currentTarget).data('id');
            if (AIInstructionsManager.deleteSegment(activeId, segId)) {
                this._refreshAiSegments();
                toastr.success('已删除段落', 'AI指令');
            }
        });

        $(document).on('input', '.stk-ai-seg-name', (e) => {
            const activeId = AIInstructionsManager.activePresetId;
            const $item = $(e.currentTarget).closest('.stk-ai-segment-item');
            const segId = $item.data('id');
            AIInstructionsManager.updateSegment(activeId, segId, { name: e.target.value });
            this._updateAiPreview();
        });

        $(document).on('change', '.stk-ai-seg-role', (e) => {
            const activeId = AIInstructionsManager.activePresetId;
            const $item = $(e.currentTarget).closest('.stk-ai-segment-item');
            const segId = $item.data('id');
            AIInstructionsManager.updateSegment(activeId, segId, { role: e.target.value });
            this._updateAiPreview();
        });

        $(document).on('input', '.stk-ai-seg-content', (e) => {
            const activeId = AIInstructionsManager.activePresetId;
            const $item = $(e.currentTarget).closest('.stk-ai-segment-item');
            const segId = $item.data('id');
            AIInstructionsManager.updateSegment(activeId, segId, { content: e.target.value });
            this._updateAiPreview();
        });
    },

    _refreshAiPresetList() {
        const presets = AIInstructionsManager.presets;
        const activeId = AIInstructionsManager.activePresetId;
        const $select = $('#stk_ai_preset_select');
        if ($select.length) {
            $select.empty().append(presets.map(p => 
                `<option value="${p.id}"${p.id === activeId ? ' selected' : ''}>${_.escape(p.name)}</option>`
            ).join(''));
        }
        this._refreshAiSegments();
    },

    _refreshAiSegments() {
        const $container = $('#stk_ai_segments_container');
        if (!$container.length) return;
        
        const preset = AIInstructionsManager.activePreset;
        if (!preset || !preset.segments || preset.segments.length === 0) {
            $container.html('<div style="text-align:center;color:var(--stk-text-3);padding:20px">无段落，点击下方添加</div><div class="stk-btn" id="stk_ai_add_segment" style="width:100%;margin-top:8px">+ 添加段落</div>');
            this._updateAiPreview();
            return;
        }

        const sorted = [...preset.segments].sort((a, b) => a.order - b.order);
        const html = sorted.map((seg, idx) => `
            <div class="stk-ai-segment-item" data-id="${seg.id}" style="background:rgba(0,0,0,0.15);border-radius:6px;padding:10px;margin:6px 0">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="color:var(--stk-text-3);font-size:11px">#${idx + 1}</span>
                        <input type="text" class="text_pole stk-ai-seg-name" value="${_.escape(seg.name)}" style="width:120px;font-size:12px" />
                        <select class="text_pole stk-ai-seg-role" style="width:80px;font-size:12px">
                            <option value="system" ${seg.role === 'system' ? 'selected' : ''}>system</option>
                            <option value="user" ${seg.role === 'user' ? 'selected' : ''}>user</option>
                            <option value="assistant" ${seg.role === 'assistant' ? 'selected' : ''}>assistant</option>
                        </select>
                    </div>
                    <div style="display:flex;gap:4px">
                        ${seg.deletable ? `<div class="stk-btn stk-ai-seg-del" data-id="${seg.id}" style="padding:2px 6px;font-size:10px;color:#ff6b6b">删除</div>` : ''}
                    </div>
                </div>
                <textarea class="text_pole stk-ai-seg-content" rows="3" style="font-size:12px;resize:vertical">${_.escape(seg.content)}</textarea>
            </div>
        `).join('') + `<div class="stk-btn" id="stk_ai_add_segment" style="width:100%;margin-top:8px">+ 添加段落</div>`;
        
        $container.html(html);
        this._updateAiPreview();
    },

    _updateAiPreview() {
        const $preview = $('#stk_ai_preview');
        if ($preview.length) {
            $preview.val(AIInstructionsManager.buildPrompt());
        }
    },

    _bindWorldbookConfigEvents(modules) {
        const zeroTkMode = WorldbookConfigManager.zeroTkOccupyMode;
        $('#stk_wb_0tk_mode').prop('checked', zeroTkMode);

        $(document).on('change', '#stk_wb_0tk_mode', async (e) => {
            const enabled = $(e.target).is(':checked');
            await WorldbookConfigManager.setZeroTkOccupyMode(enabled);
            toastr.success(`0TK占用模式已${enabled ? '启用' : '禁用'}`, '世界书配置');
            this._refreshWorldbookEntries();
        });

        $(document).on('click', '#stk_wb_sync_now', async () => {
            const result = await WorldbookConfigManager.syncToWorldbook();
            if (result) {
                toastr.success('同步完成', '世界书配置');
                this._refreshWorldbookEntries();
            } else {
                toastr.error('同步失败', '世界书配置');
            }
        });

        $(document).on('click', '#stk_wb_refresh_list', () => {
            this._refreshWorldbookEntries();
        });

        $(document).on('click', '#stk_wb_export_config', () => {
            const config = WorldbookConfigManager.exportConfig();
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'stk-worldbook-config.json';
            a.click();
            URL.revokeObjectURL(url);
            toastr.success('配置已导出', '世界书配置');
        });

        $(document).on('click', '#stk_wb_import_config', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const result = WorldbookConfigManager.importConfig(data);
                    if (result.success) {
                        toastr.success('配置已导入', '世界书配置');
                        this._refreshWorldbookConfigUI();
                    } else {
                        toastr.error(result.error || '导入失败', '世界书配置');
                    }
                } catch (err) {
                    toastr.error('文件解析失败', '世界书配置');
                }
            };
            input.click();
        });

        $(document).on('click', '#stk_wb_reset_config', () => {
            if (confirm('确定要重置所有世界书配置吗？')) {
                WorldbookConfigManager.resetConfig();
                toastr.success('配置已重置', '世界书配置');
                this._refreshWorldbookConfigUI();
            }
        });

        $(document).on('click', '.stk-wb-entry-toggle', async (e) => {
            const uid = $(e.currentTarget).data('uid');
            const enabled = $(e.currentTarget).data('enabled') === true;
            const result = await WorldbookConfigManager.setEntryEnabled(uid, !enabled);
            if (result) {
                $(e.currentTarget).data('enabled', !enabled);
                $(e.currentTarget).text(!enabled ? '禁用' : '启用');
                toastr.success(`条目已${!enabled ? '启用' : '禁用'}`, '世界书配置');
            }
        });
    },

    async _refreshWorldbookEntries() {
        const $list = $('#stk_wb_entries_list');
        if (!$list.length) return;

        $list.html('<div style="text-align:center;padding:20px">加载中...</div>');

        const entries = await WorldbookConfigManager.listWorldbookEntries();
        const stkEntries = entries.filter(e =>
            (e.key && e.key.startsWith('stk_')) ||
            (e.comment && e.comment.includes('STK')) ||
            (e.comment && e.comment.includes('SmartToolkit'))
        );

        if (stkEntries.length === 0) {
            $list.html('<div style="text-align:center;color:var(--stk-text-3);padding:20px">没有找到STK相关条目</div>');
            return;
        }

        const html = stkEntries.map(e => `
            <div class="stk-wb-entry-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px;background:rgba(0,0,0,0.15);border-radius:4px;margin:4px 0">
                <div>
                    <div style="font-size:12px;font-weight:500">${_.escape(e.key || e.comment || '未命名')}</div>
                    <div style="font-size:10px;color:var(--stk-text-3)">${e.enabled ? '✓ 启用' : '○ 禁用'}</div>
                </div>
                <div class="stk-btn stk-wb-entry-toggle" data-uid="${e.uid}" data-enabled="${e.enabled}" style="padding:2px 8px;font-size:11px">
                    ${e.enabled ? '禁用' : '启用'}
                </div>
            </div>
        `).join('');

        $list.html(html);
    },

    _refreshWorldbookConfigUI() {
        const zeroTkMode = WorldbookConfigManager.zeroTkOccupyMode;
        $('#stk_wb_0tk_mode').prop('checked', zeroTkMode);
        this._refreshWorldbookEntries();
    },
};
