/* Browser-only UI over the fixed EC_GRAPH / EC_SOURCES fixture. */
const ecModel = window.EC_GRAPH;
const ecSources = window.EC_SOURCES;
const ecGroups = new Map(ecModel.groups.map((item) => [item.id, item]));
const ecNodes = new Map(ecModel.declarations.map((item) => [item.id, item]));
const ecLabels = {
  call: '呼ぶ',
  read: '読む / 参照',
  contract: '契約を呼ぶ',
  type: '型参照',
  schema: '入力検証schema参照',
  table: 'table参照',
  middleware: 'middleware適用',
  event: 'event配送',
  register: '登録',
  extends: '継承',
  implements: '実装',
  override: 'override',
  returns: '関数を返す',
  construct: '生成',
};
const ecKinds = {
  method: 'METHOD',
  constructor: 'CTOR',
  function: 'FUNCTION',
  callback: 'CALLBACK',
  property: 'PROP',
  getter: 'GET',
  signature: 'SIGNATURE',
  type: 'TYPE',
  schema: 'SCHEMA',
  table: 'TABLE',
  value: 'VALUE',
  'event-type': 'EVENT TYPE',
};
const ecState = {
  selected: null,
  root: '',
  mode: 'near',
  tab: 'contract',
  query: '',
  category: 'all',
  change: false,
  zoom: 0.7,
  collapsed: new Set(ecGroups.keys()),
};
const ecCallable = new Set(['method', 'constructor', 'function', 'callback']);
const ecEscape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const ecEl = (id) => document.getElementById(id);
const ecMembers = (id) => ecModel.declarations.filter((item) => item.group === id);
const ecOwner = (id) => ecGroups.get(ecNodes.get(id)?.group ?? id);
const ecButton = (id, text = id) =>
  `<button type="button" class="text-link" data-select="${ecEscape(id)}">${ecEscape(text)}</button>`;

function ecValidate() {
  if (ecNodes.size !== ecModel.declarations.length || ecGroups.size !== ecModel.groups.length)
    throw new Error('Duplicate declaration identity');
  for (const item of [...ecModel.groups, ...ecModel.declarations]) {
    if (!ecSources[item.id]) throw new Error(`Missing source: ${item.id}`);
  }
  for (const edge of ecModel.edges) {
    if (!ecSources[edge.from] || !ecSources[edge.to])
      throw new Error(`Missing edge endpoint: ${edge.from} → ${edge.to}`);
  }
}

function ecBuildMap() {
  ecEl('column-headings').innerHTML = ecModel.columns
    .map((label) => `<span>${ecEscape(label)}</span>`)
    .join('');
  ecEl('class-groups').innerHTML = ecModel.groups
    .map((group) => {
      const members = ecMembers(group.id);
      const height = 62 + members.length * 46;
      const x = group.column * 310 + 14;
      return `<section class="class-group" data-group="${ecEscape(group.id)}" style="left:${x}px;top:${group.y}px;width:282px;height:${height}px">
      <button type="button" class="group-heading" data-select="${ecEscape(group.id)}"><span>${group.kind.toUpperCase()}${group.boundary ? ' · 内部未展開' : ''}</span><strong>${ecEscape(group.id)}</strong></button>
      <button type="button" class="group-toggle" data-toggle="${ecEscape(group.id)}" aria-label="${ecEscape(group.id)}を展開" aria-expanded="false">＋</button>
      ${members.map((item, index) => `<button type="button" class="declaration ${ecCallable.has(item.kind) ? 'function-node' : 'data-node'}" data-declaration="${ecEscape(item.id)}" ${ecCallable.has(item.kind) ? `data-node="${ecEscape(item.id)}"` : `data-property="${ecEscape(item.id)}"`} data-select="${ecEscape(item.id)}" style="top:${62 + index * 46}px" title="${ecEscape(item.id)}"><span class="member-line"><small class="kind">${ecKinds[item.kind]}</small><strong>${ecEscape(item.name)}${item.kind === 'method' || item.kind === 'function' ? '()' : ''}</strong></span><span class="member-hint">${ecEscape(item.hint)}</span></button>`).join('')}
      <div class="group-references" role="group" aria-label="${ecEscape(group.id)}の適用・接続先"></div></section>`;
    })
    .join('');
  ecEl('mini-map').innerHTML =
    `<svg viewBox="0 0 ${ecModel.width} ${ecModel.height}" aria-label="全体の位置。classを選ぶと移動"><g>${ecModel.groups.map((group) => `<rect data-mini="${ecEscape(group.id)}" x="${group.column * 310 + 14}" y="${group.y}" width="282" height="${62 + ecMembers(group.id).length * 46}" rx="12"><title>${ecEscape(group.id)}</title></rect>`).join('')}</g><rect id="mini-viewport" fill="none" stroke="#d58238" stroke-width="18"/></svg>`;
}

