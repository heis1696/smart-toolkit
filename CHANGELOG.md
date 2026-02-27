# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
