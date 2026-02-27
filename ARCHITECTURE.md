# Smart Toolkit 项目架构文档

> SillyTavern 扩展插件，提供模块化的工具集。  
> 仓库：https://github.com/heis1696/smart-toolkit

---

## 目录结构

```
smart-toolkit/
├── package.json              # 项目配置 & 构建脚本
├── src/
│   ├── index.js              # 入口：注册模块、绑定事件、初始化世界书、清理标签
│   ├── core.js               # 核心层：设置管理、消息工具、API 请求、世界书管理
│   ├── ui.js                 # UI 层：扩展菜单入口、独立窗口、标签页导航 + 模块管理
│   ├── utils/                # 工具层：通用工具类
│   │   └── RegexExtractor.js # 正则提取工具：标签块解析、模式管理
│   ├── managers/             # 管理器层：单例服务
│   │   ├── index.js          # 导出所有管理器
│   │   ├── StorageManager.js # 双存储策略（extensionSettings + IndexedDB）+ Profile 隔离
│   │   ├── TemplateManager.js# 模板 CRUD、导入导出、World Book 同步
│   │   ├── ApiPresetManager.js# API 预设管理、测试连接、获取模型、导入导出
│   │   ├── DatabaseManager.js# 数据库核心：表格合并、排序、消息解析
│   │   ├── TableLogicManager.js# 填表逻辑：编辑命令、审计日志
│   │   └── PlotAdvanceManager.js# 剧情推进：记忆召回、世界书集成
│   ├── components/           # 组件层：可复用 UI 组件
│   │   ├── index.js          # 导出所有组件
│   │   ├── WindowManager.js  # 窗口 z-index 控制、状态持久化
│   │   ├── DraggableWindow.js# 可拖拽/缩放窗口组件
│   │   ├── CollapsibleSection.js # 可折叠区块组件
│   │   ├── DynamicList.js    # 动态增删列表组件
│   │   ├── ModalPopup.js     # 模态框/Toast/确认对话框
│   │   ├── SidebarWindow.js  # 侧边栏主窗口（可拖拽）
│   │   ├── OptionsBarWindow.js# 快捷选项独立窗口
│   │   ├── TabbedPanel.js    # 标签页面板组件
│   │   ├── DatabaseVisualizer.js# 数据库可视化编辑组件
│   │   ├── ResponsiveGrid.js # 响应式网格组件
│   │   └── WorldbookSelector.js# 世界书选择器组件
│   └── modules/              # 功能模块
│       ├── statusbar.js      # 模块：状态栏生成器
│       ├── plotOptions.js    # 模块：剧情推进选项
│       ├── regexConfig.js    # 模块：正则配置集中管理
│       ├── aiInstructions.js # 模块：AI 指令预设管理
│       └── worldbookConfig.js# 模块：世界书配置（0TK模式）
├── dist/
│   └── bundle.js             # esbuild 构建产物 (IIFE)
├── ARCHITECTURE.md           # 本文档
└── CHANGELOG.md              # 版本变更日志
```

## 构建

```bash
npm run build   # 单次构建
npm run watch   # 监听模式
```

---

## 核心架构

### 五层设计

```
index.js (入口/事件总线)
    │
    ├── core.js (数据 & 逻辑 & 世界书)
    │
    ├── utils/ (工具层 - 通用工具)
    │   └── RegexExtractor    → 正则提取、标签块解析
    │
    ├── managers/ (管理器层 - 单例服务)
    │   ├── StorageManager    → 双存储策略 + Profile 隔离
    │   ├── TemplateManager   → 模板管理
    │   ├── ApiPresetManager  → API 预设管理 + 导入导出
    │   ├── DatabaseManager   → 数据库核心
    │   ├── TableLogicManager → 填表逻辑
    │   └── PlotAdvanceManager→ 剧情推进
    │
    ├── components/ (组件层 - 可复用 UI)
    │   ├── WindowManager     → 窗口生命周期
    │   ├── DraggableWindow   → 可拖拽窗口
    │   ├── CollapsibleSection→ 折叠面板
    │   ├── DynamicList       → 动态列表
    │   ├── ModalPopup        → 弹窗组件
    │   ├── TabbedPanel       → 标签页面板
    │   ├── DatabaseVisualizer→ 数据库可视化
    │   ├── ResponsiveGrid    → 响应式网格
    │   └── WorldbookSelector → 世界书选择器
    │
    └── modules/ (功能模块)
        ├── statusbar.js      → 状态栏生成
        ├── plotOptions.js    → 剧情推进选项
        ├── regexConfig.js    → 正则配置管理
        ├── aiInstructions.js → AI 指令预设
        └── worldbookConfig.js→ 世界书配置
```

