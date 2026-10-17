/* Host adapters: all presentation mutations stay inside the host's supported APIs. */
(() => {
  const query = new URLSearchParams(location.search);
  const mode = query.get('host') || (location.pathname.startsWith('/wps/') ? 'wps' : 'browser');
  const key = 'SLIDETEX_SOURCE';
  const diagnostic = (event, message = '') => fetch('/api/diagnostic', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: mode, event, message }),
  }).catch(() => {});
  let loadedTarget = null;
  const wpsApp = () => window.Application || (window.wps && (window.wps.Application || window.wps));
  function sourceOf(shape) {
    const text = shape.AlternativeText || '';
    if (!text.startsWith('SlideTeX:')) throw new Error('请先选中由 SlideTeX 插入的公式图片。');
    return JSON.parse(text.slice('SlideTeX:'.length));
  }
  async function officeReady() {
    await new Promise((resolve, reject) => {
      if (window.Office) return resolve();
      const script = document.createElement('script');
      script.src = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Office 组件加载失败，请检查网络后重新打开面板。'));
      document.head.appendChild(script);
    });
    await Office.onReady();
    if (Office.context.host !== Office.HostType.PowerPoint) throw new Error('请在 PowerPoint 中打开此加载项。');
  }
  window.SlideTeXHost = {
    mode,
    async ready() {
      if (mode === 'office') await officeReady();
      if (mode === 'wps' && !wpsApp()) throw new Error('请从 WPS 顶部的 SlideTeX 按钮打开面板。');
      diagnostic('ready');
      return { label: mode === 'office' ? 'PowerPoint' : mode === 'wps' ? 'WPS 演示' : '浏览器预览', canInsert: mode !== 'browser' };
    },
    async insert(result, replace) {
      const source = JSON.stringify({ version: 1, ...result.settings });
      if (mode === 'wps') {
        const app = wpsApp();
        if (!app.ActivePresentation) throw new Error('请先打开演示文稿并选中一张幻灯片。');
        const slide = app.ActiveWindow.View.Slide;
        if (!slide) throw new Error('请切换到普通编辑视图并选中一张幻灯片。');
        let width = result.widthPt, height = result.heightPt;
        const maxW = app.ActivePresentation.PageSetup.SlideWidth * .86;
        const maxH = app.ActivePresentation.PageSetup.SlideHeight * .86;
        const scale = Math.min(1, maxW / width, maxH / height);
        width *= scale; height *= scale;
        let left = (app.ActivePresentation.PageSetup.SlideWidth - width) / 2;
        let top = (app.ActivePresentation.PageSetup.SlideHeight - height) / 2;
        let old = null;
        if (replace) {
          if (!loadedTarget || loadedTarget.slide !== slide.SlideID) throw new Error('请先读取本页要替换的公式。');
          old = slide.Shapes.Item(loadedTarget.name);
          sourceOf(old);
          left = old.Left; top = old.Top;
        }
        // WPS for Mac is sandboxed. Have WPS write the image into its own
        // temporary directory instead of passing it a path owned by Node.
        const fs = app.FileSystem || (window.wps && window.wps.FileSystem);
        const env = app.Env || (window.wps && window.wps.Env);
        if (!fs || !env) throw new Error('当前 WPS 缺少图片文件接口，请升级 WPS 后重试。');
        const temp = env.GetTempPath();
        const imagePath = temp.replace(/[\\/]+$/, '') + '/SlideTeX-' + result.id + '.png';
        fs.writeAsBinaryString(imagePath, atob(result.base64));
        if (!fs.Exists(imagePath)) throw new Error('WPS 无法保存公式图片，请重新打开面板后重试。');
        const countBefore = slide.Shapes.Count;
        let shape = slide.Shapes.AddPicture(imagePath, 0, -1, left, top, width, height);
        if (!shape && slide.Shapes.Count > countBefore) shape = slide.Shapes.Item(slide.Shapes.Count);
        if (!shape) throw new Error('WPS 未能插入图片，请重新尝试。');
        shape.Name = `SlideTeX_${Date.now()}`;
        shape.AlternativeText = `SlideTeX:${source}`;
        if (old) old.Delete();
        shape.Select();
        loadedTarget = { slide: slide.SlideID, name: shape.Name };
      } else if (mode === 'office') {
        if (replace) throw new Error('PowerPoint 当前版本请插入新公式，再删除旧公式。');
        let previous = null;
        try {
          previous = await PowerPoint.run(async context => {
            const slides = context.presentation.getSelectedSlides();
            slides.load('items/id'); await context.sync();
            if (slides.items.length !== 1) return null;
            const slide = slides.items[0];
            slide.shapes.load('items/id'); await context.sync();
            return { slide: slide.id, ids: slide.shapes.items.map(s => s.id) };
          });
        } catch (error) { diagnostic('metadata-preflight-unavailable', error.message); }
        await new Promise((resolve, reject) => {
          Office.context.document.setSelectedDataAsync(result.base64, {
            coercionType: Office.CoercionType.Image,
            imageWidth: result.widthPt, imageHeight: result.heightPt,
          }, response => response.status === Office.AsyncResultStatus.Succeeded ? resolve() : reject(new Error(response.error.message)));
        });
        // Metadata is an enhancement: failure must never cause a second insertion.
        try {
          await PowerPoint.run(async context => {
            const shapes = context.presentation.getSelectedShapes();
            shapes.load('items');
            await context.sync();
            let target = null;
            if (previous) {
              const slides = context.presentation.getSelectedSlides();
              slides.load('items/id'); await context.sync();
              if (slides.items.length === 1 && slides.items[0].id === previous.slide) {
                const all = slides.items[0].shapes;
                all.load('items/id'); await context.sync();
                const inserted = all.items.filter(s => !previous.ids.includes(s.id));
                if (inserted.length === 1) target = inserted[0];
              }
            }
            if (target) {
              target.tags.add(key, source);
              target.name = `SlideTeX_${Date.now()}`;
              await context.sync();
            }
          });
        } catch (error) { diagnostic('metadata-unavailable', error.message); }
      } else throw new Error('请从 PowerPoint 或 WPS 的功能区打开加载项。');
      diagnostic('inserted');
    },
    async loadSelected() {
      if (mode === 'wps') {
        const app = wpsApp();
        const shapes = app.ActiveWindow.Selection.ShapeRange;
        if (shapes.Count !== 1) throw new Error('请只选中一张公式图片。');
        const shape = shapes.Item(1);
        const source = sourceOf(shape);
        loadedTarget = { slide: app.ActiveWindow.View.Slide.SlideID, name: shape.Name };
        return source;
      }
      if (mode === 'office') return PowerPoint.run(async context => {
        const shapes = context.presentation.getSelectedShapes();
        shapes.load('items');
        await context.sync();
        if (shapes.items.length !== 1) throw new Error('请只选中一张 SlideTeX 公式图片。');
        const tag = shapes.items[0].tags.getItemOrNullObject(key);
        tag.load('value'); await context.sync();
        if (tag.isNullObject) throw new Error('选中的图片没有 SlideTeX 公式源码。');
        return JSON.parse(tag.value);
      });
      throw new Error('请在 PowerPoint 或 WPS 中使用。');
    },
    async savePng(result) {
      if (mode === 'wps') {
        const app = wpsApp();
        const dialog = app.FileDialog(2);
        dialog.Title = '导出 SlideTeX 公式 PNG';
        dialog.InitialFileName = app.Env.GetDownloadPath().replace(/[\\/]+$/, '') + `/SlideTeX-${result.settings.dpi}dpi.png`;
        if (dialog.Show() !== -1) return false;
        let path = dialog.SelectedItems.Item(1);
        if (!/\.png$/i.test(path)) path += '.png';
        const fs = app.FileSystem;
        fs.writeAsBinaryString(path, atob(result.base64));
        if (!fs.Exists(path)) throw new Error('PNG 未能保存，请选择可写入的位置。');
        return true;
      }
      if (mode === 'office' && Office.context.ui.openBrowserWindow) {
        Office.context.ui.openBrowserWindow(location.origin + `/api/images/${result.id}.png?download=1`);
        return true;
      }
      const a = document.createElement('a');
      a.download = `SlideTeX-${result.settings.dpi}dpi.png`;
      a.href = `data:image/png;base64,${result.base64}`; a.click();
      return true;
    },
    diagnostic,
  };
})();
