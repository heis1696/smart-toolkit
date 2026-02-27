# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.4.0] - 2026-02-28

### Added

#### 正则提取独立模块
- **RegexExtractor** - 独立正则提取工具类
  - 静态方法 `parseBlock` / `removeBlock` 解析/移除标签块
  - 实例方法 `addPattern` / `cleanup` 管理正则模式
  - 支持多模式注册与批量处理
- **regexConfig** - 集中正则配置模块
  - 全局共享 RegexExtractor 实例
  - UI 渲染与模式管理
  - JSON 导入/导出支持

#### API 预设管理增强
- **ApiPresetManager** 扩展
  - `exportPresets()` - 导出预设为 JSON
  - `importPresets(data)` - 从 JSON 导入预设
  - `downloadPresets()` - 下载预设文件
  - `uploadPresets()` - 上传预设文件
- **API 预设管理 Tab** - 独立 UI 管理界面
  - 预设列表展示与选择
  - 预设创建/编辑/删除/复制
  - JSON 导入/导出

#### AI 指令预设系统
- **AIInstructionsManager** - AI 指令预设管理器
  - 预设 CRUD 操作
  - 动态片段管理（角色、内容、顺序）
  - 提示词构建
  - JSON 导入/导出
- **AI 指令预设 Tab** - 完整 UI 界面
  - 预设选择与管理
  - 片段列表编辑（角色选择、内容输入）
  - 实时预览生成结果

#### 世界书配置优化
- **WorldbookConfigManager** - 世界书配置管理器
  - 0TK 占用模式切换（一键禁用/启用 STK 相关条目）
  - 条目列表获取与状态同步
  - 配置导入/导出/重置
- **世界书配置 Tab** - UI 管理界面
  - 0TK 模式开关
  - 同步操作按钮
  - STK 相关条目列表展示与单独控制
  - 配置管理（导入/导出/重置）

### Changed
- **statusbar.js** - 重构引用独立 RegexExtractor，移除硬编码正则逻辑
- **ui.js** - 添加三个新 Tab（API 预设管理、AI 指令预设、世界书配置）

### Technical Details
- 新增文件：
  - `src/utils/RegexExtractor.js` - 正则提取工具类
  - `src/modules/regexConfig.js` - 集中正则配置模块
  - `src/modules/aiInstructions.js` - AI 指令预设模块
  - `src/modules/worldbookConfig.js` - 世界书配置模块
- 更新文件：
  - `src/modules/statusbar.js` - 引用 RegexExtractor
  - `src/managers/ApiPresetManager.js` - 添加导入导出方法
  - `src/ui.js` - 添加新 Tab 和事件绑定

## [1.3.1] - 2026-02-27

### Changed

#### UI 架构重构
- **ui.js** - 重构为 Shujuku 风格独立窗口
  - 移除顶栏按钮入口，改用扩展菜单 (`addAutoCardMenuItem_ACU`) 注册
  - 实现可拖拽、可缩放、可最大化的独立窗口
  - 添加左侧导航栏 + 右侧内容区的标签页布局
  - 窗口状态持久化（localStorage）
  - 响应式设计（1100px/768px 断点）
  - 保留 STK 核心功能（模块管理、API 配置、模板提示词）