### 1. `index.js` — 入口

职责：初始化模块、渲染 UI、初始化世界书、监听 SillyTavern 事件。

| 事件 | 处理 |
|------|------|
| `MESSAGE_RECEIVED` | 节流 3s，依次调用各模块 `onMessage(msgId)` |
| `CHAT_COMPLETION_SETTINGS_READY` | 调用各模块 `onChatReady(data)` |

**重要变更：** 消息处理不再自动清理 `<auxiliary_tool>` 标签，各模块输出需自行包裹该标签。

### 2. `core.js` — 核心工具

| 功能组 | 方法 | 说明 |
|--------|------|------|
| **设置管理** | `getSettings()` | 获取插件全局设置对象 |
| | `saveSettings()` | 防抖保存 |
| | `getModuleSettings(id, defaults)` | 获取模块设置，自动填充默认值 |
| **世界书** | `ensureWorldBook(modules)` | 创建/检查世界书「工具书」，同步模板提示词 |
| | `getWorldBookEntry(key)` | 读取世界书条目内容 |
| | `setWorldBookEntry(key, content)` | 更新世界书条目内容 |
| **消息工具** | `getChat()` | 当前聊天数组 |
| | `getLastMessageId()` | 最后一条消息索引 |
| **内容提取** | `extractContent(text, opts)` | 按标签提取 + 正则清理 |
| | `extractToolContent(message, toolType)` | 从 `<auxiliary_tool type="...">` 提取内容 |
| | `extractLastToolContent(beforeMsgId, toolType)` | 向前搜索最近一条工具内容 |
| **API 请求** | `requestExtraModel(opts)` | 支持三种请求模式的额外模型调用 |

### 3. `managers/` — 管理器层

#### StorageManager

单例模式，提供双存储策略：

```javascript
import { storage } from './managers/StorageManager.js';

// 存储层级：extensionSettings → IndexedDB → localStorage fallback
await storage.set('key', value);
const data = await storage.get('key');
```

| 方法 | 说明 |
|------|------|
| `getInstance()` | 获取单例实例 |
| `get(key)` | 获取数据（自动降级） |
| `set(key, value)` | 存储数据（双写） |
| `delete(key)` | 删除数据 |
| `clear()` | 清空所有数据 |
| `getProfileSettings(code, defaults)` | 获取 Profile 隔离设置 |
| `setProfileSettings(code, settings)` | 保存 Profile 隔离设置 |
| `switchProfile(newCode)` | 切换当前 Profile |
| `createProfile(code, name)` | 创建新 Profile |
| `deleteProfile(code)` | 删除 Profile |
| `listProfiles()` | 列出所有 Profile |
| `getProfileKey(code, key)` | 获取 Profile 下的特定键值 |

#### TemplateManager

单例模式，管理提示词模板：

```javascript
import { templateManager } from './managers/TemplateManager.js';

// 创建模板
templateManager.createTemplate({ name, data, metadata });

// 获取活动模板
const active = templateManager.getActiveTemplate();

// 导出模板
const json = templateManager.exportTemplate(id);
```

| 方法 | 说明 |
|------|------|
| `getInstance()` | 获取单例实例 |
| `createTemplate(opts)` | 创建模板 |
| `getTemplate(id)` | 获取模板 |
| `updateTemplate(id, data)` | 更新模板 |
| `deleteTemplate(id)` | 删除模板 |
| `getAllTemplates()` | 获取所有模板 |
| `setActiveTemplate(id)` | 设置活动模板 |
| `getActiveTemplate()` | 获取活动模板 |
| `exportTemplate(id)` | 导出为 JSON |
| `importTemplate(json)` | 从 JSON 导入 |
| `syncToWorldBook()` | 同步到世界书 |

#### ApiPresetManager

单例模式，管理多个 API 预设配置：

```javascript
import { apiPresetManager } from './managers/ApiPresetManager.js';

// 创建预设
const presetId = apiPresetManager.createPreset({
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-xxx',
    model: 'gpt-4'
});

// 模块绑定预设
apiPresetManager.setModulePreset('statusbar', presetId);

// 获取模块的 API 配置
const config = apiPresetManager.getModuleApiConfig('statusbar');

// 测试连接
const result = await apiPresetManager.testConnection(presetId);

// 获取模型列表
const models = await apiPresetManager.fetchModels(presetId);
```

