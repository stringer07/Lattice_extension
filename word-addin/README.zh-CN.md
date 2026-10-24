# Lattice Word 插件

[English](./README.md)

![Lattice Word 插件演示](./demo/demo.png)

这个插件允许你在 Microsoft Word 里直接搜索 Lattice 文库、插入引用占位符，并在文档中生成格式化的引文和参考文献。

当前实现是一个由 Lattice 本地托管的 Office Add-in。它通过 `127.0.0.1` 上的 Lattice Local API 通信，并在 macOS 上将插件安装到本地 Word 容器中。

## 环境要求

- Lattice `> 1.2`
- 已在 Lattice 中启用 Local API
- 支持 `WordApi 1.4` 的 Microsoft Word
- 当前仓库内的安装脚本面向 macOS

## 插件功能

- 按标题、作者、年份或 citekey 搜索 Lattice 文库
- 当搜索框为空时显示最近文献
- 在当前 Word 光标位置插入引用占位符
- 使用 CSL 生成格式化引文和参考文献
- 内置两种引文样式：
  - `IEEE Numeric`
  - `APA 7th`
- 支持加载自定义 CSL 文件
- 支持多篇文献组成引文组，按照所选 CSL 样式合并连续编号
- 将引文元数据、组内文献关联和样式选择持久化保存到当前 Word 文档中

## 工作原理

这个插件依赖 Lattice Local API 和本地插件托管能力。

当前使用的 API 端点如下：

- `GET /api/v1/status`
- `GET /api/v1/search?q=...&limit=...`
- `GET /api/v1/papers/:id`

插件网页资源通过以下本地地址加载：

- `http://127.0.0.1:<port>/plugins/word-addin/...`

端口规则如下：

- 安装脚本会自动从 macOS defaults 键 `com.aurelian.Lattice:citationBridgePort` 读取端口
- 如果没有保存的端口，则默认使用 `29467`
- 正常使用时不需要手动指定端口
- 如果之后 Local API 端口发生变化，需要先卸载再重新安装 Word 插件，让 manifest 指向新的本地地址

由于采用了这种架构，所以在以下场景中必须保持 Lattice 正在运行：

- Word 插件连接 Lattice
- 搜索文库
- 拉取论文元数据
- 刷新引文与参考文献

## 安装方式

先下载发布包：

- Release 页面：
  `https://github.com/stringer07/Lattice_extension/releases/tag/word-addin-v1.1`
- 当前 zip 直链：
  `https://github.com/stringer07/Lattice_extension/releases/download/word-addin-v1.1/Lattice-Word-Addin-macOS-1.1.zip`

安装步骤：

1. 至少先启动一次 Lattice。
2. 在 Lattice 中启用 Local API。
3. 保持 Lattice 处于运行状态。
4. 下载 `Lattice-Word-Addin-macOS-1.1.zip`。
5. 解压下载得到的 zip 文件。
6. 打开解压后的 `Lattice-Word-Addin-macOS-1.1/word-addin/` 文件夹。
7. 双击 `install.command` 运行安装脚本。

如果你更习惯命令行，也可以执行：

```bash
cd Lattice-Word-Addin-macOS-1.1/word-addin
./install.command
```

如果 macOS 阻止脚本运行，可以在 Finder 中右键 `install.command`，选择“打开/Open”，然后再次确认打开。

安装完成后：

1. 完全退出 Microsoft Word。
2. 重新打开 Word。
3. 在 Word 的 `开始/Home` -> `加载项` 区域中打开 `Lattice`。

## 使用方法

1. 打开一个 Word 文档。
2. 点击 `开始/Home` -> `加载项`，然后打开 `Lattice`。
3. 等待连接状态徽标显示 Lattice 的应用版本号。
4. 按标题、作者、年份或 citekey 搜索文献。
5. 点击某条结果，在当前光标位置插入引用占位符。
6. 选择引文样式，或加载一个自定义 CSL 文件。
7. 点击 `Update Citations & Bibliography`。

点击更新后，会执行以下操作：

- 扫描文档中的 Lattice 引用控件
- 通过 Local API 补全缺失的文献元数据
- 按文档中的引用顺序重新渲染引文
- 相邻引文转换为一个不嵌套的引文组；旧控件之间可以用空格、逗号、分号分隔，但不会跨正文、段落或其他控件合并
- 整组交由 CSL 处理排序、标点和可选的连续编号合并：支持范围压缩的样式可以显示 `[1–4, 6]`，不支持的样式仍逐项列出。内置 IEEE 保留原始 CSL 规则（`[1], [2], [3], [4]`）；需要范围时，请加载含 `<citation collapse="citation-number">` 的自定义 CSL
- 在文档末尾插入或更新受管理的参考文献区块；一次性删除所有引文后再更新，会移除该区块，不影响手写的参考文献

