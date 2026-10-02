# 构建与发布

## 本地开发

使用 Node.js 22 和 npm，在项目目录执行：

```powershell
npm ci
npm run dev
```

每位用户在应用设置中填写自己的模型配置。设置和会话数据位于 Electron 的用户数据目录；Windows 上为 `%APPDATA%/paper-polish/`。`config.json` 包含用户填写的 API key，应作为私密文件保存。默认源码和安装包不包含已配置的账号。

## GitHub 仓库内容

| 内容 | 用途 |
| --- | --- |
| `src/`、`resources/` | 应用源码与图标 |
| `scripts/`、构建配置、`package.json`、`package-lock.json` | 开发、检查和可复现安装 |
| `README.md`、`README.zh.md`、`docs/` | 产品图、产品说明、发布说明 |
| `.github/`、`.gitignore`、`.gitattributes` | 持续检查、发布工作流与归档规则 |

`.gitignore` 排除依赖、构建产物、数据库、运行配置、环境密钥、调试日志、备份、会话导出目录和本地工作记录。便携版通过 Releases 附件分发。

`npm run privacy:check` 检查 Git 实际会提交的文件，包括已被跟踪但后来添加到忽略规则的文件。没有 Git 仓库时，也会按 `.gitignore` 计算候选文件。检查只报告文件名、行号和问题类型，不输出密钥值。

## 本地发布附件

在 Windows x64 上执行：

```powershell
npm ci
npm run test:privacy
npm run build:win
npm run release:prepare
```

打包后检查会扫描应用 ASAR 及其解包的原生模块，验证版本和敏感内容。`release/assets/v0.1.0/` 包含：

- `PaperPolish-1.0.0-portable.exe`
- `PaperPolish-v0.1.0-source.zip`
- `PaperPolish-v0.1.0-source.tar.gz`
- `SHA256SUMS.txt`

应用内部版本来自 `package.json`，为 `0.1.0`。仅首次发布使用约定的 `1.0.0` 便携版文件名；后续发布文件名跟随应用版本。

## 首次上传与自动发布

先在 GitHub 创建空仓库。使用已配置好的 Git 身份；希望隐藏个人邮箱时，可在 GitHub 邮箱设置中查看并使用自己的 noreply 地址。

```powershell
git init -b main
npm run privacy:check
git add .
git diff --cached --stat
npm run privacy:check
git commit -m "Release PaperPolish v0.1.0"
git remote add origin <YOUR_REPOSITORY_URL>
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

推送标签后，`Publish release` 工作流会在 Windows 上安装依赖、运行隐私检查、编译打包、生成源码归档与校验值，然后创建 **PaperPolish v0.1.0** Release。说明正文来自 `docs/releases/v0.1.0.md`。不需要为工作流配置模型 API key；发布使用 GitHub 自动提供的工作流令牌。

也可以在 Actions 中手动运行该工作流，输入已有标签。工作流要求标签与应用版本一致，并拒绝覆盖已有 Release。如果上传中断，检查可能留下的草稿后再处理。

GitHub 自动为每个 Release 提供标签对应的源码 ZIP / TAR.GZ，详见 [GitHub Releases 文档](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。

## 手动发布

在仓库的 Releases 页面选择创建新版本，选择 `v0.1.0` 标签，标题填写 `PaperPolish v0.1.0`，粘贴 `docs/releases/v0.1.0.md` 的正文并上传 `release/assets/v0.1.0/` 内的四个文件，然后发布。