| 方法 | 说明 |
|------|------|
| `getInstance()` | 获取单例实例 |
| `init()` | 初始化，加载已保存的预设 |
| `createPreset(config)` | 创建预设，返回预设 ID |
| `updatePreset(id, config)` | 更新预设 |
| `deletePreset(id)` | 删除预设（同时清理模块绑定） |
| `getPreset(id)` | 获取预设 |
| `getAllPresets()` | 获取所有预设 |
| `getModulePreset(moduleId)` | 获取模块绑定的预设 |
| `setModulePreset(moduleId, presetId)` | 绑定/解绑模块预设 |
| `getModuleApiConfig(moduleId)` | 获取模块的 API 配置对象 |
| `testConnection(presetId)` | 测试 API 连接 |
| `fetchModels(presetId)` | 获取可用模型列表 |
| `testConnectionFromConfig(config)` | 从配置对象测试连接（UI 用） |
| `fetchModelsFromConfig(config)` | 从配置对象获取模型（UI 用） |

#### DatabaseManager

单例模式，数据库核心管理器，处理表格数据解析和合并：

```javascript
import { databaseManager } from './managers/DatabaseManager.js';

// 加载所有聊天消息
await databaseManager.loadAllChatMessages_ACU();

// 合并所有独立表格
const tables = databaseManager.mergeAllIndependentTables_ACU(messages);

// 获取排序后的表格键
const sortedKeys = databaseManager.getSortedSheetKeys_ACU(tables);
```

| 方法 | 说明 |
|------|------|
| `getInstance()` | 获取单例实例 |
| `loadAllChatMessages_ACU()` | 加载所有聊天消息 |
| `mergeAllIndependentTables_ACU(msgs)` | 合并独立表格数据 |
| `getSortedSheetKeys_ACU(tables)` | 获取排序后的表格键 |
| `parseTableFromMessage(msg)` | 从消息解析表格 |
| `getTableData(tableName)` | 获取指定表格数据 |

#### TableLogicManager

单例模式，填表逻辑管理器，处理编辑命令和审计日志：

```javascript
import { tableLogicManager } from './managers/TableLogicManager.js';

// 解析编辑命令
const commands = tableLogicManager.parseEditCommands(input);

// 执行批量更新
await tableLogicManager.executeBatchUpdate(tableName, commands);

// 获取审计日志
const logs = tableLogicManager.getAuditLogs(tableName);
```

| 方法 | 说明 |
|------|------|
| `getInstance()` | 获取单例实例 |
| `parseEditCommands(input)` | 解析编辑命令 |
| `executeBatchUpdate(table, cmds)` | 执行批量更新 |
| `getAuditLogs(tableName)` | 获取审计日志 |
| `clearAuditLogs(tableName)` | 清除审计日志 |
| `validateCommand(cmd)` | 验证命令格式 |

#### PlotAdvanceManager

单例模式，剧情推进管理器，处理记忆召回和世界书集成：

```javascript
import { plotAdvanceManager } from './managers/PlotAdvanceManager.js';

// 设置记忆召回数量
plotAdvanceManager.setMemoryRecallCount(5);

// 设置选中的世界书
plotAdvanceManager.setSelectedWorldbooks(['wb1', 'wb2']);

// 生成推进提示词
const prompt = await plotAdvanceManager.generatePrompt();

// 执行推进（可循环）
await plotAdvanceManager.advance({ loop: true });
```

| 方法 | 说明 |
|------|------|
| `getInstance()` | 获取单例实例 |
| `setMemoryRecallCount(count)` | 设置记忆召回数量 |
| `getMemoryRecallCount()` | 获取记忆召回数量 |
| `setSelectedWorldbooks(keys)` | 设置选中世界书 |
| `getSelectedWorldbooks()` | 获取选中世界书 |
| `generatePrompt()` | 生成推进提示词 |
| `advance(opts)` | 执行推进 |
| `isLooping()` | 是否正在循环 |

### 4. `components/` — 组件层

#### WindowManager

单例模式，管理窗口生命周期和 z-index：

```javascript
import { windowManager } from './components/index.js';

// 注册窗口
windowManager.register(id, windowInstance);

// 置顶窗口
windowManager.bringToFront(id);

// 保存所有窗口状态
windowManager.saveAllStates();
```

