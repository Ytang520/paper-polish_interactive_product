# PaperPolish

[下载 Windows 便携版](https://github.com/Ytang520/paper-polish_interactive_product/releases/tag/v0.1.0)

[English](README.md) · [v0.1.0 发布说明](docs/releases/v0.1.0.md) · [构建与发布](docs/RELEASING.md)

![PaperPolish 交互式论文打磨工作台](docs/assets/paperpolish-product-intro.png)

PaperPolish 是一个面向论文打磨场景的桌面应用，目标是在一个统一工作空间中整合写作工作流、模型配置与多轮迭代打磨能力，服务于学术与专业写作场景。

## 项目概览

PaperPolish 的长期目标是成为一个：

- all-in-one 的 paper polishing 平台
- 支持多操作系统运行的桌面应用
- 内置 agent 系统的智能写作工具
- 最终支持用户通过一句自然语言指令，自定义组件、布局和轻量功能的平台

也就是说，这个产品的目标不仅是“把文本打磨好”，而是逐步发展成一个可扩展、可定制、适配更多真实场景的写作工作台。

## 工作流

当前版本的完整工作流如下：

1. 新建会话
2. 在输入编辑区粘贴或编写原始文本
3. 配置作用域、模式、模型、输出语言与相关选项
4. 点击 `开始打磨` 发起当前轮次
5. 如有需要，点击 `强制停止` 中断当前生成，并保留已输出的部分结果
6. 查看输出结果、要点提取、术语、参考文库以及可选的 Ultra 迭代结果
7. 点击 `打磨完毕` 或使用 `Ctrl+Enter` 进入下一轮打磨会话
8. 若对当前结果不满意，可使用 `重新生成`，基于相同输入和配置再次请求输出

此外，应用内还提供了 Help 视图，其中的 `workflow` 选项会以可视化方式展示这一整体流程。

## 当前已支持的功能

PaperPolish 当前已经支持：

- 多会话论文打磨，以及会话历史与文件夹管理
- 词汇级、句子级、段落级打磨流程
- 润色模式与段落生成模式
- 要点提取与结构化后续要求管理
- 术语支持，包括专业术语库与本文术语库
- 参考文章管理与基于 embedding 的检索支持
- Ultra 模式下的生成器-评估器自动迭代
- 各模块独立模型配置、输出语言设置与自定义 Prompt
- 会话、文件夹与设置在重启后的持久化保留
- GitHub Copilot 本地 provider 集成，以及标准 OpenAI-compatible provider 支持
- 内置 Help 工作流说明视图，便于理解产品使用方式

## 快速开始

### 方式一：直接使用内置 provider

1. 启动应用
2. 打开设置，填写自己的模型服务地址、API key 和模型；默认密钥为空
3. 新建会话，在输入区粘贴文本
4. 选择合适的作用域、模式、模型与选项
5. 开始打磨

### 方式二：使用 Copilot 反向代理（可选）

如果你希望使用基于 GitHub Copilot 的本地 provider，可以先配置 Copilot 反向代理。

- 参考项目： https://github.com/ericc-ch/copilot-api

完成后，直接启动应用并正常使用即可。

## 配置与文件位置

### Settings、API key 与 base URL

持久化运行设置会保存在 Electron 的 user-data 目录中，对应文件为 `config.json`。

在 Windows 上，典型路径为：

`%APPDATA%/paper-polish/config.json`

该文件会保存：

- 各模块的 `base_url`
- 各模块的 `api_key`
- 模型参数
- 自定义 Prompt 覆盖项
- 界面相关的持久化设置

对于内置管理的 GitHub Copilot provider，应用使用：

- 固定 base URL：`http://localhost:8070/v1`
- 本地 token 文件：`%USERPROFILE%/.local/share/copilot-api/github_token`

### Prompt 文件位置

默认内置 Prompt 定义在：

- `src/renderer/src/prompts/index.ts`

更具体地说：

- 所有默认 workflow prompts 都定义在 `src/renderer/src/prompts/index.ts` 内的 `DEFAULT_PROMPTS` 对象中
- Prompt 解析函数是 `src/renderer/src/prompts/index.ts` 中的 `getPrompt(...)`
- 用户在界面里修改自定义 Prompt 的入口位于 `src/renderer/src/components/SettingsModal.tsx`
- 用户自定义后的 Prompt 内容会保存在 `config.json` 的 `customPrompts` 字段中

## 未来路线图

### 用户体验

- 更完善地支持不同操作系统
- 提供视频介绍与教程说明
- 让产品在视觉与交互层面更加简洁、美观、直观

### 功能能力

- 支持 paper polishing 工作流的可视化与自定义，整体体验参考 Dify 一类平台
- 支持用户通过一句话驱动平台改动，包括布局调整与轻量功能扩展

### 模型层

- 训练专门面向 paper polishing 的 LLM
- 训练专门服务于本应用功能开发的 agent

## 技术基础

PaperPolish 是一个基于 Electron 的桌面应用，结合了现代 TypeScript 与 React 界面、本地持久化存储、可配置的 OpenAI-compatible 模型后端，以及面向工作流的写作辅助能力。

## 致谢

本应用在开发过程中使用了 [OpenCode](https://github.com/anomalyco/opencode)，尤其是 [OMO](https://github.com/code-yeongyu/oh-my-openagent)。

特别感谢他们。
