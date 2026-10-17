# 0.1.0 验证记录

日期：2026-10-17（Asia/Shanghai）。本机：Apple Silicon、macOS 26.6、Node.js 26.3.0、PowerPoint 16.114、WPS 12.1.29166。

## 真实宿主验证

- **WPS**：顶部出现 SlideTeX 选项卡，打开真实编辑面板，实时预览 `E=mc^2`。首次测试发现把 Node 临时图片路径交给 WPS 会插入失败；改成由 WPS 在自己的临时目录写入图片后，实际插入成功，截图中可见选中的公式图片。不是仅浏览器模拟。
- **PowerPoint**：本机 localhost SSL 证书经用户同意加入登录钥匙串，`security verify-cert` 校验通过。HTTPS 服务实际可访问。
- **PowerPoint**：微软官方 manifest 校验器报告 `The manifest is valid`。首次从快捷加载项列表启用在本机无响应；打开由微软官方 task-pane 模板生成的首次启用文稿后成功激活。随后实际点击顶部 **SlideTeX → LaTeX 公式** 重新打开面板成功。
- **PowerPoint**：实际插入 `E=mc^2` 与 `aligned` 多行公式，界面提示已插入，幻灯片和缩略图中可见公式。
- 保存真实 PPTX 后检查压缩包：两张嵌入 PNG 分别是 **948 × 276** 与 **2085 × 598**，均保留 **600 DPI** 和 PNG 内嵌源码。多行公式的 `SLIDETEX_SOURCE` 标签也保存在 PPTX 中。记录见 `validation/powerpoint-pptx-inspection.json`。
- 从首次启用文稿切换到另一份普通演示文稿后，顶部 SlideTeX 选项卡仍可用，并可打开已连接 PowerPoint 的面板。

## 自动检查

`npm test`：9 个测试通过，包括透明通道、DPI、像素和显示尺寸分离、PNG 源码、分式/矩阵/分段/多行、自定义宏隔离、错误 LaTeX、白色公式、WPS 沙箱交接和替换失败保留原图。

`node --check` 检查前端和宿主脚本；Python 安装脚本通过语法检查。

## 使用边界

- 在上述两款真实 Mac 客户端完成验证；未在独立 Intel Mac、其他 macOS 或其他 Office/WPS 版本上完成端到端测试。
- 这是本地侧载加载项，没有在 Office/WPS 商店上架。
- 支持 MathJax 数学语法，不承诺任意 LaTeX 宏包、完整文档或 TikZ。
- 插入为 PNG，不能当作 Office 原生公式直接编辑。WPS 原位替换有回归测试；PowerPoint 修改源码后插入新图。
- 提高 DPI 不会增加插入时的显示尺寸，但大幅放大 PNG 仍会受到像素数限制。
- 未在本轮更改 Power Management 的电源策略；其 GitHub 公开操作与 SlideTeX 互不依赖。