#### DraggableWindow

可拖拽、可缩放的独立窗口组件：

```javascript
import { DraggableWindow } from './components/index.js';

const win = new DraggableWindow({
    id: 'my-window',
    title: '窗口标题',
    content: '<div>内容</div>',
    width: 400,
    height: 'auto',      // 或具体数值
    anchor: 'center',    // center | top-left | top-right | bottom-left | bottom-right
    offset: { x: 0, y: 0 },
    persistState: true,  // 状态持久化
    showClose: true,
    showMinimize: false,
    className: 'custom-class',
    onClose: () => {}
});

win.show();
win.close();
win.bringToFront();
```

#### CollapsibleSection

可折叠的内容区块：

```javascript
import { CollapsibleSection } from './components/index.js';

const section = new CollapsibleSection({
    title: '标题',
    content: '<div>内容</div>',
    collapsed: false,
    onToggle: (isCollapsed) => {}
});
```

#### DynamicList

动态增删的列表组件：

```javascript
import { DynamicList } from './components/index.js';

const list = new DynamicList({
    items: ['item1', 'item2'],
    renderItem: (item, index) => `<span>${item}</span>`,
    onAdd: () => {},
    onRemove: (index) => {},
    sortable: true
});
```

#### ModalPopup

模态框、Toast、确认对话框：

```javascript
import { ModalPopup, Toast, ConfirmDialog } from './components/index.js';

// 模态框
const modal = new ModalPopup({ title: '标题', content: '内容' });
modal.show();

// Toast 提示
Toast.show('操作成功', 'success');

// 确认对话框
const result = await ConfirmDialog.show('确定删除？');
```

#### SidebarWindow

侧边栏主窗口，继承 DraggableWindow，集成 API 预设管理、模块设置、提示词编辑：

```javascript
import { SidebarWindow } from './components/index.js';

const sidebar = new SidebarWindow(modules);
sidebar.show();
sidebar.close();
```

**功能：**
- API 预设管理（创建/编辑/删除/测试连接/获取模型）
- 模块设置面板
- 各模块破限提示词编辑（保存到世界书）
- 重置提示词到默认值

#### OptionsBarWindow

快捷选项独立窗口，单例模式，提供模块快速开关：

```javascript
import { optionsBarWindow } from './components/index.js';

optionsBarWindow.setModules(modules);
optionsBarWindow.show();
optionsBarWindow.close();
```

**功能：**
- 各模块启用/禁用开关
- 状态实时保存
- 独立于主侧边栏

#### TabbedPanel

标签页面板组件，支持多标签切换和徽章通知：

```javascript
import { TabbedPanel } from './components/index.js';

const panel = new TabbedPanel({
    tabs: [
        { id: 'db', label: '数据库', content: '<div>...</div>' },
        { id: 'plot', label: '剧情推进', badge: 3 },
        { id: 'settings', label: '设置' }
    ],
    activeTab: 'db',
    onChange: (tabId) => {}
});
```

| 方法 | 说明 |
|------|------|
| `setActiveTab(id)` | 切换活动标签 |
| `setTabBadge(id, count)` | 设置徽章数字 |
| `updateTabContent(id, html)` | 更新标签内容 |
| `getActiveTab()` | 获取当前活动标签 ID |

#### DatabaseVisualizer

数据库可视化编辑组件，用于表格数据展示和编辑：

```javascript
import { DatabaseVisualizer } from './components/index.js';

const visualizer = new DatabaseVisualizer({
    tables: ['角色表', '地点表', '事件表'],
    onSelect: (tableName) => {},
    onEdit: (tableName, rowId, data) => {}
});

visualizer.setTableData('角色表', rows);
visualizer.refresh();
```

| 方法 | 说明 |
|------|------|
| `setTableData(name, rows)` | 设置表格数据 |
| `refresh()` | 刷新当前表格 |
| `getSelectedTable()` | 获取选中表格名 |
| `clearAll()` | 清空所有数据 |

#### ResponsiveGrid

响应式网格组件，支持断点自适应布局：

```javascript
import { ResponsiveGrid } from './components/index.js';

const grid = new ResponsiveGrid({
    breakpoints: { sm: 320, md: 640, lg: 1024 },
    columns: { sm: 1, md: 2, lg: 3 },
    gap: 16,
    items: [
        { content: '<div>Item 1</div>', colSpan: 1 },
        { content: '<div>Item 2</div>', colSpan: 2 }
    ]
});
```

