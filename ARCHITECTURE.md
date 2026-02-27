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
│   ├── ui.js                 # UI 层：顶栏按钮、侧滑面板、共享配置 + 模块管理
│   ├── managers/             # 管理器层：单例服务
│   │   ├── index.js          # 导出 storage、templateManager
│   │   ├── StorageManager.js # 双存储策略（extensionSettings + IndexedDB）
│   │   └── TemplateManager.js# 模板 CRUD、导入导出、World Book 同步
│   ├── components/           # 组件层：可复用 UI 组件
│   │   ├── index.js          # 导出所有组件
│   │   ├── WindowManager.js  # 窗口 z-index 控制、状态持久化
│   │   ├── DraggableWindow.js# 可拖拽/缩放窗口组件
│   │   ├── CollapsibleSection.js # 可折叠区块组件
│   │   ├── DynamicList.js    # 动态增删列表组件
│   │   └── ModalPopup.js     # 模态框/Toast/确认对话框
│   └── modules/              # 功能模块
│       ├── statusbar.js      # 模块：状态栏生成器
│       └── plotOptions.js    # 模块：剧情推进选项
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
    ├── managers/ (管理器层 - 单例服务)
    │   ├── StorageManager    → 双存储策略
    │   └── TemplateManager   → 模板管理
    │
    ├── components/ (组件层 - 可复用 UI)
    │   ├── WindowManager     → 窗口生命周期
    │   ├── DraggableWindow   → 可拖拽窗口
    │   ├── CollapsibleSection→ 折叠面板
    │   ├── DynamicList       → 动态列表
    │   └── ModalPopup        → 弹窗组件
    │
    └── modules/ (功能模块)
        ├── statusbar.js
        └── plotOptions.js
```

### 1. `index.js` — 入口

职责：初始化模块、渲染 UI、初始化世界书、监听 SillyTavern 事件。

| 事件 | 处理 |
|------|------|
| `MESSAGE_RECEIVED` | 节流 3s，依次调用各模块 `onMessage(msgId)` |
| `CHAT_COMPLETION_SETTINGS_READY` | 调用各模块 `onChatReady(data)` |

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

### 5. `modules/` — 功能模块

职责：实现具体功能，使用管理器和组件构建 UI。

---

## UI 结构

```
顶栏按钮 (🔧)
  └── 右侧滑出面板
      ├── 🔌 共享 API 配置
      │   ├── 📋 模块管理（启用开关 + 更新方式）
      │   └── 🔗 API 连接（预设/自定义URL/密钥/模型/参数）
      ├── 📝 模板提示词（世界书）
      │   └── 各模块提示词编辑 textarea + 保存按钮
      └── 📊 各模块设置
          └── 分类折叠的子面板（请求设置/内容处理/操作）

独立窗口（通过 DraggableWindow）
  ├── 🎭 剧情推进窗口
  ├── 📊 状态栏设置窗口
  └── 🧪 提取测试预览窗口
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

所有模块的 AI 输出内容必须包裹在 `<auxiliary_tool></auxiliary_tool>` 标签内，
入口层会在所有模块处理完成后自动清理这些标签。

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
modules/
├── statusbar.js ──────┬── StorageManager
│                      ├── TemplateManager
│                      ├── DraggableWindow
│                      └── WindowManager
│
└── plotOptions.js ────┼── StorageManager
                       ├── TemplateManager
                       ├── DraggableWindow
                       └── WindowManager

components/
├── DraggableWindow.js ─── WindowManager
├── DynamicList.js ─────── (standalone)
├── CollapsibleSection.js─ (standalone)
├── ModalPopup.js ──────── (standalone)
└── WindowManager.js ───── StorageManager
```

---

*文档最后更新：2026-02-27*
