(() => {
  const $ = id => document.getElementById(id);
  const templates = {
    fraction: String.raw`\frac{\partial \mathcal{L}}{\partial \theta} = \frac{1}{N}\sum_{i=1}^{N} \nabla_{\theta}\ell_i`,
    sum: String.raw`\hat{y}_{t+h} = \sum_{k=1}^{K} \alpha_k\,f_k(\mathbf{x}_{1:t})`,
    matrix: String.raw`\mathbf{A} = \begin{bmatrix} a_{11} & a_{12} \\ a_{21} & a_{22} \end{bmatrix}`,
    cases: String.raw`f(x) = \begin{cases} x^2, & x \ge 0 \\ -x, & x < 0 \end{cases}`,
    aligned: String.raw`\begin{aligned} \mathcal{L} &= \mathcal{L}_{\mathrm{pred}} + \lambda\mathcal{L}_{\mathrm{reg}} \\ \theta_{t+1} &= \theta_t - \eta\nabla_{\theta}\mathcal{L} \end{aligned}`,
  };
  let result = null, timer, revision = 0, hostReady = false, actionBusy = false;
  const storage = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  let history = storage.get('slidetex-history', []);
  const settings = () => ({ latex: $('latex').value, fontSize: Number($('fontSize').value), dpi: Number($('dpi').value), color: $('color').value, background: $('background').value, display: $('display').checked });
  function message(text, type = '') { $('message').textContent = text; $('message').className = `message ${type}`; }
  function updateButtons() {
    $('insert').disabled = !result || !hostReady || actionBusy;
    $('download').disabled = !result || actionBusy;
  }
  function apply(input) {
    for (const id of ['latex', 'fontSize', 'dpi', 'color', 'background']) if (input[id] !== undefined) $(id).value = input[id];
    if (input.display !== undefined) $('display').checked = input.display;
    schedule();
  }
  function schedule() {
    clearTimeout(timer); revision++; result = null; updateButtons();
    storage.set('slidetex-settings', settings());
    $('preview-state').textContent = '等待更新';
    timer = setTimeout(() => render(revision), 300);
  }
  async function render(version) {
    document.body.classList.add('busy'); $('preview-state').textContent = '正在生成…';
    const input = settings();
    try {
      const response = await fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      if (version !== revision) return;
      result = next;
      const img = new Image(); img.src = `data:image/png;base64,${result.base64}`;
      img.alt = `公式预览：${result.settings.latex}`;
      img.style.width = `${result.widthPt * 96 / 72}px`;
      $('preview').replaceChildren(img);
      $('preview').className = `preview ${input.background === 'transparent' ? 'checker' : ''} ${input.background === 'dark' || (input.background === 'transparent' && input.color.toLowerCase() === '#ffffff') ? 'dark' : ''}`;
      $('dimensions').textContent = `${result.width} × ${result.height} px · ${input.dpi} DPI · ${input.fontSize} pt`;
      $('preview-state').textContent = '已更新';
      storage.set('slidetex-settings', input);
      message(hostReady ? '准备就绪，可以插入公式。' : '可导出 PNG；插入功能请在幻灯片软件中使用。');
    } catch (error) {
      if (version !== revision) return;
      result = null;
      $('preview-state').textContent = '需要修改';
      $('preview').replaceChildren(Object.assign(document.createElement('span'), { className: 'placeholder', textContent: '修改公式后，预览会自动更新' }));
      message(error.message, 'error');
    } finally { if (version === revision) { document.body.classList.remove('busy'); updateButtons(); } }
  }
  function refreshHistory() {
    $('history').replaceChildren(...history.map(input => {
      const button = document.createElement('button'); button.textContent = input.latex; button.title = input.latex; button.onclick = () => apply(input); return button;
    }));
    if (!history.length) $('history').textContent = '插入或导出后，公式会保存在这里。';
  }
  function remember(input) {
    history = [input, ...history.filter(h => h.latex !== input.latex)].slice(0, 15);
    storage.set('slidetex-history', history); refreshHistory();
  }
  async function insert() {
    if (!result || !hostReady || actionBusy) return;
    const current = result;
    actionBusy = true; updateButtons(); message('正在插入…');
    try {
      await SlideTeXHost.insert(current, $('replace').checked);
      remember(current.settings); message('已插入高清 PNG。', 'success');
    } catch (error) { message(error.message, 'error'); SlideTeXHost.diagnostic('insert-error', error.message); }
    finally { actionBusy = false; updateButtons(); }
  }
  for (const id of ['latex', 'fontSize', 'dpi', 'color', 'background', 'display']) $(id).addEventListener('input', schedule);
  $('templates').addEventListener('click', event => { const text = templates[event.target.dataset.template]; if (text) apply({ latex: text }); });
  $('clear').onclick = () => { $('latex').value = ''; schedule(); $('latex').focus(); };
  $('black').onclick = () => apply({ color: '#111827' }); $('white').onclick = () => apply({ color: '#ffffff' });
  $('insert').onclick = insert;
  $('load').onclick = async () => {
    try { apply(await SlideTeXHost.loadSelected()); message('已读取选中公式，可以编辑后重新插入。', 'success'); }
    catch (error) { message(error.message, 'error'); }
  };
  $('download').onclick = async () => {
    if (!result || actionBusy) return;
    const current = result; actionBusy = true; updateButtons();
    try {
      const saved = await SlideTeXHost.savePng(current);
      if (saved) { remember(current.settings); message(SlideTeXHost.mode === 'office' ? '已在默认浏览器中开始 PNG 下载。' : 'PNG 已导出。', 'success'); }
      else message('已取消 PNG 导出。');
    } catch (error) { message(error.message, 'error'); }
    finally { actionBusy = false; updateButtons(); }
  };
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); insert(); }
    if (event.target === $('latex') && event.key === 'Tab') { event.preventDefault(); $('latex').setRangeText('  ', $('latex').selectionStart, $('latex').selectionEnd, 'end'); schedule(); }
  });
  SlideTeXHost.ready().then(info => {
    $('host').textContent = info.label; hostReady = info.canInsert;
    $('load').disabled = !hostReady;
    if (SlideTeXHost.mode !== 'wps') { $('replace').disabled = true; document.querySelector('.replace-option').hidden = true; }
    if (result) message(hostReady ? '准备就绪，可以插入公式。' : '可导出 PNG；插入功能请在幻灯片软件中使用。');
    updateButtons();
  }).catch(error => { $('host').textContent = '未连接'; message(error.message, 'error'); });
  refreshHistory(); apply(storage.get('slidetex-settings', {}));
})();