function ecBuildOrigins() {
  const matching = ecModel.roots.filter(
    (root) =>
      ecOwner(root.id).id !== 'app.ts' &&
      (ecState.category === 'all' || root.kind === ecState.category),
  );
  ecEl('root-select').innerHTML =
    '<option value="">起点を選ぶ → 再帰＋ロック</option>' +
    ['HTTP', 'Event', 'Middleware', 'Lifecycle']
      .map(
        (kind) =>
          `<optgroup label="${kind}">${matching
            .filter((root) => root.kind === kind)
            .map(
              (root) =>
                `<option value="${ecEscape(root.id)}">${ecEscape(root.label)} · ${ecEscape(root.id)}</option>`,
            )
            .join('')}</optgroup>`,
      )
      .join('');
  ecSetOriginValue();
}

function ecSetOriginValue() {
  const select = ecEl('root-select');
  const custom = select.querySelector('[data-custom-origin]');
  if (custom) custom.remove();
  if (
    ecState.category === 'all' &&
    ecState.root &&
    ![...select.options].some((option) => option.value === ecState.root)
  ) {
    const option = document.createElement('option');
    option.value = ecState.root;
    option.textContent = `選択した宣言: ${ecState.root}`;
    option.dataset.customOrigin = 'true';
    select.append(option);
  }
  select.value = [...select.options].some((option) => option.value === ecState.root)
    ? ecState.root
    : '';
}

function ecAllowed(edge) {
  return edge.kind !== 'middleware';
}

function ecFocus() {
  return ecState.root || ecState.selected;
}

function ecLockOrigin(id, locate = false) {
  if (!ecSources[id] || window.EC_PRESENT.role(ecOwner(id)) === 'composition')
    throw new Error(`Invalid map origin: ${id}`);
  ecState.root = id;
  ecState.mode = 'flow';
  ecSelect(id, locate);
}

function ecSeed(id) {
  return ecGroups.has(id) ? [id, ...ecMembers(id).map((item) => item.id)] : [id];
}

function ecDependencyScope(id) {
  return window.EC_SCOPE.trace(ecSeed(id), ecModel.edges.filter(ecAllowed));
}

function ecReachable(id) {
  return ecDependencyScope(id).nodes;
}

function ecVisibleEdges() {
  if (ecState.mode === 'all') return ecModel.edges;
  const focus = ecFocus();
  if (ecState.mode === 'flow' && focus) {
    return ecDependencyScope(focus).edges;
  }
  if (!focus) return [];
  const selected = new Set(ecSeed(focus));
  return ecModel.edges.filter(
    (edge) => ecAllowed(edge) && (selected.has(edge.from) || selected.has(edge.to)),
  );
}

function ecWire(edge, index) {
  const from = ecPosition(edge.from),
    to = ecPosition(edge.to);
  let x1 = from.x + from.width,
    x2 = to.x,
    y1 = from.y + 10 + edge.offset,
    y2 = to.y + 10 + edge.offset;
  let path;
  if (from.x === to.x) {
    x2 = to.x + to.width;
    const lane = x1 + 8 + (index % 3) * 4;
    path = `M ${x1} ${y1} H ${lane} V ${y2} H ${x2}`;
  } else {
    if (from.x > to.x) {
      x1 = from.x;
      x2 = to.x + to.width;
    }
    const bend = Math.min(160, Math.abs(x2 - x1) / 2);
    const direction = x2 > x1 ? 1 : -1;
    path = `M ${x1} ${y1} C ${x1 + direction * bend} ${y1}, ${x2 - direction * bend} ${y2}, ${x2} ${y2}`;
  }
  const symbol = edge.kind === 'read' ? 'dot' : 'arrow';
  const indices = edge.originals.map((original) => ecModel.edges.indexOf(original));
  const title = edge.originals
    .map((original) => `${original.from} —${ecLabels[original.kind]}→ ${original.to}`)
    .join('\n');
  const labelX = from.x === to.x ? x1 + 18 : (x1 + x2) / 2;
  return `<path class="wire edge-${edge.kind}" data-edge="${indices[0]}" data-edges="${indices.join(',')}" data-from="${ecEscape(edge.from)}" data-to="${ecEscape(edge.to)}" data-count="${indices.length}" d="${path}" marker-end="url(#${symbol}-${edge.kind})"><title>${ecEscape(title)}</title></path>${indices.length > 1 ? `<text class="bundle-count" x="${labelX}" y="${(y1 + y2) / 2 - 5}">×${indices.length}<title>${ecEscape(title)}</title></text>` : ''}`;
}

