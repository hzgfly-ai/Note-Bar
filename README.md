# Note-Bar · 菜单栏便签

Note-Bar is a macOS-focused Obsidian menu-bar editor, based on [Pebble](https://github.com/pedrojreis/Pebble).

在菜单栏直接编辑 Obsidian 笔记。Obsidian 需要保持运行，但主窗口可以留在后台；切换应用、桌面或全屏应用时，速记面板保持打开，再次点击菜单栏图标保存并收起。

## 演示

<img src="images/note-bar-demo.png" alt="Note-Bar 菜单栏便签：Markdown 标题、强调和图片预览" width="460">

这是由 [hzgfly-ai](https://github.com/hzgfly-ai) 维护的 Pebble 衍生版本。原项目由 [Pedro Reis](https://github.com/pedrojreis) 开发，本仓库保留原项目的 Git 历史与 MIT 许可。本版本尚未上架 Obsidian 社区插件目录；目录中的 Pebble 是原作者维护的版本。

## 功能

- **菜单栏面板**：在其他应用中唤出编辑器，Obsidian 主窗口保持在后台。
- **Markdown 编辑**：基于 CodeMirror 6，淡化语法符号，支持标题、强调、代码、列表层级、悬挂缩进、Tab 缩进、回车续行与撤销。
- **选择笔记**：按文件夹层级选择，或搜索完整路径。
- **新建笔记**：跟随 Obsidian 的默认创建位置、命名与重名处理。
- **今日日记**：沿用核心「日记」插件的日期格式、目录、模板，已有日记直接打开。
- **全部复制**：复制当前完整的原始 Markdown，包括尚未自动保存的输入。
- **图片**：粘贴后存入 Obsidian 配置的附件位置，遵循 Wiki／Markdown 链接偏好；编辑器直接显示图片，通过右下角折线拖动缩放。尺寸保存到 Markdown，原始图片不变。
- **外观**：跟随 Obsidian 的浅色／深色主题，也可手动指定；提供 macOS 磨砂背景开关。
- **自动保存**：切换笔记与关闭面板前等待保存；保存失败时保留当前编辑内容。

## 兼容性与限制

- 当前以 macOS 桌面版为开发和验收目标，其他桌面平台尚未完成验证；不支持移动端。
- 最低 Obsidian 版本见 `manifest.json`，当前为 **1.13.0**。
- Obsidian 必须运行；完全退出后无法使用菜单栏面板。
- 新建笔记、日记和独立窗口使用了部分内部接口，Obsidian 升级后需要回归验证；接口不可用时会提示错误或禁用相关操作。
- 日记功能需要启用 Obsidian 核心「日记」插件。
- 单张粘贴图片上限为 32 MB。撤销插入不会删除已经保存的附件。
- 磨砂背景不等同于 Apple 原生 Liquid Glass；接口不可用时回退纯色。
- 本版本使用独立插件 ID `note-bar`，不覆盖原版 Pebble 的插件目录。首次安装需重新选择初始笔记和外观设置。

## 安装与开发

本仓库先公开源码，安装包发布信息以 [Note-Bar Releases](https://github.com/hzgfly-ai/Note-Bar/releases) 为准。不要从原项目的 Releases 下载并当作本版本。

从源码构建（建议 Node.js 24）：

```sh
npm ci
npm run build
npm test
npm run lint
```

将构建后的 `main.js`、`manifest.json` 和 `styles.css` 复制到：

```text
<你的仓库>/.obsidian/plugins/note-bar/
```

重新加载 Obsidian，在 **设置 → 第三方插件** 中启用「Note-Bar · 菜单栏便签」。通过插件设置选择初始笔记，再点击菜单栏图标打开面板。

发布安装包时应同时提供 `LICENSE` 和 `THIRD-PARTY-NOTICES.md`，以保留原项目及打包依赖的许可声明。

## 数据与网络

笔记和图片保存在当前 Obsidian 仓库，不上传到云服务，不包含遥测。编辑器代码随插件打包，不从 CDN 加载。

仓库内图片默认本地显示。网络图片默认不请求；点击「加载网络图片」后，浏览器才会访问图片链接所指向的服务器，该服务器会收到正常的图片请求。

## 许可与致谢

- 本项目继续使用 **MIT**，完整许可见 [LICENSE](LICENSE)。
- 原作者：**Pedro Reis / pedrojreis**；原项目：[Pebble](https://github.com/pedrojreis/Pebble)。
- 衍生版本维护者：[hzgfly-ai](https://github.com/hzgfly-ai)。
- 随编辑器打包的依赖许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
- 后续计划见 [ROADMAP.md](ROADMAP.md)。
