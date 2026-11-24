import { writeFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:9336';
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///C:/Users/share%20to%20win/Tianxi/planetary-engine-3d/index.html' });
  await sleep(14000);
  await evalJS("document.getElementById('btnExplode').click()");
  await sleep(5000);
  const rects = await evalJS("JSON.stringify([...document.querySelectorAll('.part-label.show')].map(el=>{const r=el.getBoundingClientRect();return {t:el.querySelector('.lbl-name').textContent, l:Math.round(r.left), top:Math.round(r.top), r:Math.round(r.right), b:Math.round(r.bottom), h:Math.round(r.height)}}))");
  console.log('RECTS', rects);
  const overlaps = await evalJS("(()=>{const els=[...document.querySelectorAll('.part-label.show')];const out=[];for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom)out.push([els[i].querySelector('.lbl-name').textContent,els[j].querySelector('.lbl-name').textContent,Math.round(Math.max(a.top,b.top)),Math.round(Math.min(a.bottom,b.bottom))])}return JSON.stringify(out)})()");
  console.log('OVERLAPS', overlaps);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('C:/Users/share to win/Tianxi/planetary-engine-3d/temporary/shot-labels.png', Buffer.from(shot.result.data, 'base64'));
  await send('Browser.close');
}
main().catch(e => { console.error(e); process.exit(1); });
