/* ============================================================
   post-processing
   ============================================================ */

const composer = new EffectComposer(renderer);
composer.setPixelRatio(DPR);
composer.setSize(window.innerWidth, window.innerHeight);

const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.62,
  0.72,
  0.82
);
const outlinePass = new OutlinePass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  scene,
  camera
);
outlinePass.edgeStrength = 3.4;
outlinePass.edgeGlow = 0.9;
outlinePass.edgeThickness = 1.25;
outlinePass.pulsePeriod = 0;
outlinePass.visibleEdgeColor.set(0x9feaff);
outlinePass.hiddenEdgeColor.set(0x1c526a);

composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(outlinePass);
composer.addPass(new OutputPass());

/* ============================================================
   UI state
   ============================================================ */

const partListEl = $('#partList');
const inspectorEl = $('#inspector');
const openCountEl = $('#openCount');
const structTextEl = $('#structText');
const integrityEl = $('#integrity');
const integrityBarEl = $('#integrityBar');
const stateChipEl = $('#stateChip');
const stateTextEl = $('#stateText');
const metricOutputEl = $('#metricOutput');
const metricFieldEl = $('#metricField');
const leftPanelEl = $('#leftPanel');
const rightPanelEl = $('#rightPanel');
const toastEl = $('#toast');
const hoverChipEl = $('#hoverChip');
const ignitionFlashEl = $('#ignitionFlash');

let selectedId = null;
let runMode = 'standby';
let ignition = 0;
let ignitionTarget = 0;
let ignitionRamp = { start: -1, from: 0, duration: 2.6 };
let ignitionPending = false;
let igniteTimer = null;
let cameraTween = null;
let toastTimer = null;
let telemetryTimer = 0;
let time = 0;
let hoverDirty = false;
let pointerInside = false;
let pointerDown = false;
let pointerDownAt = 0;
let pointerDownPos = { x: 0, y: 0 };
let lastPointer = { x: 0, y: 0 };
let labelBounds = { left: 20, right: window.innerWidth - 20, top: 100, bottom: window.innerHeight - 140 };
const labelEls = new Map();
const labelPaths = new Map();
const labelCircles = new Map();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const tmpVec = new THREE.Vector3();
const labelWidth = 150;

function buildPartList() {
  partListEl.innerHTML = MODULE_META.map((part, index) => `
    <button class="part-row" type="button" data-part-id="${part.id}" aria-pressed="false">
      <span class="idx">${String(index).padStart(2, '0')}</span>
      <span class="p-main">
        <span class="p-name">${part.name}</span>
        <span class="p-en">${part.en}</span>
      </span>
      <span class="p-state"><span class="state-label">LOCKED</span><i></i></span>
    </button>
  `).join('');
  $('#partCount').textContent = String(MODULE_META.length).padStart(2, '0');
}

