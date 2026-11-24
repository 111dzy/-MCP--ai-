import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  let list;
  for (let i = 0; i < 30; i++) {
    try { list = await (await fetch(BASE + '/json/list')).json(); break; } catch { await sleep(400); }
  }
  if (!list) throw new Error('no debug endpoint');
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  const events = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      events.push('console.' + m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      events.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    } else if (m.method === 'Log.entryAdded') {
      events.push('log.' + m.params.entry.level + ': ' + m.params.entry.text);
    }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///C:/Users/share%20to%20win/Tianxi/planetary-engine-3d/index.html' });
  await sleep(26000);
  const ready = await send('Runtime.evaluate', { expression: 'JSON.stringify({ready: !!window.__engineReady, title: document.title, canvas: !!document.querySelector("canvas"), debug: !!window.__PE_DEBUG})', returnByValue: true });
  console.log('STATE:', ready.result?.result?.value);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('C:/Users/share to win/Tianxi/planetary-engine-3d/temporary/shot-1.png', Buffer.from(shot.result.data, 'base64'));
  console.log('EVENTS:\n' + events.slice(0, 40).join('\n'));
  await send('Browser.close');
}
main().catch(e => { console.error(e); process.exit(1); });