| 方法 | 说明 |
|------|------|
| `addItem(config)` | 添加网格项 |
| `removeItem(index)` | 移除网格项 |
| `setLayout(breakpoint, cols)` | 设置断点列数 |
| `refresh()` | 重新计算布局 |

#### WorldbookSelector

世界书选择器组件，支持多选和搜索：

```javascript
import { WorldbookSelector } from './components/index.js';

const selector = new WorldbookSelector({
    multiple: true,
    showSearch: true,
    showCount: true,
    selected: ['entry1', 'entry2'],
    onChange: (selectedKeys) => {}
});

selector.loadEntries();
selector.getSelected();
```

| 方法 | 说明 |
|------|------|
| `loadEntries()` | 加载世界书条目 |
| `setSelected(keys)` | 设置选中条目 |
| `getSelected()` | 获取选中条目 |
| `filter(keyword)` | 过滤条目 |

### 5. `modules/` — 功能模块

职责：实现具体功能，使用管理器和组件构建 UI。

---

## UI 结构

```
扩展菜单入口 (Smart Toolkit)
  │   通过 addAutoCardMenuItem_ACU 注册
  │   点击打开/关闭独立窗口
  │
  └── STK 主窗口（可拖拽、可缩放、可最大化）
      │   - 状态持久化（localStorage）
      │   - 响应式设计（1100px/768px 断点）
      │
      ├── 左侧导航栏
      │   ├── 核心
      │   │   ├── 📋 模块管理（启用开关 + 更新方式）
      │   │   ├── 🔌 API 配置（预设/自定义切换）
      │   │   └── 📝 模板提示词（世界书同步）
      │   └── 模块设置
      │       └── 各模块详细设置页面
      │
      └── 右侧内容区
          ├── 模块管理页
          │   └── 各模块启用/禁用 + 更新模式选择
          ├── API 配置页
          │   ├── 使用当前预设开关
          │   ├── API 地址/密钥/模型配置
          │   ├── 参数设置（max_tokens/temperature/stream）
          │   ├── 测试连接 + 获取模型按钮
          │   └── 模型选择下拉
          ├── 模板提示词页
          │   └── 各模块提示词编辑（保存到世界书）
          └── 模块详细设置页
              └── 分类折叠的子面板

OptionsBarWindow（独立快捷选项窗口）
  └── 各模块启用/禁用快速开关
```

---

## 世界书「工具书」

插件启用时自动创建/检查世界书，用于存储各模块的模板提示词：

| 条目 Key | 来源模块 | 说明 |
|----------|----------|------|
| `statusbar_system_prompt` | StatusBar | 状态栏生成系统提示词 |
| `plot_options_prompt` | PlotOptions | 剧情推进选项生成提示词 |

模块通过 `templatePrompts` 属性声明需要的提示词条目，插件初始化时自动同步到世界书。
运行时优先从世界书读取提示词，用户可通过世界书 UI 或插件面板编辑。

---

## 模块规范

```javascript
export const MyModule = {
    id: 'my_module',
    name: '📦 模块名称',
    defaultSettings: { enabled: true, update_mode: 'extra_model', ... },

    // 模板提示词（可选，会同步到世界书）
    templatePrompts: { my_prompt_key: '默认提示词内容' },

    // 初始化（可选）
    init() {
        // 初始化默认模板
        this._initDefaultTemplate();
    },

    // 消息处理（可选）
    async onMessage(msgId) {},

    // 聊天就绪（可选）
    onChatReady(data) {},

    // 渲染侧边栏设置 UI
    renderUI(settings) { return html; },

    // 绑定侧边栏 UI 事件
    bindUI(settings, save) {},

    // 打开独立设置窗口（可选）
    openSettings() {},

    // 关闭所有窗口（可选）
    closeAllWindows() {},
};
```

**集成模板管理器的模块示例：**

```javascript
import { templateManager } from '../managers/TemplateManager.js';
import { DraggableWindow } from '../components/index.js';

export const MyModule = {
    init() {
        this._initDefaultTemplate();
    },

    _initDefaultTemplate() {
        const templates = templateManager.getAllTemplates();
        const hasDefault = templates.some(t => 
            t.metadata.isDefault && t.metadata.module === this.id
        );
        if (!hasDefault) {
            templateManager.createTemplate({
                id: `default-${this.id}`,
                name: '默认模板',
                data: { prompt: DEFAULT_PROMPT },
                metadata: { isDefault: true, module: this.id }
            });
        }
    },

    async _getPrompt() {
        const active = templateManager.getActiveTemplate();
        if (active?.metadata.module === this.id && active.data.prompt) {
            return active.data.prompt;
        }
        return DEFAULT_PROMPT;
    }
};
```

