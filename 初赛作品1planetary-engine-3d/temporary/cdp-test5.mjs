import { writeFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:9338';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function main() {
  let list;
  for (let i = 0; i < 40; i++) { try { list = await (await fetch(BASE + '/json/list')).json(); break; } catch { await sleep(400); } }
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0; const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJS = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///C:/Users/share%20to%20win/Tianxi/planetary-engine-3d/index.html' });
  await sleep(15000);

  await evalJS("[...document.querySelectorAll('#viewModes button')].find(b=>b.dataset.view==='cutaway').click()");
  await sleep(2500);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('C:/Users/share to win/Tianxi/planetary-engine-3d/temporary/shot-cutaway-standby.png', Buffer.from(shot.result.data, 'base64'));

  await evalJS("[...document.querySelectorAll('#viewModes button')].find(b=>b.dataset.view==='standard').click()");
  await evalJS("document.querySelector('#scaleTrack button[data-layer=\"2\"]').click()");
  await sleep(3000);
  console.log('layer', await evalJS("document.getElementById('scaleLayer').textContent + ' / ' + document.getElementById('scaleValue').textContent"));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('C:/Users/share to win/Tianxi/planetary-engine-3d/temporary/shot-layer2.png', Buffer.from(shot.result.data, 'base64'));

  const errs = errors.length ? errors.slice(0, 5).join(' | ') : 'none';
  console.log('errors', errs);
  await send('Browser.close');
}
main().catch(e => { console.error(e); process.exit(1); });
