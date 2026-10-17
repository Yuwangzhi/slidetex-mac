# SlideTeX for Mac

在 **PowerPoint / WPS 演示的顶部功能区**输入 LaTeX，预览并插入高清透明 PNG 公式。

<img src="docs/media/slidetex-poster.png" alt="SlideTeX 功能介绍示意图" width="440">

## 功能

- 独立的 **SlideTeX → LaTeX 公式**功能区按钮与编辑面板。
- LaTeX 实时预览；分式、求和、矩阵、分段、多行模板。
- 300／600／1200 DPI；8–96 pt；自定义公式颜色与透明／白色／深色背景。
- 图片按幻灯片中的实际字号插入，提高 DPI 不会把图片放大。
- 原始公式保存在 PNG 的 UTF-8 元数据中；在支持的宿主内也保留源码标签。
- WPS 支持读取选中公式、原位替换；最近 15 条公式保存在本机。
- **⌘ Enter** 插入；本地生成图片，公式不上传。

这是独立实现的 macOS 加载项，功能需求参考 [SlideSCI](https://github.com/Achuan-2/SlideSCI)。没有移植其 Windows VSTO 代码，与 SlideSCI、Microsoft 或 WPS 无隶属关系。

## 安装

要求：macOS、[Node.js 20.9+](https://nodejs.org/)、Python 3、PowerPoint for Mac 或支持 JS 加载项的 WPS for Mac。首次安装依赖需要网络；PNG 渲染在本机进行，不依赖 LaTeX / MacTeX。

1. 下载 [Releases](https://github.com/Yuwangzhi/slidetex-mac/releases) 的 ZIP，解压到一个长期保留的目录。
2. 双击 `安装.command`。如果系统询问终端执行权限，确认你正在运行自己下载并检查过的安装文件。
3. 按需确认本机证书：**PowerPoint 要求 HTTPS**，安装脚本会询问是否把本机生成的 `SlideTeX localhost` 证书加入登录钥匙串，信任范围为 `localhost` 的 SSL。macOS 可能要求 Touch ID 或密码。WPS 使用本机 HTTP，无需这项证书信任。
4. 重新打开幻灯片软件。**PowerPoint 首次打开包内的 `首次启用PowerPoint.pptx`**，看到顶部 SlideTeX 选项卡后，即可在自己的演示文稿中点击 **SlideTeX → LaTeX 公式**。也可从 **开始 → 加载项 → 开发人员加载项 → SlideTeX** 启用。WPS 直接使用顶部 SlideTeX 选项卡。

也可在终端安装：

```sh
npm ci --ignore-scripts
npm test
python3 scripts/install.py
# 仅当你确认允许添加本机证书信任，并需要 PowerPoint 时执行：
python3 scripts/setup_tls.py --trust
```

Node 后台服务通过当前用户 LaunchAgent 启动，登录时自动运行，仅监听 `127.0.0.1:32178/32179`。项目目录仍是运行目录，安装后请不要移动或删除；需要移动时，先卸载，再从新位置安装。

## 使用

```latex
\begin{aligned}
\mathcal{L} &= \mathcal{L}_{\mathrm{pred}} + \lambda\mathcal{L}_{\mathrm{reg}} \\
\theta_{t+1} &= \theta_t - \eta\nabla_{\theta}\mathcal{L}
\end{aligned}
```

建议从 **28 pt、600 DPI、透明背景**开始。字号决定幻灯片上的显示大小；DPI 决定像素数。放大到远高于原始显示尺寸时，PNG 仍受像素数限制。

支持 MathJax 的数学语法，不支持完整 `.tex` 文档、任意 LaTeX 宏包或 TikZ。插入的是图片；修改公式请从源码重新生成。

## 原理与兼容性

| 部分 | 实现 |
| --- | --- |
| PowerPoint 功能区 | Office Add-in XML manifest + Office.js |
| WPS 功能区 | WPS JS 加载项 `ribbon.xml` + TaskPane |
| 公式 | MathJax 3.2.2 SVG paths → sharp PNG |
| PNG 分辨率 | 实际像素尺寸 + pHYs DPI 元数据 |
| WPS 图片交接 | 由 WPS 在自己的临时目录写入 PNG，再嵌入文稿 |
| 运行 | 本机 Node 服务 + 当前用户 LaunchAgent |

PowerPoint 的 Office.js 由微软官方 CDN 提供，需要网络。WPS 插入后的图片会嵌入 PPTX，发送 PPTX 时无需附带临时 PNG。公式、使用历史及证书私钥均不发送到远程服务器。

这是一版可运行的本地加载项；它没有上架 Office/WPS 商店。每台 Mac 自行生成证书，仓库与发布包不包含任何证书私钥。

## 开发和验证

```sh
npm ci --ignore-scripts
npm test
node scripts/assets.mjs
npm start
# 浏览器仅预览 UI，不能模拟真实幻灯片宿主插入：
# http://localhost:32178/taskpane.html
```

实际验证结果和边界见 [VALIDATION.md](VALIDATION.md)。浏览器预览与单元测试不等价于 PowerPoint/WPS 插入实测。

日志：`~/Library/Logs/SlideTeX/`。日志只记录宿主、事件与错误消息，不记录 LaTeX 内容。配置备份：`~/Library/Application Support/SlideTeX/backups/`。

## 卸载

双击 `卸载.command`，或运行 `npm run uninstall:mac`。仅移除 SlideTeX 自己的功能区注册、LaunchAgent 和本机证书信任，不覆盖其他加载项。源码、配置备份、公式历史及已插入文稿的图片均保留。

## 依赖

[MathJax](https://github.com/mathjax/MathJax-src)（Apache-2.0）和 [sharp](https://github.com/lovell/sharp)（Apache-2.0）。依赖版本锁定在 `package-lock.json`；依赖本身保留其许可证。
