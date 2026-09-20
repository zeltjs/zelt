/* Tags and warp links are views of existing relations, not additional declarations. */
const ecReferenceNotes = new Map();
const ecReferenceHistory = [];
const ecDisplayInputs = ['show-type-arrows', 'show-edge-counts', 'show-config'];

function ecSpecialHidden(id) {
  const role = window.EC_PRESENT.role(ecOwner(id));
  return role === 'composition' || (role === 'config' && !ecEl('show-config').checked);
}

function ecSpecialReveal(id) {
  if (window.EC_PRESENT.role(ecOwner(id)) === 'config') ecEl('show-config').checked = true;
}

function ecSpecialLabel(note) {
  if (note.kind === 'config') return '設定との関係あり';
  if (note.kind === 'middleware')
    return `適用: ${ecOwner(note.target).id.replace(/Middleware$/, '')}`;
  const relation = note.kind === 'event' ? 'event' : 'call';
  const name =
    note.kind === 'event' && !note.incoming
      ? note.originals[0].expression
      : ecOwner(note.target).id;
  return `${relation}${note.incoming ? '元' : '先'} ↗ ${name}`;
}

function ecSpecialTitle(note) {
  return note.originals
    .map((edge) => `${edge.from} —${ecLabels[edge.kind]}→ ${edge.to}`)
    .join('\n');
}

function ecSpecialDraw(edges) {
  const partition = window.EC_PRESENT.partition(ecModel, edges, ecEl('show-config').checked);
  const initial = !ecState.selected && ecState.mode === 'near';
  const noteEdges = initial
    ? ecModel.edges
        .filter(ecAllowed)
        .filter((e) => ecEl('show-type-arrows').checked || e.kind !== 'type')
    : edges;
  const noteParts = window.EC_PRESENT.partition(ecModel, noteEdges, ecEl('show-config').checked);
  noteParts.middleware = window.EC_PRESENT.partition(
    ecModel,
    ecModel.edges.filter(ecAllowed),
    ecEl('show-config').checked,
  ).middleware;
  const notes = window.EC_PRESENT.notes(ecModel, noteParts);
  const activeMiddleware = new Set(partition.middleware);
  ecReferenceNotes.clear();
  for (const el of document.querySelectorAll('.group-references')) {
    const id = el.closest('[data-group]').dataset.group;
    el.innerHTML = notes
      .get(id)
      .map((note, index) => {
        const key = `${id}:${index}`;
        ecReferenceNotes.set(key, note);
        const dimmed =
          note.kind === 'middleware' &&
          !initial &&
          !note.originals.some((edge) => activeMiddleware.has(edge));
        return `<button type="button" class="reference-tag ref-${note.kind}${dimmed ? ' dimmed' : ''}" data-reference="${ecEscape(key)}" title="${ecEscape(ecSpecialTitle(note))}" aria-label="${ecEscape(`${ecSpecialLabel(note)}: ${note.target}`)}">${ecEscape(ecSpecialLabel(note))}</button>`;
      })
      .join('');
  }
  ecEl('reference-back').hidden = ecReferenceHistory.length === 0;
  ecEl('config-notice').hidden = ecEl('show-config').checked;
  return partition;
}

function ecSpecialCounts(parts, projection, total) {
  if (!ecState.selected && ecState.mode === 'near') return '0線 · 未選択: タグ/warpは全体を表示';
  const internal = [...projection.internal.values()].reduce((sum, count) => sum + count, 0);
  return `${projection.edges.length}線 / ${total}関係 · 内部 ${internal} · 適用 ${parts.middleware.length}関係 · warp ${parts.warp.length}関係 · 設定非表示 ${parts.config.length}関係 · 構成 ${parts.composition.length}関係`;
}

function ecReferenceSnapshot() {
  const viewport = ecEl('map-scroll');
  return {
    state: { ...ecState, collapsed: new Set(ecState.collapsed) },
    inputs: ecDisplayInputs.map((id) => [id, ecEl(id).checked]),
    scroll: [viewport.scrollLeft, viewport.scrollTop],
    page: [window.scrollX, window.scrollY],
    focusReference: document.activeElement.dataset.reference,
  };
}

function ecReferenceJump(id) {
  ecReferenceHistory.push(ecReferenceSnapshot());
  ecEl('reference-dialog').close();
  ecState.root = id;
  ecState.mode = 'flow';
  ecSelect(id, true);
  const selector = ecNodes.has(id)
    ? `[data-declaration="${CSS.escape(id)}"]`
    : `.group-heading[data-select="${CSS.escape(id)}"]`;
  document.querySelector(selector).focus({ preventScroll: true });
}