注意：模块的 `enabled` 和 `update_mode` 已集成到共享 API 配置的「模块管理」中，
`renderUI` 只需返回模块特有的详细设置。

所有模块的 AI 输出内容必须包裹在 `<auxiliary_tool type="模块类型"></auxiliary_tool>` 标签内，
以便其他模块或提取方法正确解析。使用 `Core.extractToolContent()` 和 `Core.extractLastToolContent()` 方法提取内容。

---

## 设置存储结构

### 双存储策略

插件采用双存储策略确保数据可靠性：

```
┌─────────────────────────────────────────────────────────────┐
│                      StorageManager                          │
├─────────────────────────────────────────────────────────────┤
│  Level 1: extensionSettings (SillyTavern 原生)               │
│           - 配置数据、启用状态、API 设置                       │
│           - 自动随 SillyTavern 备份                          │
├─────────────────────────────────────────────────────────────┤
│  Level 2: IndexedDB (大容量存储)                             │
│           - 模板数据、窗口状态                                │
│           - 支持大量数据                                      │
│           - localStorage fallback                            │
└─────────────────────────────────────────────────────────────┘
```

### 数据结构

```javascript
// extensionSettings['smart-toolkit']
{
    _shared: {
        use_preset, api_url, api_key,
        model_name, max_tokens, temperature, stream
    },
    statusbar: {
        enabled, update_mode, auto_request,
        retry_count, request_mode, content_tag,
        cleanup_patterns, notification
    },
    plot_options: {
        enabled, update_mode, auto_request,
        retry_count, request_mode, ...
    }
}

// IndexedDB 'smart-toolkit-storage'
{
    // API 预设
    api_presets: {
        [presetId]: {
            id, name, baseUrl, apiKey, model,
            parameters: { max_tokens, temperature, stream }
        }
    },
    // 模块-预设绑定
    api_module_bindings: {
        [moduleId]: presetId
    }
}

// IndexedDB 'smart-toolkit-templates'
{
    templates: Map<id, {
        id, name, description,
        createdAt, updatedAt,
        data: { prompt, ... },
        metadata: { isDefault, module, ... }
    }>,
    activeTemplate: templateId | null
}

// IndexedDB 'smart-toolkit-window-states'
{
    windowId: { x, y, width, height, zIndex }
}
```

---

## 组件依赖关系

```
managers/
├── StorageManager.js ──── (standalone, 单例)
├── TemplateManager.js ──── StorageManager
├── ApiPresetManager.js ─── StorageManager
├── DatabaseManager.js ──── StorageManager
├── TableLogicManager.js ──┬── DatabaseManager
│                         └── StorageManager
└── PlotAdvanceManager.js ─┬── DatabaseManager
                           └── StorageManager

modules/
├── statusbar.js ──────┬── StorageManager
│                      ├── TemplateManager
│                      ├── ApiPresetManager
│                      ├── DraggableWindow
│                      └── WindowManager
│
└── plotOptions.js ────┼── StorageManager
                       ├── TemplateManager
                       ├── ApiPresetManager
                       ├── DraggableWindow
                       └── WindowManager

ui.js ─────────────────┬── Core
                       ├── ApiPresetManager
                       └── jQuery (STK 全局)

components/
├── DraggableWindow.js ─── WindowManager
├── SidebarWindow.js ─────┬── DraggableWindow
│                         ├── ApiPresetManager
│                         ├── Core
│                         └── modules
│                         (注：已被 ui.js 直接实现替代)
├── OptionsBarWindow.js ──┬── DraggableWindow
│                         └── Core
├── TabbedPanel.js ─────── (standalone)
├── DatabaseVisualizer.js ─┬── DatabaseManager
│                         └── StorageManager
├── ResponsiveGrid.js ───── (standalone)
├── WorldbookSelector.js ── Core
├── DynamicList.js ─────── (standalone)
├── CollapsibleSection.js─ (standalone)
├── ModalPopup.js ──────── (standalone)
└── WindowManager.js ───── StorageManager
```

---

*文档最后更新：2026-02-27*
