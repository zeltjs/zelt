/* DOM geometry and fold controls. app.js owns source selection and dependency traversal. */
let ecLayout;
function ecPosition(id) {
  const group = ecOwner(id);
  const box = ecLayout.boxes.get(group.id);
  const index = ecMembers(group.id).findIndex((item) => item.id === id);
  const header = index < 0 || ecState.collapsed.has(group.id);
  return { x: box.x, y: box.y + (header ? 20 : 72 + index * 46), width: box.width };
}

function ecApplyLayout() {
  ecLayout = window.EC_VIEW.layout(ecModel, ecState.collapsed);
  for (const el of document.querySelectorAll('[data-group]')) {
    const id = el.dataset.group,
      box = ecLayout.boxes.get(id);
    const collapsed = ecState.collapsed.has(id);
    el.style.top = `${box.y}px`;
    el.style.height = `${box.height}px`;
    el.classList.toggle('collapsed', collapsed);
    for (const member of el.querySelectorAll('[data-declaration]')) member.hidden = collapsed;
    const toggle = el.querySelector('[data-toggle]');
    if (!toggle) continue;
    toggle.textContent = collapsed ? '＋' : '−';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', `${id}を${collapsed ? '展開' : '折りたたむ'}`);
    el.querySelector('.collapsed-summary').hidden = !collapsed;
  }
  ecResizeMap();
}

function ecResizeMap() {
  ecEl('architecture-map').style.height = `${ecLayout.height}px`;
  ecEl('map-wires').setAttribute('height', ecLayout.height);
  ecEl('map-space').style.height = `${ecLayout.height * ecState.zoom}px`;
  ecEl('mini-map')
    .querySelector('svg')
    .setAttribute('viewBox', `0 0 ${ecModel.width} ${ecLayout.height}`);
  for (const el of document.querySelectorAll('[data-mini]')) {
    const box = ecLayout.boxes.get(el.dataset.mini);
    el.setAttribute('y', box.y);
    el.setAttribute('height', box.height);
  }
  ecUpdateMini();
}

function ecToggleGroup(id) {
  const viewport = ecEl('map-scroll');
  const previousY = ecLayout.boxes.get(id).y;
  const previousScroll = viewport.scrollTop;
  if (ecState.collapsed.has(id)) ecState.collapsed.delete(id);
  else ecState.collapsed.add(id);
  ecRenderMap();
  viewport.scrollTop = previousScroll + (ecLayout.boxes.get(id).y - previousY) * ecState.zoom;
  ecUpdateMini();
}

function ecSetAllCollapsed(collapsed) {
  ecState.collapsed = new Set(collapsed ? ecGroups.keys() : []);
  ecRenderMap();
  ecEl('map-scroll').scrollTo(0, 0);
  ecUpdateMini();
}

function ecUpdateMini() {
  const viewport = ecEl('map-scroll'),
    rect = ecEl('mini-viewport');
  if (!rect) return;
  for (const [key, value] of Object.entries({
    x: viewport.scrollLeft / ecState.zoom,
    y: viewport.scrollTop / ecState.zoom,
    width: viewport.clientWidth / ecState.zoom,
    height: viewport.clientHeight / ecState.zoom,
  }))
    rect.setAttribute(key, value);
}

window.EC_MAP = { ecPosition, ecApplyLayout, ecToggleGroup, ecSetAllCollapsed, ecUpdateMini };