function ecDrawEdges(display) {
  ecSpecialDraw(display);
  const projection = display.projection;
  const defs = Object.keys(ecLabels)
    .map(
      (kind) =>
        `<marker id="arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path class="edge-${kind}" d="M 1 1 L 9 5 L 1 9" fill="none" stroke-width="1.6"/></marker><marker id="dot-${kind}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6"><circle class="edge-${kind}" cx="5" cy="5" r="3" fill="white"/></marker>`,
    )
    .join('');
  ecEl('map-wires').innerHTML = `<defs>${defs}</defs>${projection.edges.map(ecWire).join('')}`;
  ecEl('map-wires').classList.toggle('hide-counts', !ecEl('show-edge-counts').checked);
  ecEl('line-count').textContent = ecSpecialCounts(display.parts, projection, display.total);
}

function ecChangedNodes() {
  const ids = new Set(
    ecModel.edges.filter((e) => e.kind === 'type' && e.to === 'Order').map((e) => e.from),
  );
  for (const edge of ecModel.edges.filter((e) => e.kind === 'call'))
    if (ids.has(edge.to)) ids.add(edge.from);
  ids.add('Order');
  return ids;
}

function ecRenderMap() {
  const display = window.EC_PRESENT.display(ecModel, {
    collapsed: ecState.collapsed,
    selected: ecState.selected,
    focus: ecFocus(),
    edges: ecVisibleEdges(),
    changed: ecState.change ? ecChangedNodes() : new Set(),
    showTypes: ecEl('show-type-arrows').checked,
    showConfig: ecEl('show-config').checked,
  });
  ecApplyLayout(display);
  for (const el of document.querySelectorAll('[data-declaration]')) {
    const node = display.nodes.get(el.dataset.declaration);
    el.classList.toggle('selected', node.selected);
    el.classList.toggle('dimmed', node.dimmed);
    el.classList.toggle('changed', node.changed);
    el.setAttribute('aria-pressed', String(node.selected));
  }
  for (const el of document.querySelectorAll('[data-group]')) {
    const group = display.groups.get(el.dataset.group);
    el.classList.toggle('dimmed-group', group.dimmed);
    el.classList.toggle('selected-group', group.selected);
    el.classList.toggle('changed-group', group.changed);
  }
  ecDrawEdges(display);
  ecEl('selection-summary').textContent = ecState.selected
    ? `詳細の選択: ${ecState.selected}`
    : '全体の配置 · 箱を選ぶと、使う先と使う元の線を表示';
  const locked = Boolean(ecState.root);
  const lock = ecEl('scope-lock');
  lock.setAttribute('aria-pressed', String(locked));
  lock.textContent = locked ? 'ロック中 · 解除' : '範囲をロック';
  lock.disabled =
    !locked &&
    (!ecState.selected || window.EC_PRESENT.role(ecOwner(ecState.selected)) === 'composition');
  ecEl('scope-status').textContent = locked
    ? `固定基準: ${ecState.root} · クリックは詳細のみ`
    : ecFocus()
      ? `選択に追従: ${ecFocus()}`
      : '選択に追従 · 箱を選んでください';
  ecEl('scenario').setAttribute('aria-pressed', String(ecState.change));
  ecEl('scenario').textContent = ecState.change ? '仮変更を戻す' : 'Order型の仮変更';
  for (const button of document.querySelectorAll('[data-mode]'))
    button.setAttribute('aria-pressed', String(button.dataset.mode === ecState.mode));
  ecSetOriginValue();
}