function showToast(message, warn = false) {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.toggle('warn', warn);
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function openModuleCount() {
  let n = 0;
  modules.forEach((inst) => { if (inst.target > 0.5) n++; });
  return n;
}

function refreshListStates() {
  const rows = partListEl.querySelectorAll('.part-row');
  rows.forEach((row) => {
    const inst = modules.get(row.dataset.partId);
    if (!inst) return;
    const open = inst.target > 0.5;
    row.classList.toggle('is-open', open);
    row.classList.toggle('is-active', selectedId === inst.id);
    row.setAttribute('aria-pressed', String(open));
    const stateLabel = row.querySelector('.state-label');
    if (stateLabel) stateLabel.textContent = open ? 'OPEN' : 'LOCKED';
  });

  const count = openModuleCount();
  const total = MODULE_META.length;
  openCountEl.textContent = `${count}/${total}`;
  if (count === 0) {
    structTextEl.textContent = '完整 / ASSEMBLED';
  } else if (count === total) {
    structTextEl.textContent = '全展开 / FULL DECOMP';
  } else {
    structTextEl.textContent = `展开 ${count}/${total} / PARTIAL`;
  }
  const integrity = Math.max(0, 100 - count * 2.2);
  integrityEl.textContent = integrity.toFixed(0) + ' %';
  integrityBarEl.style.width = integrity + '%';

  labelEls.forEach((el, id) => {
    const flag = el.querySelector('em');
    if (!flag) return;
    const inst = modules.get(id);
    if (selectedId === id) flag.textContent = 'SELECTED';
    else if (inst && inst.target > 0.5) flag.textContent = 'OPEN';
    else flag.textContent = 'LOCKED';
  });

  refreshControls();
}

function refreshControls() {
  const count = openModuleCount();
  const btnExplode = $('#btnExplode');
  const btnAssemble = $('#btnAssemble');
  const btnIgnite = $('#btnIgnite');
  const btnShutdown = $('#btnShutdown');
  if (btnExplode) btnExplode.disabled = count === MODULE_META.length;
  if (btnAssemble) btnAssemble.disabled = count === 0;
  if (btnIgnite) btnIgnite.disabled = ignitionTarget > 0.5 || ignitionPending;
  if (btnShutdown) btnShutdown.disabled = ignitionTarget < 0.5 && !ignitionPending && ignition < 0.02;
}

function setMode(mode) {
  if (runMode === mode) return;
  runMode = mode;
  stateChipEl.classList.remove('online', 'warn');
  if (mode === 'igniting') {
    stateChipEl.classList.add('online');
    stateTextEl.textContent = '点火序列 / IGNITING';
  } else if (mode === 'online') {
    stateChipEl.classList.add('online');
    stateTextEl.textContent = '聚变运行 / ONLINE';
  } else if (mode === 'cooldown') {
    stateChipEl.classList.add('warn');
    stateTextEl.textContent = '冷却中 / COOLDOWN';
  } else {
    stateTextEl.textContent = '系统待机 / STANDBY';
  }
  const coreStateEl = inspectorEl.querySelector('[data-live="core-state"]');
  if (coreStateEl) {
    coreStateEl.textContent = mode === 'online' ? '运行中' : mode === 'igniting' ? '点火中' : mode === 'cooldown' ? '冷却中' : '待机';
  }
}

function specRows(specs) {
  return specs.map(([key, value]) => {
    if (key === '当前状态') {
      return `<div class="spec-row"><dt>${key}</dt><dd data-live="core-state">${value}</dd></div>`;
    }
    return `<div class="spec-row"><dt>${key}</dt><dd>${value}</dd></div>`;
  }).join('');
}

function renderOverview() {
  inspectorEl.innerHTML = `
    <div class="inspector-head">
      <span class="inspector-kicker">ENGINE OVERVIEW</span>
      <span class="live-flag"><i></i>LIVE</span>
    </div>
    <div class="overview-schematic">
      <svg viewBox="0 0 200 148" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="overviewCoreGrad" cx="50%" cy="50%" r="50%">
            <stop class="sch-g0" offset="0%" stop-opacity=".95"/>
            <stop class="sch-g1" offset="38%" stop-opacity=".35"/>
            <stop class="sch-g2" offset="100%" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <g opacity=".52">
          <circle class="sch-soft" cx="100" cy="74" r="55" stroke-opacity=".28" stroke-width=".8"/>
          <circle class="sch-soft" cx="100" cy="74" r="38" stroke-opacity=".18" stroke-width=".7"/>
          <path class="sch-cyan" d="M100 4v22M100 122v22M30 74h20M150 74h20" stroke-opacity=".24" stroke-width=".8"/>
        </g>
        <g class="rotor" opacity=".55">
          <circle class="sch-cyan" cx="100" cy="74" r="48" stroke-opacity=".32" stroke-width=".8" stroke-dasharray="2 8"/>
          <circle class="sch-cyan" cx="100" cy="74" r="48" stroke-opacity=".15" stroke-width="8" stroke-dasharray="1 44"/>
        </g>
        <g class="rotor-rev" opacity=".45">
          <circle class="sch-cyan" cx="100" cy="74" r="42" stroke-opacity=".2" stroke-width=".8" stroke-dasharray="12 46"/>
        </g>
        <path class="sch-hull" d="M76 112 L84 58 L90 50 L110 50 L116 58 L124 112Z" stroke-opacity=".65" stroke-width="1"/>
        <path class="sch-hull" d="M86 76h28M83 92h34M80 104h40M92 50v62M108 50v62" stroke-opacity=".22" stroke-width=".7"/>
        <circle cx="100" cy="74" r="14" fill="url(#overviewCoreGrad)"/>
        <circle class="sch-core" cx="100" cy="74" r="3.2"/>
        <path class="sch-cyan" d="M50 74h30M120 74h30" stroke-opacity=".3" stroke-width=".8" stroke-dasharray="2 3"/>
        <text class="sch-txt" x="100" y="143" text-anchor="middle" font-size="6">PE-07 // 11.4 KM</text>
      </svg>
    </div>
    <h2>行星发动机</h2>
    <div class="en-name">PLANETARY ENGINE · PE-07</div>
    <div class="role-line"><span>ARRAY ROLE</span><em>赤道转向阵列 / 07 号机</em></div>
    <p class="desc">地球联合政府重聚变推进系统。选择左侧组件清单或直接点击模型上的任意部件，即可展开结构、查看技术参数与实时状态。</p>
    <div class="overview-stats">
      <div class="overview-stat"><label>OVERALL HEIGHT</label><b>11.4 <small>km</small></b></div>
      <div class="overview-stat"><label>RATED POWER</label><b>2.4 <small>× 10¹³ W</small></b></div>
      <div class="overview-stat"><label>RATED THRUST</label><b>1.5 <small>× 10¹³ N</small></b></div>
      <div class="overview-stat"><label>SPECIFIC IMPULSE</label><b>1.4 <small>× 10⁴ s</small></b></div>
    </div>
    <div class="guide-block">
      <p><b>操作引导</b>　拖拽旋转视角，滚轮缩放。点击模型部件或清单条目，可执行单体拆解。</p>
      <p><b>点火流程</b>　先组装机构，再点击“点火”。核心将逐级发光，磁约束喷口上方形成蓝白色能量光柱。</p>
    </div>
    <div class="section-title"><span class="st-label">系统状态</span><span>SYSTEM STATUS</span></div>
    <dl class="spec-table">
      <div class="spec-row"><dt>结构模式</dt><dd>${openModuleCount() === 0 ? '完整组装' : '部分展开'}</dd></div>
      <div class="spec-row"><dt>磁约束</dt><dd>18.7 T</dd></div>
      <div class="spec-row"><dt>遥测链路</dt><dd>98.4 % / 稳定</dd></div>
      <div class="spec-row"><dt>冷却储备</dt><dd>82.1 %</dd></div>
    </dl>
  `;
}

function renderInspector(id) {
  if (!id) {
    renderOverview();
    return;
  }
  const inst = modules.get(id);
  const meta = inst.meta;
  const isOpen = inst.target > 0.5;
  const stateText = isOpen ? '已展开 / OPEN' : selectedId === id ? '已选中 / SELECTED' : '已组装 / LOCKED';
  inspectorEl.innerHTML = `
    <div class="inspector-head">
      <span class="inspector-kicker">COMPONENT INSPECTOR</span>
      <span class="code-badge">${meta.code}</span>
    </div>
    <h2>${meta.name}</h2>
    <div class="en-name">${meta.en}</div>
    <div class="role-line"><span>MODULE ROLE</span><em>${meta.role}</em></div>
    <p class="desc">${meta.desc}</p>
    <div class="section-title"><span class="st-label">技术参数</span><span>TECH SPECS</span></div>
    <dl class="spec-table">${specRows(meta.specs)}</dl>
    <div class="section-title"><span class="st-label">实时遥测</span><span>TELEMETRY</span></div>
    <div class="metrics">
      ${meta.stats.map((s) => `
        <div class="metric-row">
          <div class="mr-top"><span>${s.label}</span><b>${s.value}</b></div>
          <div class="metric-track"><i class="metric-fill" data-pct="${s.pct}"></i></div>
        </div>
      `).join('')}
    </div>
    <div class="inspector-actions">
      <button class="action-small" type="button" data-ins-action="toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>
        ${isOpen ? '收起该部件' : '拆解该部件'}
      </button>
      <button class="action-small" type="button" data-ins-action="focus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
        定位部件
      </button>
    </div>
    <div class="panel-foot" style="padding:14px 0 0;border-top:1px solid var(--line);margin-top:18px;">
      <div class="foot-row"><span>ASSEMBLY STATE</span><b>${stateText}</b></div>
      <div class="bar"><i style="width:${isOpen ? 100 : 0}%"></i></div>
    </div>
  `;
  requestAnimationFrame(() => {
    inspectorEl.querySelectorAll('.metric-fill').forEach((bar) => {
      bar.style.width = bar.dataset.pct + '%';
    });
  });
}

function selectModule(id, options = {}) {
  if (id && !modules.has(id)) return;
  selectedId = id;
  const inst = id ? modules.get(id) : null;
  outlinePass.selectedObjects = inst ? inst.meshes : [];
  if (id) renderInspector(id);
  else renderOverview();
  refreshListStates();
  if (options.toggle && id) toggleModule(id);
  if (options.focus && id) focusModule(id);
}

function toggleModule(id, force) {
  const inst = modules.get(id);
  if (!inst) return;
  const next = force === undefined ? (inst.target > 0.5 ? 0 : 1) : force;
  inst.target = next;
  inst.delay = 0;
  refreshListStates();
  if (selectedId === id) renderInspector(id);
  showToast(next ? `${inst.meta.name} · 展开` : `${inst.meta.name} · 收回`);
}

function setAllModules(value) {
  MODULE_META.forEach((meta, index) => {
    const inst = modules.get(meta.id);
    const order = value === 1 ? index : MODULE_META.length - 1 - index;
    inst.target = value;
    inst.delay = order * 0.055;
  });
  refreshListStates();
  if (selectedId) renderInspector(selectedId);
  else renderOverview();
}

function focusModule(id) {
  const inst = modules.get(id);
  if (!inst) return;
  const box = new THREE.Box3();
  inst.meshes.forEach((mesh) => {
    mesh.updateWorldMatrix(true, false);
    if (mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      box.union(b);
    }
  });
  if (box.isEmpty()) return;
  const center = box.getCenter(V3());
  const size = box.getSize(V3());
  const dist = Math.max(size.length() * 1.22, 18);
  const dir = V3().subVectors(camera.position, controls.target).normalize();
  if (dir.lengthSq() < 0.001) dir.copy(DEFAULT_CAM).normalize();
  const pos = center.clone().add(dir.multiplyScalar(dist));
  flyCameraTo(pos, center, 1.0);
}

function flyCameraTo(position, target, duration = 1.1) {
  cameraTween = {
    fromPos: camera.position.clone(),
    toPos: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    t: 0,
    duration: Math.max(0.2, duration)
  };
  controls.enabled = false;
}

function resetView() {
  flyCameraTo(DEFAULT_CAM, DEFAULT_TARGET, 1.15);
  showToast('视角已复位 · ORBITAL VIEW');
}

function cancelIgnitionPending() {
  if (igniteTimer) {
    clearTimeout(igniteTimer);
    igniteTimer = null;
  }
  ignitionPending = false;
}

function requestIgnition() {
  if (ignitionTarget > 0.5 || ignitionPending) return;
  const openCount = openModuleCount();
  if (openCount > 0) {
    ignitionPending = true;
    setMode('igniting');
    setAllModules(0);
    showToast('机构复位中 · 点火序列排队');
    refreshControls();
  } else {
    actuallyIgnite();
  }
}

function modulesRetracted() {
  let done = true;
  modules.forEach((inst) => {
    if (inst.delay > 0 || inst.progress > 0.012) done = false;
  });
  return done;
}

function actuallyIgnite() {
  if (ignitionTarget > 0.5) return;
  ignitionTarget = 1;
  ignitionRamp = { start: performance.now(), from: ignition, duration: 2.6 };
  setMode('igniting');
  ignitionFlashEl.classList.add('on');
  setTimeout(() => ignitionFlashEl.classList.remove('on'), 280);
  showToast('点火序列启动 · 磁约束相位锁定');
  refreshControls();
}

function shutdownEngine() {
  if (ignitionTarget < 0.5 && !ignitionPending && ignition < 0.02) return;
  cancelIgnitionPending();
  ignitionTarget = 0;
  ignitionRamp = { start: performance.now(), from: ignition, duration: 2.2 };
  setMode(ignition > 0.08 ? 'cooldown' : 'standby');
  showToast('安全关机指令已执行 · 能量回收');
  refreshControls();
}

/* ---------------- camera / label helpers ---------------- */

function updateLabelBounds() {
  const mobile = window.innerWidth <= 820;
  if (mobile) {
    labelBounds.left = 12;
    labelBounds.right = window.innerWidth - 12;
    labelBounds.top = 82;
    labelBounds.bottom = window.innerHeight - 100;
    return;
  }
  const lr = leftPanelEl.getBoundingClientRect();
  const rr = rightPanelEl.getBoundingClientRect();
  labelBounds.left = Math.max(18, lr.right + 14);
  labelBounds.right = Math.min(window.innerWidth - 18, rr.left - 14);
  labelBounds.top = 104;
  labelBounds.bottom = window.innerHeight - 134;
}

function buildLabels() {
  const labelLayer = $('#labelLayer');
  const leaderLayer = $('#leaderLayer');
  MODULE_META.forEach((meta) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'part-label';
    el.dataset.partId = meta.id;
    el.tabIndex = -1;
    el.innerHTML = `
      <span class="lbl-top"><span>${meta.code}</span><em>LOCKED</em></span>
      <span class="lbl-name">${meta.name}</span>
      <span class="lbl-en">${meta.en}</span>
    `;
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      selectModule(meta.id, { toggle: true });
    });
    labelLayer.appendChild(el);
    labelEls.set(meta.id, el);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leaderLayer.appendChild(path);
    labelPaths.set(meta.id, path);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '2.1');
    leaderLayer.appendChild(circle);
    labelCircles.set(meta.id, circle);
  });
}