光标位于已有 Lattice 引文或引文组内时，新引文会插入到该框之后，插入后光标停在新框外；再次更新即可将新文献纳入相邻的引文组，无需拖拽。引文组是一个完整的受管理字段：如需删除组内某篇文献，请删除该组并重新插入需要的文献，不要直接修改显示的数字。如果之前的编辑已经造成控件嵌套，更新会提示并停止，避免覆盖内容；请先将嵌套的引文框分开后再更新。

组内关联保存在文档的 Custom XML 存储中（`citationGroups`，schema version 1 的新增可选字段）。新组控件使用 `lattice-citation-group:v1:<uuid>` 标签，仍可读取旧的 `lattice-citation:v1:<paper-uuid>` 控件。范围中未显示的中间文献也会保留在参考文献中。组记录创建后不覆盖，删除或扩展组后也保留历史记录，以支持撤销以及文档内复制的控件；组元数据缺失时会停止更新，不会根据显示的数字猜测或清空参考文献。含引文组的文档请继续使用新版插件，旧版不识别新组控件。

## 开发验证

在 `word-addin/` 目录使用 Node.js 22 或更高版本运行无需安装依赖的回归测试：

```bash
node --test tests/*.test.mjs
```

`tests/browser-check.html` 用真实浏览器 DOM 验证内置 CSL 引擎。通过 HTTP 托管本目录，并将 `/plugins/word-addin/` 映射到 `web/` 后即可打开该测试页。

Word 冒烟测试：先用正文或段落隔开地引用至少 12 篇不同文献，再在后文按 8、6、4、12 的顺序相邻插入重复引文，更新后应在一个组框内按 4、6、8、12 排列，再次更新结果不变，正文隔开的引文不移动。使用支持范围的 CSL，在同一处引用 1、2、3、4、6，应显示 `[1–4, 6]` 且参考文献保留全部五篇。检查切换到不压缩的 CSL 再切回、保存重开、文档内复制粘贴引文组、追加文献、撤销后更新。再验证部分删除和一次性全部删除后的参考文献缩减与清空。跨文档复制需要同时携带 Custom XML 元数据，不能只凭显示的范围自动恢复文献。

试用源码修改时，请重新运行本工作副本的 `install.command`，然后完全退出并重开 Word。已发布的 zip 安装包不会自动重新打包。

## 发布打包

产品版本 **1.1** 对应 Office manifest 版本 **1.1.0.0**。更新内容及文档兼容性说明见 [CHANGELOG.md](./CHANGELOG.md)。

在源码工作副本中执行：

```bash
./release/package-word-addin.sh 1.1
```

输出文件为 `release/Lattice-Word-Addin-macOS-1.1.zip`，仅包含 Word 插件、源代码资源、测试及许可声明。发布产物不提交到 Git，而是上传到 Word 插件对应的 GitHub Release。

## 卸载方式

1. 退出 Microsoft Word。
2. 打开之前解压得到的 `Lattice-Word-Addin-macOS-1.1/word-addin/` 文件夹。
3. 双击 `uninstall.command`。

如果你更习惯命令行，也可以执行：

```bash
cd Lattice-Word-Addin-macOS-1.1/word-addin
./uninstall.command
```

4. 重新打开 Word。

卸载会删除以下内容：

- 复制到 Lattice 容器中的插件文件
- 安装到 Word 本地 `wef` 目录中的 manifest 文件

如果是因为 Lattice Local API 端口发生变化，需要先按这个流程卸载，再重新运行 `./install.command` 安装一次。

## 贡献

欢迎提交 PR。

欢迎的内容不只限于 Word 插件本身，也包括：

- 改进 `word-addin`
- 提交新的、基于 Lattice Local API 的插件
- 改进安装流程
- 改进引文渲染与样式支持
- 增加脚注或尾注支持
- 为 Local API 插件补充文档、测试和示例

如果你准备提交 PR，建议在说明中包含：

- 这个改动解决了什么问题
- 是否引入了新的 Local API 假设或端点变更
- 是否需要额外的安装说明或迁移说明
- 用户可见行为的手动测试步骤

如果你正在基于 Local API 开发一个新插件，这个仓库也很适合作为贡献入口。