function ecContract(id) {
  const source = ecSources[id];
  const node = ecNodes.get(id);
  return `<div class="contract-grid"><section><h3>宣言の契約</h3><pre>${ecEscape(source.signature)}</pre>${
    !node
      ? `<h3>メンバー</h3><div class="member-links">${ecMembers(id)
          .map((member) => ecButton(member.id, `${ecKinds[member.kind]} · ${member.name}`))
          .join('')}</div>`
      : ''
  }</section>${ecTestList(id)}</div>`;
}

function ecSourceView(id) {
  const source = ecSources[id];
  const group = ecGroups.get(id);
  const notice = group
    ? '<p class="muted">囲みの宣言ヘッダーです。本文は各メンバーを選んで確認してください。FILEの場合はファイルの所在を表示します。</p>'
    : '';
  return `${notice}<pre class="source-code">${ecEscape(source.code || source.signature)}</pre>`;
}

function ecRenderInspector() {
  const id = ecState.selected;
  if (!id) {
    ecEl('inspector').innerHTML =
      `<div class="welcome"><span class="eyebrow">EC-BACKEND / WHOLE APPLICATION</span><h2>入口を選び、依存を辿る</h2><p>HTTP 16 · Event 1 · Middleware 5。箱の選択に範囲が追従します。ロックすると矢印・active範囲を保って詳細を読めます。起点ショートカットは再帰＋ロックです。</p><p>configは独立したタブではなく、どの起点からも共有される宣言です。右の小地図から全体の各位置へ移動できます。</p><p class="muted">${ecNodes.size}宣言 / ${ecGroups.size} class・file・interface。手動fixture。抽出器・API接続なし。</p></div>`;
    return;
  }
  const source = ecSources[id];
  const content = ecState.tab === 'source' ? ecSourceView(id) : ecContract(id);
  ecEl('inspector').innerHTML =
    `<header class="inspector-heading"><div><span class="eyebrow">${ecKinds[ecNodes.get(id)?.kind] ?? ecOwner(id).kind.toUpperCase()}</span><h2>${ecEscape(id)}</h2><p class="source-path">${ecEscape(source.file)}:${source.line}</p></div><div class="inspector-actions"><button type="button" data-action="locate">地図の位置へ ↗</button><button type="button" data-action="as-root">ここから再帰＋ロック</button></div></header><div class="inspector-tabs" role="tablist" aria-label="宣言の詳細">${[
      ['contract', '契約'],
      ['source', '実コード'],
    ]
      .map(
        ([tab, label]) =>
          `<button type="button" role="tab" data-tab="${tab}" aria-selected="${ecState.tab === tab}" tabindex="${ecState.tab === tab ? 0 : -1}">${label}</button>`,
      )
      .join('')}</div><div class="inspector-body" role="tabpanel">${content}</div>`;
  ecSpecialInspector(id);
}

function ecSelect(id, locate = false) {
  if (!ecSources[id]) throw new Error(`Unknown declaration: ${id}`);
  ecSpecialReveal(id);
  if (ecNodes.has(id)) ecState.collapsed.delete(ecNodes.get(id).group);
  ecState.selected = id;
  ecState.tab = 'contract';
  ecRenderMap();
  ecRenderInspector();
  if (locate) ecLocate(id);
}

function ecSearch() {
  const query = ecState.query.trim().toLowerCase();
  const items = [...ecModel.groups, ...ecModel.declarations].filter((item) =>
    `${item.id} ${item.hint ?? ''} ${ecSources[item.id].file}`.toLowerCase().includes(query),
  );
  ecEl('search-results').hidden = !query;
  ecEl('search-results').innerHTML = query
    ? `<p>${items.length}件 · 宣言とファイルを検索</p>${items
        .slice(0, 40)
        .map(
          (item) =>
            `<button type="button" data-find="${ecEscape(item.id)}"><strong>${ecEscape(item.id)}</strong><small>${ecEscape(item.hint ?? item.kind)}</small></button>`,
        )
        .join(
          '',
        )}${items.length === 0 ? '<p>該当する宣言はありません。</p>' : ''}${items.length > 40 ? '<p>先頭40件。検索語を追加してください。</p>' : ''}`
    : '';
}