function layoutLabelColumn(items, lh) {
  if (!items.length) return;
  items.sort((a, b) => a.y - b.y);
  let cursor = labelBounds.top;
  items.forEach((item) => {
    item.y = Math.max(item.y, cursor);
    cursor = item.y + lh + 7;
  });
  const overflow = cursor - 7 - labelBounds.bottom;
  if (overflow > 0) items.forEach((item) => { item.y -= overflow; });
  const topOverflow = labelBounds.top - items[0].y;
  if (topOverflow > 0) items.forEach((item) => { item.y += topOverflow; });
  items.forEach((item) => {
    item.y = clamp(item.y, labelBounds.top, labelBounds.bottom - lh);
  });
}

function updateLabels() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const mw = window.innerWidth <= 820 ? 132 : labelWidth;
  const lh = 49;
  const items = [];
  const suppress = ignitionPending || runMode !== 'standby';
  const hide = (el, path, circle) => {
    if (el) el.classList.remove('show');
    if (path) path.style.opacity = '0';
    if (circle) circle.style.opacity = '0';
  };

  MODULE_META.forEach((meta, index) => {
    const inst = modules.get(meta.id);
    const el = labelEls.get(meta.id);
    const path = labelPaths.get(meta.id);
    const circle = labelCircles.get(meta.id);
    if (!inst || !el || !path || !circle) return;
    const show = !suppress && (selectedId === meta.id || Math.max(inst.progress, inst.target) > 0.14);
    if (!show) {
      hide(el, path, circle);
      return;
    }
    inst.anchor.getWorldPosition(tmpVec);
    tmpVec.project(camera);
    if (tmpVec.z > 1 || tmpVec.z < -1) {
      hide(el, path, circle);
      return;
    }
    const sx = (tmpVec.x * 0.5 + 0.5) * W;
    const sy = (-tmpVec.y * 0.5 + 0.5) * H;
    if (sx < -220 || sx > W + 220 || sy < -180 || sy > H + 180 || labelBounds.right - labelBounds.left < mw + 16) {
      hide(el, path, circle);
      return;
    }

    let side = sx < W * 0.5 ? -1 : 1;
    if (Math.abs(sx - W * 0.5) < 90) side = index % 2 === 0 ? -1 : 1;
    if (side === -1 && sx - mw - 36 < labelBounds.left) side = 1;
    if (side === 1 && sx + mw + 36 > labelBounds.right) side = -1;

    let lx = side === -1 ? sx - 36 - mw : sx + 36;
    lx = clamp(lx, labelBounds.left, labelBounds.right - mw);
    let ly = sy - 36;
    ly = clamp(ly, labelBounds.top, labelBounds.bottom - lh);

    items.push({ meta, inst, el, path, circle, sx, sy, side, x: lx, y: ly, h: lh, w: mw });
  });

  const leftItems = items.filter((item) => item.side === -1);
  const rightItems = items.filter((item) => item.side === 1);
  layoutLabelColumn(leftItems, lh);
  layoutLabelColumn(rightItems, lh);

  items.forEach((item) => {
    const { el, path, circle, sx, sy, side, x, y, w } = item;
    el.style.width = w + 'px';
    el.style.left = x.toFixed(1) + 'px';
    el.style.top = y.toFixed(1) + 'px';
    el.classList.add('show');

    const attachX = side === -1 ? x + w : x;
    const attachY = y + 21;
    const midX = sx + side * 18;
    path.setAttribute('d', `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${midX.toFixed(1)} ${sy.toFixed(1)} L ${attachX.toFixed(1)} ${attachY.toFixed(1)}`);
    path.style.opacity = '0.9';
    circle.setAttribute('cx', sx.toFixed(1));
    circle.setAttribute('cy', sy.toFixed(1));
    circle.style.opacity = '0.95';
  });
}

