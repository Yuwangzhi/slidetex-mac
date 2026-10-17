import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const hostSource = await readFile(new URL('../web/host.js', import.meta.url), 'utf8');

function sandbox() {
  const files = new Map(), shapes = [];
  let failInsert = false;
  const slide = { SlideID: 42, Shapes: {
    get Count() { return shapes.length; },
    Item(index) { return typeof index === 'number' ? shapes[index - 1] : shapes.find(s => s.Name === index); },
    AddPicture(path, link, embed, left, top, width, height) {
      // Reproduce macOS WPS sandbox: a Node-owned /tmp image is inaccessible.
      assert.ok(path.startsWith('/wps-own-container/tmp/'));
      assert.ok(files.has(path));
      assert.equal(link, 0); assert.equal(embed, -1);
      if (failInsert) return null;
      const shape = { Left: left, Top: top, Width: width, Height: height, Name: '', AlternativeText: '', Select() {}, Delete() { shapes.splice(shapes.indexOf(shape), 1); } };
      shapes.push(shape); return shape;
    },
  } };
  const app = {
    ActivePresentation: { PageSetup: { SlideWidth: 960, SlideHeight: 540 } },
    ActiveWindow: { View: { Slide: slide }, Selection: { ShapeRange: { get Count() { return shapes.length ? 1 : 0; }, Item() { return shapes[0]; } } } },
    Env: { GetTempPath: () => '/wps-own-container/tmp/' },
    FileSystem: { writeAsBinaryString: (path, data) => files.set(path, data), Exists: path => files.has(path) },
  };
  const window = { Application: app };
  vm.runInNewContext(hostSource, {
    window, location: { search: '?host=wps', pathname: '/wps/taskpane.html' }, URLSearchParams,
    fetch: () => Promise.resolve({}), atob: b64 => Buffer.from(b64, 'base64').toString('binary'),
  });
  return { host: window.SlideTeXHost, shapes, slide, fail: () => { failInsert = true; } };
}
const result = { settings: { latex: 'E=mc^2', fontSize: 28, dpi: 600 }, id: 'a'.repeat(64), base64: Buffer.from('PNG bytes').toString('base64'), widthPt: 114, heightPt: 33, path: '/tmp/node-owned.png' };

test('WPS inserts embedded image through its own sandbox and recovers source', async () => {
  const s = sandbox();
  await s.host.insert(result, false);
  assert.equal(s.shapes.length, 1);
  assert.equal(s.shapes[0].Width, 114);
  assert.equal(s.shapes[0].Left, (960 - 114) / 2);
  assert.equal((await s.host.loadSelected()).latex, 'E=mc^2');
});

test('replacement preserves position and deletes old image only after successful insertion', async () => {
  const s = sandbox();
  await s.host.insert(result, false);
  s.shapes[0].Left = 25; s.shapes[0].Top = 40;
  await s.host.loadSelected();
  await s.host.insert({ ...result, settings: { ...result.settings, latex: 'x+y' } }, true);
  assert.equal(s.shapes.length, 1);
  assert.equal(s.shapes[0].Left, 25); assert.equal(s.shapes[0].Top, 40);
  await s.host.loadSelected(); s.fail();
  await assert.rejects(s.host.insert(result, true));
  assert.equal(s.shapes.length, 1, 'failed insertion must preserve original formula');
});
