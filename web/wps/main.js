var slideTeXPane = null;
function SlideTeXOnLoad(ribbon) {
  window.Application.ribbonUI = ribbon;
  fetch('/api/diagnostic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'wps', event: 'ribbon-loaded' }) }).catch(function() {});
  return true;
}
function SlideTeXIcon() { return location.origin + '/assets/icon-80.png'; }
function SlideTeXOpen() {
  try {
    if (!slideTeXPane) {
      slideTeXPane = window.Application.CreateTaskPane(location.origin + '/wps/taskpane.html?host=wps', 'SlideTeX 公式');
      slideTeXPane.Width = 360;
    } else {
      slideTeXPane.Navigate(location.origin + '/wps/taskpane.html?host=wps');
    }
    slideTeXPane.Visible = true;
  } catch (error) { alert('SlideTeX 无法打开：' + error.message); }
  return true;
}