/* ---------------- interactions ---------------- */

partListEl.addEventListener('click', (event) => {
  const row = event.target.closest('[data-part-id]');
  if (!row) return;
  const id = row.dataset.partId;
  if (selectedId === id) {
    toggleModule(id);
  } else {
    selectModule(id, { toggle: true });
  }
  if (window.innerWidth <= 820) {
    leftPanelEl.classList.remove('mobile-open');
    rightPanelEl.classList.add('mobile-open');
    updateLabelBounds();
  }
});

inspectorEl.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-ins-action]');
  if (!btn || !selectedId) return;
  if (btn.dataset.insAction === 'toggle') {
    toggleModule(selectedId);
  } else if (btn.dataset.insAction === 'focus') {
    focusModule(selectedId);
    showToast('镜头已锁定部件');
  }
});

const actions = {
  explode: () => {
    setAllModules(1);
    showToast('全机构拆解 · DECOMPOSE ALL');
  },
  assemble: () => {
    setAllModules(0);
    showToast('全机构组装 · ASSEMBLE ALL');
  },
  ignite: () => requestIgnition(),
  shutdown: () => shutdownEngine(),
  reset: () => resetView()
};

document.querySelectorAll('.dock-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const fn = actions[btn.dataset.action];
    if (fn) fn();
  });
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const key = event.key.toLowerCase();
  if (key === 'e') { actions.explode(); event.preventDefault(); }
  else if (key === 'a') { actions.assemble(); event.preventDefault(); }
  else if (key === 'i') { actions.ignite(); event.preventDefault(); }
  else if (key === 'o') { actions.shutdown(); event.preventDefault(); }
  else if (key === 'r') { actions.reset(); event.preventDefault(); }
  else if (key === 'escape') { selectModule(null); event.preventDefault(); }
});

