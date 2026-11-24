import { writeFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:9335';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function main() {
  let list;
  for (let i = 0; i < 40; i++) { try { list = await (await fetch(BASE + '/json/list')).json(); break; } catch { await sleep(400); } }
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJS = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///C:/Users/share%20to%20win/Tianxi/planetary-engine-3d/index.html' });
  await sleep(15000);

  const sizes = [[1440, 900, '1440'], [1280, 800, '1280'], [1024, 768, '1024'], [390, 844, '390']];
  for (const [w, h, tag] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await sleep(3500);
    const info = await evalJS(`JSON.stringify({iw:innerWidth, ih:innerHeight, sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight, left:document.getElementById('leftPanel').getBoundingClientRect().width, right:document.getElementById('rightPanel').getBoundingClientRect().width, canvas:document.getElementById('scene').getBoundingClientRect().width})`);
    console.log(tag, info);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`C:/Users/share to win/Tianxi/planetary-engine-3d/temporary/shot-${tag}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  await send('Browser.close');
}
main().catch(e => { console.error(e); process.exit(1); });