function ecReferenceBack() {
  if (!ecReferenceHistory.length) return;
  const previous = ecReferenceHistory.pop();
  Object.assign(ecState, previous.state);
  for (const [id, value] of previous.inputs) ecEl(id).checked = value;
  ecEl('include-middleware').checked = ecState.middleware;
  ecEl('category').value = ecState.category;
  ecEl('search').value = ecState.query;
  ecBuildOrigins();
  ecSearch();
  ecEl('search-results').hidden = true;
  ecRenderMap();
  ecRenderInspector();
  ecSetZoom(ecState.zoom);
  ecEl('map-scroll').scrollTo(...previous.scroll);
  ecUpdateMini();
  window.scrollTo(...previous.page);
  const focus = previous.focusReference
    ? document.querySelector(`[data-reference="${CSS.escape(previous.focusReference)}"]`)
    : ecEl('map-scroll');
  focus.focus({ preventScroll: true });
}

function ecOpenReferences(note) {
  ecEl('reference-title').textContent = `設定との関係: ${note.target}`;
  ecEl('reference-content').innerHTML =
    `<p>箱を非表示にしているだけで、関係は残っています。</p><ul class="relations">${note.originals.map((edge) => `<li><span class="relation-kind">${ecEscape(ecLabels[edge.kind])}</span>${ecJumpButton(edge.from)} → ${ecJumpButton(edge.to)}</li>`).join('')}</ul>`;
  ecEl('reference-dialog').showModal();
}

function ecJumpButton(id) {
  return `<button type="button" class="text-link" data-reference-jump="${ecEscape(id)}">${ecEscape(id)}</button>`;
}

function ecOpenComposition() {
  const edges = ecModel.edges.filter((edge) => ecOwner(edge.from).id === 'app.ts');
  ecEl('reference-title').textContent = 'アプリ構成 · app.ts';
  ecEl('reference-content').innerHTML =
    `<p>createEcAppが登録する構成です。通常の地図には表示しません。</p><ul class="relations">${edges.map((edge) => `<li><span class="relation-kind">${ecEscape(ecLabels[edge.kind])}</span>${ecButton(edge.to)}</li>`).join('')}</ul><button type="button" data-composition-source>createEcAppの実コードを見る</button>`;
  ecEl('reference-dialog').showModal();
}

function ecSpecialInspector(id) {
  if (window.EC_PRESENT.role(ecOwner(id)) !== 'composition') return;
  document.querySelector('[data-action="locate"]').textContent = 'アプリ構成を見る';
  document.querySelector('[data-action="as-root"]').disabled = true;
}

function ecSpecialReset() {
  ecReferenceHistory.length = 0;
  ecEl('show-config').checked = true;
  ecEl('reference-dialog').close();
}

function ecSpecialClick(event) {
  const target = event.target.closest(
    '[data-reference], [data-reference-jump], [data-composition-source]',
  );
  if (!target) return;
  if (target.hasAttribute('data-composition-source')) {
    ecEl('reference-dialog').close();
    ecSelect('createEcApp');
    ecState.tab = 'source';
    ecRenderInspector();
    ecEl('inspector').scrollIntoView({ block: 'start' });
  }
  if (target.dataset.referenceJump) ecReferenceJump(target.dataset.referenceJump);
  if (!target.dataset.reference) return;
  const note = ecReferenceNotes.get(target.dataset.reference);
  if (note.kind === 'config') ecOpenReferences(note);
  else ecReferenceJump(note.target);
}

function ecSpecialInit() {
  document.addEventListener('click', ecSpecialClick);
  ecEl('show-config').addEventListener('change', ecRenderMap);
  ecEl('reference-back').addEventListener('click', ecReferenceBack);
  ecEl('composition-button').addEventListener('click', ecOpenComposition);
  ecEl('close-reference').addEventListener('click', () => ecEl('reference-dialog').close());
  ecEl('reference-dialog').addEventListener('click', (event) => {
    if (event.target.closest('[data-select]')) ecEl('reference-dialog').close();
  });
}

window.EC_SPECIAL = {
  ecSpecialHidden,
  ecSpecialReveal,
  ecSpecialDraw,
  ecSpecialCounts,
  ecSpecialInspector,
  ecSpecialReset,
  ecSpecialInit,
  ecOpenComposition,
};
