# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