function ecReset() {
  ecSpecialReset();
  Object.assign(ecState, {
    selected: null,
    root: '',
    mode: 'near',
    tab: 'contract',
    query: '',
    category: 'all',
    change: false,
    collapsed: new Set(ecGroups.keys()),
  });
  ecEl('search').value = '';
  ecEl('category').value = 'all';
  for (const id of ['show-type-arrows', 'show-edge-counts']) ecEl(id).checked = true;
  ecBuildOrigins();
  ecSearch();
  ecRenderMap();
  ecRenderInspector();
  const viewportWidth = ecEl('map-scroll').clientWidth;
  ecSetZoom(viewportWidth < 600 ? 1 : Math.min(1, (viewportWidth - 20) / ecModel.width));
  ecEl('map-scroll').scrollTo(0, 0);
}

function ecAction(action) {
  const handlers = {
    reset: ecReset,
    'expand-all': () => ecSetAllCollapsed(false),
    'collapse-all': () => ecSetAllCollapsed(true),
    'zoom-in': () => ecSetZoom(ecState.zoom + 0.1),
    'zoom-out': () => ecSetZoom(ecState.zoom - 0.1),
    'zoom-actual': () => ecSetZoom(1),
    'zoom-fit': () => ecSetZoom((ecEl('map-scroll').clientWidth - 20) / ecModel.width),
    locate: () => ecLocate(ecState.selected),
    'as-root': () => ecLockOrigin(ecState.selected),
    'toggle-lock': () => {
      if (
        !ecState.root &&
        (!ecState.selected || window.EC_PRESENT.role(ecOwner(ecState.selected)) === 'composition')
      )
        return;
      ecState.root = ecState.root ? '' : ecState.selected;
      ecRenderMap();
    },
    scenario: () => {
      ecState.change = !ecState.change;
      ecSelect('Order', true);
    },
    help: () => ecEl('help-dialog').showModal(),
    'close-help': () => ecEl('help-dialog').close(),
  };
  handlers[action]?.();
}

function ecClick(event) {
  const target = event.target.closest(
    '[data-select], [data-find], [data-mini], [data-tab], [data-mode], [data-action], [data-toggle]',
  );
  if (!target) return;
  if (target.dataset.toggle) ecToggleGroup(target.dataset.toggle);
  if (target.dataset.select) ecSelect(target.dataset.select);
  if (target.dataset.find) {
    ecSelect(target.dataset.find, true);
    ecEl('search-results').hidden = true;
  }
  if (target.dataset.mini) ecSelect(target.dataset.mini, true);
  if (target.dataset.tab) {
    ecState.tab = target.dataset.tab;
    ecRenderInspector();
    document.querySelector(`[data-tab="${ecState.tab}"]`).focus();
  }
  if (target.dataset.mode) {
    ecState.mode = target.dataset.mode;
    ecRenderMap();
  }
  if (target.dataset.action) ecAction(target.dataset.action);
}

function ecKeydown(event) {
  if (event.key === 'Escape') ecEl('search-results').hidden = true;
  if (!event.target.matches('[role="tab"]')) return;
  const tabs = ['contract', 'source'];
  const index = tabs.indexOf(ecState.tab);
  const next = { ArrowRight: (index + 1) % 2, ArrowLeft: (index + 1) % 2, Home: 0, End: 1 }[
    event.key
  ];
  if (next === undefined) return;
  event.preventDefault();
  ecState.tab = tabs[next];
  ecRenderInspector();
  document.querySelector(`[data-tab="${ecState.tab}"]`).focus();
}

ecValidate();
ecBuildMap();
ecBuildOrigins();
document.addEventListener('click', ecClick);
document.addEventListener('keydown', ecKeydown);
ecEl('search').addEventListener('input', (event) => {
  ecState.query = event.target.value;
  ecSearch();
});
ecEl('category').addEventListener('change', (event) => {
  ecState.category = event.target.value;
  ecBuildOrigins();
});
ecEl('root-select').addEventListener('change', (event) => {
  if (!event.target.value) {
    ecSetOriginValue();
    return;
  }
  ecLockOrigin(event.target.value, true);
});
ecEl('map-scroll').addEventListener('scroll', ecUpdateMini);
for (const id of ['show-type-arrows', 'show-edge-counts'])
  ecEl(id).addEventListener('change', ecRenderMap);
window.addEventListener('resize', ecUpdateMini);
ecSpecialInit();
ecReset();
