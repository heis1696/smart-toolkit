# 背景
文件名：2026-02-27_1_shujuku-replication
创建于：2026-02-27_10:30:00
创建者：Claude
主分支：main
任务分支：task/shujuku-replication_2026-02-27_1
Yolo模式：Off

# 任务描述
全面模仿shujuku-main的功能和UI，采用混合重构策略：提取shujuku核心业务逻辑，使用STK现有UI组件体系重构。

核心目标：
1. 保留shujuku的所有功能特性（数据库可视化、填表逻辑、plot推进、worldbook选择等）
2. 使用STK的模块化架构（WindowManager、DraggableWindow、StorageManager）
3. 实现响应式UI设计，保持与shujuku相同的视觉效果
4. 确保代码可维护性和扩展性

# 项目概览
smart-toolkit：模块化的SillyTavern扩展框架，包含：
- 核心基础设施：core.js（设置管理、worldbook集成）、ui.js（共享API配置）
- 窗口系统：WindowManager.js、DraggableWindow.js、ModalPopup.js
- 存储管理：StorageManager.js（indexedDB + Tavern设置同步）
- 功能模块：plotOptions.js（剧情推进）、statusbar.js

shujuku-main：独立的酒馆插件，包含：
- ACU_WindowManager：独立窗口管理系统
- openAutoCardPopup_ACU：响应式弹出UI（网格布局、标签页系统）
- 填表逻辑：线性化CoAT工作流、审计追踪
- 数据库可视化：ACU_Visualizer_Refresh、实时数据同步
- Plot推进系统：循环提示生成、worldbook独立选择

⚠️ 警告：永远不要修改此部分 ⚠️
RIPER-5协议核心规则：
- 未经明确许可，不能在模式之间转换
- 必须在每个响应开头声明当前模式
- 在EXECUTE模式中，必须100%忠实遵循计划
- 在REVIEW模式中，必须标记即使最小的偏差
- 没有明确模式转换信号时，保持在当前模式
⚠️ 警告：永远不要修改此部分 ⚠️

# 分析
## shujuku-main核心功能映射

### 1. 窗口系统
- ACU_WindowManager → STK WindowManager + DraggableWindow
- injectACUWindowStyles → STK CSS变量系统
- 状态持久化 → StorageManager

### 2. 主弹出UI (openAutoCardPopup_ACU)
结构分解：
- 标签页系统（API设置、Prompt分段、Worldbook选择、Plot推进、数据库可视化）
- 响应式网格布局（breakpoints: ≤320px to ≤1100px）
- 按钮系统（保存、重置、执行）
- iOS输入缩放修复

### 3. 数据管理
- Profile存储（全局meta + 隔离码设置） → StorageManager扩展
- 酒馆设置fallback → Core.getSettings()
- 模板管理 → 新增TemplateManager

### 4. 核心功能
- callCustomOpenAI_ACU → Core.requestExtraModel()
- 填表逻辑（CoAT工作流） → 新增TableLogicManager
- ACU_Visualizer_Refresh → 新增DatabaseVisualizer组件

# 提议的解决方案

## 混合重构策略

### 阶段1：基础设施扩展
1. 扩展StorageManager支持profile隔离存储
2. 创建DatabaseManager处理数据可视化后端逻辑
3. 创建TemplateManager管理提示模板

### 阶段2：UI组件开发
1. 创建TabbedPanel组件（复用shujuku标签页逻辑）
2. 创建DatabaseVisualizer组件（可视化界面）
3. 创建ResponsiveGrid组件（响应式布局）

### 阶段3：功能模块实现
1. 重构PlotOptionsModule集成shujuku plot推进设置
2. 创建TableLogicModule实现填表逻辑
3. 创建WorldbookSelectorModule实现worldbook选择

### 阶段4：主入口整合
1. 创建ShujukuModule作为主入口
2. 整合所有子模块
3. 实现菜单注册和触发逻辑

# 当前执行步骤："0. 规划阶段"

# 任务进度
[2026-02-27 10:30:00]
- 创建任务文件
- 开始详细规划

# 最终审查
[待完成后填写]