function setPointerFromEvent(event) {
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
  pointerNdc.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function raycastModules(event) {
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(interactiveMeshes, false);
  return hits;
}

canvas.addEventListener('pointermove', (event) => {
  setPointerFromEvent(event);
  pointerInside = true;
  hoverDirty = true;
});

canvas.addEventListener('pointerleave', () => {
  pointerInside = false;
  canvas.style.cursor = 'grab';
  hoverChipEl.classList.remove('show');
});

canvas.addEventListener('pointerdown', (event) => {
  pointerDown = true;
  pointerDownAt = performance.now();
  pointerDownPos.x = event.clientX;
  pointerDownPos.y = event.clientY;
  hoverChipEl.classList.remove('show');
  setPointerFromEvent(event);
});

canvas.addEventListener('pointerup', (event) => {
  if (!pointerDown) return;
  pointerDown = false;
  const moved = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
  const elapsed = performance.now() - pointerDownAt;
  if (moved > 7 || elapsed > 800) return;

  if (window.innerWidth <= 820) {
    leftPanelEl.classList.remove('mobile-open');
    rightPanelEl.classList.remove('mobile-open');
    updateLabelBounds();
  }

  const hits = raycastModules(event);
  if (hits.length) {
    const hit = hits[0].object;
    let node = hit;
    while (node && !node.userData.moduleId) node = node.parent;
    const id = node && node.userData.moduleId;
    if (!id) return;
    if (selectedId === id) {
      toggleModule(id);
    } else {
      selectModule(id, { toggle: true });
    }
  } else {
    selectModule(null);
  }
});

// mobile panel toggles
$('#toggleLeft').addEventListener('click', () => {
  leftPanelEl.classList.toggle('mobile-open');
  rightPanelEl.classList.remove('mobile-open');
  updateLabelBounds();
});
$('#toggleRight').addEventListener('click', () => {
  rightPanelEl.classList.toggle('mobile-open');
  leftPanelEl.classList.remove('mobile-open');
  updateLabelBounds();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  updateLabelBounds();
});

/* ============================================================
   animation
   ============================================================ */

const clock = new THREE.Clock();

function updateModuleTransforms(dt) {
  modules.forEach((inst) => {
    if (inst.delay > 0) {
      inst.delay = Math.max(0, inst.delay - dt);
    } else {
      const lambda = inst.target > inst.progress ? 4.1 : 5.4;
      inst.progress = damp(inst.progress, inst.target, lambda, dt);
      if (Math.abs(inst.progress - inst.target) < 0.0015) inst.progress = inst.target;
    }

    const p = inst.progress;
    const cfg = inst.meta.explode;
    inst.group.position.y = cfg.lift * p;
    const scale = 1 + (cfg.spread - 1) * p;
    inst.group.scale.set(scale, 1, scale);

    inst.parts.forEach((part) => {
      const base = part.userData.basePos;
      if (!base) return;
      part.position.copy(base);
      const radial = part.userData.radialDir;
      if (radial) part.position.addScaledVector(radial, cfg.radial * p);
    });
  });
}

function updateSpinAndAmbient(dt) {
  spinObjects.forEach((item) => {
    if (item.axis === 'y') item.obj.rotation.y += item.speed * dt * (1 + ignition * 0.75);
    else if (item.axis === 'x') item.obj.rotation.x += item.speed * dt;
  });

  beaconMaterial.emissiveIntensity = 1.35 + Math.sin(time * 3.1) * 0.8 + ignition * 0.8;

  const core = modules.get('core');
  if (core && core.coreParticles) {
    const cp = core.coreParticles;
    for (let i = 0; i < cp.meta.length; i++) {
      const m = cp.meta[i];
      m.a += m.speed * dt * (0.45 + ignition * 2.2);
      const y = m.y + Math.sin(time * 0.9 + i) * 0.22;
      cp.positions[i * 3] = Math.cos(m.a) * m.r;
      cp.positions[i * 3 + 1] = y;
      cp.positions[i * 3 + 2] = Math.sin(m.a) * m.r;
    }
    cp.points.geometry.attributes.position.needsUpdate = true;
    cp.points.material.opacity = 0.48 + ignition * 0.35;
  }

  for (let i = 0; i < dustMeta.length; i++) {
    const m = dustMeta[i];
    m.y += m.speed * dt;
    m.a += m.drift * dt;
    if (m.y > 38) m.y = 0;
    dustPositions[i * 3] = Math.cos(m.a) * m.r;
    dustPositions[i * 3 + 1] = m.y;
    dustPositions[i * 3 + 2] = Math.sin(m.a) * m.r;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

function updateIgnition(dt) {
  const prev = ignition;
  const elapsed = Math.max(0, (performance.now() - ignitionRamp.start) / 1000);
  const ramp = clamp(elapsed / ignitionRamp.duration, 0, 1);
  const eased = ignitionTarget >= ignitionRamp.from
    ? 1 - Math.pow(1 - ramp, 3)
    : easeInOutCubic(ramp);
  ignition = ignitionRamp.from + (ignitionTarget - ignitionRamp.from) * eased;
  if (ramp >= 1) ignition = ignitionTarget;

  if (runMode === 'igniting' && ignition > 0.94) {
    setMode('online');
    showToast('点火成功 · 聚变反应自持');
  }
  if (runMode === 'cooldown' && ignition < 0.035) {
    setMode('standby');
  }

  const beamStrength = easeInOutCubic(clamp((ignition - 0.012) / 0.62, 0, 1));

  coreUniforms.uTime.value = time;
  coreUniforms.uPower.value = ignition;
  beamUniforms.uTime.value = time;
  beamUniforms.uOpacity.value = beamStrength * (0.9 + Math.sin(time * 23.0) * 0.06);

  coreLight.intensity = 3.6 + ignition * 16;
  emitterLight.intensity = ignition * 8;
  beamLight.intensity = beamStrength * 20;
  shaftMaterial.opacity = 0.011 + ignition * 0.011;

  const core = modules.get('core');
  if (core && core.coreGlowSprite) {
    core.coreGlowSprite.material.opacity = 0.3 + ignition * 0.28;
    const s = 8.5 + ignition * 2.6 + Math.sin(time * 2.3) * 0.16;
    core.coreGlowSprite.scale.set(s, s * 1.6, 1);
  }

  ignitionGlowMaterials.forEach((mat, index) => {
    if (mat.userData.baseGlow === undefined) mat.userData.baseGlow = mat.emissiveIntensity;
    mat.emissiveIntensity = mat.userData.baseGlow + ignition * (1.2 + (index % 3) * 0.22) + Math.sin(time * 4 + index) * ignition * 0.15;
  });

  const crystal = modules.get('ignition').crystal;
  if (crystal) {
    const cs = 1 + ignition * 0.26 + Math.sin(time * 5.2) * 0.035;
    crystal.scale.setScalar(cs);
  }

  if (beamFX) {
    beamFX.group.visible = beamStrength > 0.002;
    beamFX.group.scale.y = Math.max(0.001, beamStrength);
    beamFX.group.scale.x = 1;
    beamFX.group.scale.z = 1;
    beamFX.innerMaterial.opacity = beamStrength * 0.46;
    beamFX.haloMaterial.opacity = beamStrength * 0.07;
    beamFX.baseGlow.material.opacity = beamStrength * 0.5;
    const bg = 10.5 + ignition * 3.5 + Math.sin(time * 5) * 0.45;
    beamFX.baseGlow.scale.set(bg, bg, 1);
    beamFX.particles.visible = beamStrength > 0.005;
    beamFX.particleMaterial.opacity = beamStrength * 0.65;

    beamFX.rings.forEach((ring, i) => {
      const t = ((time * 0.19 + ring.offset) % 1);
      ring.mesh.position.y = t * 39;
      const sc = 0.72 + t * 1.9;
      ring.mesh.scale.set(sc, sc, 1);
      ring.mat.opacity = beamStrength * (1 - t) * 0.28;
    });

    const pos = beamFX.particlePositions;
    const meta = beamFX.particleMeta;
    for (let i = 0; i < meta.length; i++) {
      const p = meta[i];
      p.y += p.speed * dt * (0.35 + ignition * 1.9);
      p.angle += p.spin * dt;
      if (p.y > 39) {
        p.y = Math.random() * 2;
        p.angle = Math.random() * TAU;
        p.radius = 0.25 + Math.pow(Math.random(), 0.55) * 2.1;
      }
      const r = p.radius * (1 + p.y * 0.014);
      pos[i * 3] = Math.cos(p.angle) * r;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = Math.sin(p.angle) * r;
    }
    beamFX.particleGeometry.attributes.position.needsUpdate = true;
  }

  bloomPass.strength = 0.5 + ignition * 0.68;
  bloomPass.radius = 0.62 + ignition * 0.12;
  bloomPass.threshold = 0.85 - ignition * 0.04;
  renderer.toneMappingExposure = 1.06 + ignition * 0.04;

  if (prev < 0.04 && ignition >= 0.04) ignitionFlashEl.classList.remove('on');
}

function updateTelemetry(dt) {
  telemetryTimer += dt;
  if (telemetryTimer < 0.1) return;
  telemetryTimer = 0;
  metricOutputEl.textContent = (ignition * 100).toFixed(1) + ' %';
  metricOutputEl.classList.toggle('hot', ignition > 0.02);
  metricFieldEl.textContent = (18.7 + ignition * 3.7).toFixed(1) + ' T';
  metricFieldEl.classList.toggle('hot', ignition > 0.02);
  if (selectedId === 'core') {
    const coreStateEl = inspectorEl.querySelector('[data-live="core-state"]');
    if (coreStateEl) {
      coreStateEl.textContent = runMode === 'online' ? '运行中' : runMode === 'igniting' ? '点火中' : runMode === 'cooldown' ? '冷却中' : '待机';
    }
  }
}

function updateCameraTween(dt) {
  if (!cameraTween) return;
  cameraTween.t += dt;
  const raw = clamp(cameraTween.t / cameraTween.duration, 0, 1);
  const e = easeInOutCubic(raw);
  camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, e);
  controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, e);
  controls.update();
  if (raw >= 1) {
    cameraTween = null;
    controls.enabled = true;
  }
}

function doHoverCheck() {
  if (!hoverDirty || pointerDown || !pointerInside) return;
  hoverDirty = false;
  raycaster.setFromCamera(
    new THREE.Vector2(
      (lastPointer.x / window.innerWidth) * 2 - 1,
      -(lastPointer.y / window.innerHeight) * 2 + 1
    ),
    camera
  );
  const hits = raycaster.intersectObjects(interactiveMeshes, false);
  canvas.style.cursor = hits.length ? 'pointer' : 'grab';

  if (!hits.length || window.innerWidth <= 820) {
    hoverChipEl.classList.remove('show');
    return;
  }
  let node = hits[0].object;
  while (node && !node.userData.moduleId) node = node.parent;
  const id = node && node.userData.moduleId;
  const meta = id ? MODULE_META.find((m) => m.id === id) : null;
  if (!meta) {
    hoverChipEl.classList.remove('show');
    return;
  }
  hoverChipEl.innerHTML = `<span class="hc-code">${meta.code}</span><span>${meta.name}</span><span class="hc-en">${meta.en}</span>`;
  const w = hoverChipEl.offsetWidth;
  const h = hoverChipEl.offsetHeight;
  let x = lastPointer.x + 18;
  let y = lastPointer.y + 17;
  if (x + w > window.innerWidth - 12) x = lastPointer.x - w - 18;
  if (y + h > window.innerHeight - 12) y = lastPointer.y - h - 17;
  hoverChipEl.style.left = x.toFixed(1) + 'px';
  hoverChipEl.style.top = y.toFixed(1) + 'px';
  hoverChipEl.classList.add('show');
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  updateCameraTween(dt);
  if (!cameraTween) controls.update();

  updateModuleTransforms(dt);
  if (ignitionPending && modulesRetracted()) {
    if (igniteTimer) { clearTimeout(igniteTimer); igniteTimer = null; }
    ignitionPending = false;
    actuallyIgnite();
  }
  updateSpinAndAmbient(dt);
  updateBackdrop(dt);
  updateIgnition(dt);
  updateTelemetry(dt);
  updateLabels();
  doHoverCheck();

  groundUniforms.uTime.value = time;
  composer.render();
}

/* ============================================================
   boot & initial UI
   ============================================================ */

async function init() {
  await bootStep(16, '加载渲染内核 / WebGL 2 ...', 80);
  await bootStep(38, '重建承力结构 / 1,024 NODES ...', 90);
  await bootStep(61, '校准磁约束场 / 22.4 TESLA ...', 90);
  await bootStep(79, '铺设冷却回路 / 12 LOOPS ...', 80);
  await bootStep(92, '连接遥测链路 / UPLINK 98.4% ...', 80);

  buildPartList();
  buildLabels();
  renderOverview();
  refreshListStates();
  updateLabelBounds();
  refreshControls();

  window.__PE_DEBUG = { scene, camera, renderer, composer, modules, cameraTween: () => cameraTween, ignition: () => ignition };

  renderer.compile(scene, camera);
  renderer.setAnimationLoop(animate);

  await bootStep(100, 'SYSTEM READY / 发动机控制台上线', 150);
  window.__engineReady = true;
  setTimeout(() => bootEl.classList.add('hidden'), 420);
}

init();