### Removed
- **ShujukuModule** - 移除独立模块（功能已整合到 STK 核心 UI）
- **src/modules/shujuku/** - 删除整个目录
- **TabbedWindow.js** - 删除独立组件（功能已整合到 ui.js）

### Technical Details
- 修改文件：
  - `src/ui.js` - 完全重构 UI 架构
  - `src/index.js` - 移除 ShujukuModule 导入
- 删除文件：
  - `src/modules/shujuku/` 目录及所有文件
  - `src/components/TabbedWindow.js`

## [1.3.0] - 2026-02-27

### Added

#### 数据库管理器
- **DatabaseManager** - 数据库核心管理器
  - 表格数据解析与合并 (`mergeAllIndependentTables_ACU`)
  - 表格排序 (`getSortedSheetKeys_ACU`)
  - 聊天消息加载 (`loadAllChatMessages_ACU`)
  - STK 兼容的表格数据处理
- **TableLogicManager** - 填表逻辑管理器
  - 表格编辑命令解析与执行
  - 审计日志记录
  - 批量更新支持
  - 单例模式实现
- **PlotAdvanceManager** - 剧情推进管理器
  - 记忆召回数量控制
  - 世界书选择集成
  - 提示词生成
  - 可循环推进支持
  - 单例模式实现

#### UI 组件扩展
- **TabbedPanel** - 标签页面板组件
  - 多标签切换
  - 徽章通知
  - 内容动态更新
- **DatabaseVisualizer** - 数据库可视化组件
  - 表格选择与数据展示
  - 实时数据编辑
  - 刷新与排序支持
- **ResponsiveGrid** - 响应式网格组件
  - 断点自适应布局
  - 列跨度/行跨度支持
  - ResizeObserver 监听
- **WorldbookSelector** - 世界书选择器组件
  - 多选/单选模式
  - 搜索过滤
  - 条目计数显示

#### StorageManager 扩展
- Profile 隔离存储方法
  - `getProfileSettings(profileCode, defaults)`
  - `setProfileSettings(profileCode, settings)`
  - `switchProfile(newCode)`
  - `createProfile(code, name)`
  - `deleteProfile(code)`
  - `listProfiles()`
  - `getProfileKey(code, key)`

### Technical Details
- 新增文件：
  - `src/managers/DatabaseManager.js`
  - `src/managers/TableLogicManager.js`
  - `src/managers/PlotAdvanceManager.js`
  - `src/components/TabbedPanel.js`
  - `src/components/DatabaseVisualizer.js`
  - `src/components/ResponsiveGrid.js`
  - `src/components/WorldbookSelector.js`
- 更新依赖：
  - DatabaseVisualizer 依赖 DatabaseManager、StorageManager
  - TableLogicManager 依赖 DatabaseManager、StorageManager
  - PlotAdvanceManager 依赖 DatabaseManager、StorageManager

## [1.2.0] - 2026-02-27

### Added

#### API 预设管理 (Phase 5)
- **ApiPresetManager** - 多 API 预设管理器
  - 预设 CRUD 操作
  - 模块-预设绑定
  - 测试连接功能 (`testConnection`, `testConnectionFromConfig`)
  - 获取模型列表 (`fetchModels`, `fetchModelsFromConfig`)
  - 单例模式实现
  - IndexedDB 持久化存储

#### UI 组件升级
- **SidebarWindow** - 可拖拽侧边栏主窗口
  - 继承 DraggableWindow
  - API 预设管理面板（创建/编辑/删除/测试/获取模型）
  - 模块设置面板
  - 破限提示词编辑（保存到世界书）
  - 重置提示词到默认值
- **OptionsBarWindow** - 快捷选项独立窗口
  - 单例模式
  - 模块启用/禁用快速开关
  - 状态实时保存

#### 核心功能增强
- **Core.js** 新增工具内容提取方法
  - `extractToolContent(message, toolType)` - 从消息提取指定类型工具内容
  - `extractLastToolContent(beforeMsgId, toolType)` - 向前搜索最近工具内容
- **statusbar.js** 输出包裹 `<auxiliary_tool type="statusbar">` 标签
- **index.js** 初始化 ApiPresetManager

### Changed
- 移除 index.js 中的 auxiliary_tool 自动清理逻辑
- 模块输出需自行包裹 `<auxiliary_tool type="模块类型">` 标签
- `getLastStatus` 支持从 auxiliary_tool 标签提取内容
- UI 结构重构：侧边栏迁移至 SidebarWindow 组件

### Technical Details
- 新增文件：
  - `src/managers/ApiPresetManager.js`
  - `src/components/SidebarWindow.js`
  - `src/components/OptionsBarWindow.js`
- 更新依赖关系：
  - statusbar/plotOptions 新增 ApiPresetManager 依赖
  - SidebarWindow 依赖 DraggableWindow、ApiPresetManager、Core
  - OptionsBarWindow 依赖 DraggableWindow、Core

## [1.1.0] - 2026-02-27

### Added

#### 基础设施层 (Phase 1)
- **StorageManager** - 双存储策略管理器
  - 支持 extensionSettings + IndexedDB 双写
  - localStorage 降级支持
  - 单例模式实现
- **CollapsibleSection** - 可折叠内容区块组件
- **DynamicList** - 动态增删列表组件
- **ModalPopup** - 模态框组件
  - Toast 提示
  - ConfirmDialog 确认对话框

#### 窗口系统 (Phase 2)
- **WindowManager** - 窗口生命周期管理器
  - z-index 自动控制
  - 窗口状态持久化
  - 单例模式实现
- **DraggableWindow** - 可拖拽窗口组件
  - 拖拽移动
  - 缩放支持
  - 锚点定位 (center, top-left, top-right, bottom-left, bottom-right)
  - 状态持久化
  - 自定义样式

#### 模板管理器 (Phase 3)
- **TemplateManager** - 提示词模板管理器
  - 模板 CRUD 操作
  - 活动模板选择
  - JSON 导入/导出
  - World Book 同步
  - 单例模式实现

#### 模块升级 (Phase 4)
- **plotOptions.js** 模块升级
  - 集成 DraggableWindow 独立窗口
  - 集成 TemplateManager 模板管理
  - 添加模板选择/保存/导出功能
  - 添加独立设置窗口
- **statusbar.js** 模块升级
  - 集成 DraggableWindow 独立窗口
  - 集成 TemplateManager 模板管理
  - 添加模板选择/保存/导出功能
  - 添加独立设置窗口
  - 添加提取测试预览窗口

### Changed
- 架构从三层扩展为五层设计
  - 入口层 (index.js)
  - 核心层 (core.js)
  - 管理器层 (managers/)
  - 组件层 (components/)
  - 模块层 (modules/)
- 更新模块规范，支持模板管理和独立窗口

### Technical Details
- 构建产物大小：88.1kb (从 45.9kb 增加)
- 新增文件：
  - `src/managers/StorageManager.js`
  - `src/managers/TemplateManager.js`
  - `src/managers/index.js`
  - `src/components/WindowManager.js`
  - `src/components/DraggableWindow.js`
  - `src/components/CollapsibleSection.js`
  - `src/components/DynamicList.js`
  - `src/components/ModalPopup.js`
  - `src/components/index.js`

---

## [1.0.0] - 2026-02-26

### Added
- 初始版本发布
- **核心架构**
  - index.js 入口层
  - core.js 核心工具层
  - ui.js UI 渲染层
- **功能模块**
  - statusbar.js - 状态栏生成器
  - plotOptions.js - 剧情推进选项
- **共享 API 配置**
  - API 连接设置
  - 模块管理
- **世界书集成**
  - 自动创建「工具书」
  - 模板提示词同步
- **构建系统**
  - esbuild 打包
  - IIFE 格式输出
