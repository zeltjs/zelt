(() => {
  const model = window.STUDIO_MOCK;
  const nodes = new Map(model.nodes.map((node) => [node.id, node]));
  const groups = new Map(model.groups.map((group) => [group.id, group]));
  const properties = new Map(model.properties.map((property) => [property.id, property]));
  const viewOf = (group) => group.view ?? 'orders';
  const initial = () => ({
    kind: 'group',
    id: 'OrderService',
    tab: 'boundary',
    flow: 'all',
    change: false,
    view: 'orders',
  });
  let state = initial();
  const inspector = document.getElementById('inspector');
  const help = document.getElementById('help-dialog');
  const escapeHtml = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const list = (values) =>
    `<ul class="notes">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
  const nodeLink = (id, hint = '') =>
    `<button type="button" class="relation" data-select="${escapeHtml(id)}">${escapeHtml(id)}()${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</button>`;
  const propertyLink = (id, hint = '') =>
    `<button type="button" class="relation property-link" data-select-property="${escapeHtml(id)}">${escapeHtml(id)}<small>${escapeHtml(hint || properties.get(id).signature)}</small></button>`;
  const readLinks = (node) =>
    model.reads
      .filter((read) => read.from === node.id)
      .map((read) => propertyLink(read.to, `${read.expression} を読む`))
      .join('');
  const section = (title, content) =>
    `<section><h3 class="section-label">${escapeHtml(title)}</h3>${content}</section>`;
  const tabs = ['boundary', 'internal', 'source'];

  function validateModel() {
    if (nodes.size !== model.nodes.length || groups.size !== model.groups.length)
      throw new Error('Duplicate declaration identity');
    for (const node of nodes.values()) {
      if (!groups.has(node.group) || node.id !== `${node.group}.${node.name}`)
        throw new Error(`Invalid method identity: ${node.id}`);
    }
    for (const edge of model.edges) {
      if (!nodes.has(edge.from) || !nodes.has(edge.to))
        throw new Error('Call endpoint is not a method');
    }
    for (const property of properties.values()) {
      if (!groups.has(property.group) || nodes.has(property.id))
        throw new Error(`Invalid property identity: ${property.id}`);
    }
    for (const read of model.reads) {
      if (!nodes.has(read.from) || !properties.has(read.to))
        throw new Error('Invalid property read endpoint');
    }
  }

  function buildMap() {
    document.getElementById('class-groups').innerHTML = model.groups
      .map((group) => {
        const members = model.nodes.filter((node) => node.group === group.id);
        const fields = model.properties.filter((property) => property.group === group.id);
        const count = fields.length
          ? `${fields.length} ${fields[0].kind} · 関数とは別表示`
          : `${members.length} methods 表示 / ${group.omitted.length} methods 範囲外`;
        return `<section class="class-group" data-group="${group.id}" aria-label="${group.id} class group" style="left:${group.x}px;top:${group.y}px;width:${group.width}px;height:${group.height}px"><button type="button" class="group-heading" data-select-group="${group.id}" aria-pressed="false"><span class="group-kind">CLASS</span><strong>${group.id}</strong></button><span class="group-count">${count}</span>${members.map((node) => `<button type="button" class="function-node" data-node="${node.id}" data-select="${node.id}" aria-label="${node.id}()" aria-pressed="false" style="top:${node.y}px"><strong>${node.name}()</strong><small>${escapeHtml(node.label)}</small></button>`).join('')}${fields.map((property) => `<button type="button" class="property-slot" data-property="${property.id}" data-select-property="${property.id}" aria-pressed="false" style="top:${property.y}px"><span class="property-kind">${property.kind === 'getter' ? 'GET' : 'PROP'}</span><strong>${property.name}</strong><small>${escapeHtml(property.type)}</small></button>`).join('')}</section>`;
      })
      .join('');
    const wires = model.edges
      .map((edge, index) => {
        const from = nodes.get(edge.from);
        const to = nodes.get(edge.to);
        const source = groups.get(from.group);
        const target = groups.get(to.group);
        const x1 = source.x + source.width - 10;
        const x2 = target.x + 10;
        const y1 = source.y + from.y + 26;
        const y2 = target.y + to.y + 26;
        const path =
          edge.route === 'above'
            ? `M ${x1} ${y1} H ${source.x + source.width + 24} V 55 H ${target.x - 20} V ${y2} H ${x2}`
            : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
        return `<path class="wire" data-edge="${index}" d="${path}" marker-end="url(#arrow)"/>`;
      })
      .join('');
    const readWires = model.reads
      .map((read, index) => {
        const node = nodes.get(read.from),
          property = properties.get(read.to);
        const from = groups.get(node.group),
          to = groups.get(property.group);
        const x1 = from.x + from.width - 10,
          y1 = from.y + node.y + 26;
        const x2 = to.x + 10,
          y2 = to.y + property.y + 26;
        const path =
          read.lane === undefined
            ? `M ${x1} ${y1} H ${x2}`
            : `M ${x1} ${y1} H 522 V ${read.lane} H 950 V ${y2} H ${x2}`;
        return `<path class="read-wire" data-read-edge="${index}" d="${path}" marker-end="url(#read-dot)"/>`;
      })
      .join('');
    document.getElementById('map-wires').innerHTML =
      `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="#678f84" stroke-width="1.5"/></marker><marker id="read-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7"><circle cx="5" cy="5" r="3" fill="white" stroke="#497cad" stroke-width="1.5"/></marker></defs>${wires}${readWires}<path class="extends-wire" d="M 970 115 H 940 V 78 H 775 V 96" marker-end="url(#arrow)"/><text class="extends-label" x="810" y="70">extends JwtConfig</text><text class="config-read-label" x="538" y="159">secret を読む</text>`;
  }

  function propertyView(property) {
    const group = groups.get(property.group);
    const incoming = model.reads.filter((read) => read.to === property.id);
    const related =
      property.id === 'JwtConfig.secret'
        ? propertyLink('EcJwtConfig.secret', '実在する override 宣言を見る')
        : property.id === 'EcJwtConfig.secret'
          ? propertyLink('JwtConfig.secret', '基底クラスの宣言を見る')
          : '';
    const registration = group.registration
      ? `<p class="source-file">${group.registration.file}</p><pre class="source-block">${escapeHtml(group.registration.snippet)}</pre>`
      : '';
    return `<div class="detail-columns"><div><p class="source-file">${escapeHtml(group.file)}</p><pre class="signature">${escapeHtml(property.signature)}</pre>${list(property.notes)}${related}</div><div>${section('読む関数（表示範囲内）', incoming.length ? incoming.map((read) => nodeLink(read.from, read.expression)).join('') : '<p class="muted">直接参照する宣言先は JwtConfig.secret。override 宣言への直接呼出線は作りません。</p>')}${section('実コードの根拠（抜粋）', property.snippets.map((snippet) => `<pre class="source-block">${escapeHtml(snippet)}</pre>`).join('') + registration)}</div></div>`;
  }

  function methodBoundary(node) {
    const incoming = model.edges.filter((edge) => edge.to === node.id);
    const outgoing = model.edges.filter((edge) => edge.from === node.id);
    const signature = `<pre class="signature">${escapeHtml(node.signature)}</pre><div class="result">${escapeHtml(node.result)}</div>`;
    const type = model.types.Order.direct.includes(node.id)
      ? '<button type="button" class="type-link" data-type="Order">型参照: Order</button>'
      : '';
    return `<div class="detail-columns"><div>${section('このメソッドのシグネチャ', signature + type)}${section('コードを読んだ補足（手入力・node ではない）', list(node.notes))}</div><div>${section('読む property / getter', readLinks(node) || '<p class="muted">注入先クラスの property 読み取りなし（対象メソッド内）。</p>')}${section('呼び元（表示範囲内）', incoming.length ? incoming.map((edge) => nodeLink(edge.from, edge.expression)).join('') : '<p class="muted">表示範囲内のメソッドからの呼出なし。HTTP ルート・範囲外からの呼出は別です。</p>')}${section('呼出先（表示範囲内）', outgoing.length ? outgoing.map((edge) => nodeLink(edge.to, edge.expression)).join('') : '<p class="muted">表示範囲内へのメソッド呼出なし。</p>')}</div></div>`;
  }

  function methodInternal(node) {
    const outgoing = model.edges.filter((edge) => edge.from === node.id);
    return `<div class="detail-columns"><div>${section('読む property / getter', readLinks(node) || '<p class="muted">対象となる読み取りなし。</p>')}${section('このメソッド内にある直接呼出', outgoing.length ? outgoing.map((edge) => nodeLink(edge.to, edge.expression)).join('') : '<p class="muted">表示中のメソッドへの直接呼出なし。</p>')}<p class="muted">同じ宣言へのリンクです。処理を意味で分割した擬似 node は作りません。</p></div><div>${section('その先の呼出・データ参照（地図では未展開）', `<ul class="reference-list">${node.references.map((ref) => `<li>${escapeHtml(ref)}</li>`).join('')}</ul>`)}${section('境界をまたぐ影響・補足', list(node.notes))}</div></div>`;
  }

  function sourceView(node) {
    const group = groups.get(node.group);
    return `<p class="source-file">${escapeHtml(group.file)}<br>${escapeHtml(group.id)} → ${escapeHtml(node.name)}()</p><pre class="signature">${escapeHtml(node.signature)}</pre><p class="muted">同じメソッドの抜粋。抜粋間のコードは省略しています。シグネチャ・抜粋・宣言元は検証スクリプトで実ファイルと照合します。</p>${node.snippets.map((snippet) => `<pre class="source-block">${escapeHtml(snippet)}</pre>`).join('<p class="muted">… 省略 …</p>')}`;
  }

  function groupView(group) {
    const members = model.nodes.filter((node) => node.group === group.id);
    const fields = model.properties.filter((property) => property.group === group.id);
    const dependencies = model.reads.filter((read) =>
      members.some((node) => node.id === read.from),
    );
    return `<div class="detail-columns"><div>${fields.length ? section('この class の property / getter', fields.map((property) => propertyLink(property.id)).join('')) : ''}${members.length ? section('この class が宣言するメソッド（表示範囲）', members.map((node) => nodeLink(node.id, node.signature)).join('')) : ''}${dependencies.length ? section('メソッドが読む外部 property', [...new Set(dependencies.map((read) => read.to))].map((id) => propertyLink(id)).join('')) : ''}</div><div>${section('実体との対応', `<p class="source-file">${escapeHtml(group.file)}</p><p class="muted">この囲みは <code>${escapeHtml(group.id)}</code> の宣言に対応します。group 自体は関数 node ではありません。</p>`)}${section('この class の表示していないメンバー', `<p class="muted">${group.omitted.map((name) => `<code>${escapeHtml(name)}()</code>`).join(' / ')} ${(group.omittedAccessors || []).map((name) => `<code>get ${name}</code>`).join(' / ')}</p><p class="muted">コンストラクター・無名コールバックは表示範囲外。</p>`)}${group.extends ? section('extends / 設定の登録', `<p>${group.id} extends ${group.extends}</p><p class="source-file">${group.registration.file}</p><pre class="source-block">${escapeHtml(group.registration.snippet)}</pre>`) : ''}${section('implements（呼出関係とは別）', `<p class="muted">${group.implements.length ? group.implements.map(escapeHtml).join(', ') : 'このクラス宣言に implements 節なし。'}</p>`)}</div></div>`;
  }

  function typeView() {
    const type = model.types.Order;
    const before = type.status.map((s) => `'${s}'`).join(' | ');
    const diff = state.change
      ? `<div class="diff-columns"><div><h3 class="section-label">現在の status</h3><pre class="source-block">${before}</pre></div><div><h3 class="section-label">仮変更後（実コードは変更しない）</h3><pre class="source-block after">${before}\n| 'refunded'</pre></div></div>`
      : `<pre class="source-block">status: ${before}</pre>`;
    return `<div class="detail-columns"><div><p class="source-file">${type.file}</p><pre class="signature">${escapeHtml(type.declaration)}</pre>${diff}<p class="muted">型情報は関数 node とは別です。独立した Domain クラスではなく、DB スキーマから導出された型です。</p></div><div>${section('Order を戻り値型に明示しているメソッド', type.direct.map((id) => nodeLink(id)).join(''))}${section('返却値を利用する呼び元（今回の仮変更で確認する範囲）', type.propagated.map((id) => nodeLink(id)).join(''))}<p class="warning">getOrderItems() は Order を返しません。別の orderItems スキーマを読むため、今回の型変更の対象には含めません。影響の自動抽出は未実装です。</p></div></div>`;
  }

  function scopeView() {
    return `<div class="detail-columns"><div>${section('地図上の class group', model.groups.map((group) => `<button type="button" class="relation" data-select-group="${group.id}">${group.id}<small>${group.file}</small></button>`).join(''))}</div><div>${section('表示の規則と範囲', list(['対象メソッド内の注入先へのアクセスは、呼ぶ／読むのどちらかで表示する。', 'DrizzleService.db は property、JwtConfig.secret は実在する getter として表示。架空の getter や Repository は作らない。', 'コンストラクター・無名コールバック・フレームワーク・ORM・KV・mitt の内部は未展開。property の先の ORM 呼出も各メソッドの詳細に記す。', '注入先の静的な型 JwtConfig と、ec-backend が登録する EcJwtConfig を区別する。設定値自体は表示しない。', 'イベント配送先の自動解決、全呼出・型影響の網羅は未実装。線がないことは依存がないことの証明ではない。']))}<p class="warning">DB・KV・イベントの境界をまたぐ影響は createOrder の詳細に記載。性能・並行実行・例外変換全体は未検証。</p></div></div>`;
  }

  function renderInspector() {
    let title, location, body, badge;
    const isNode = state.kind === 'node';
    if (isNode) {
      const node = nodes.get(state.id);
      const group = groups.get(node.group);
      title = `${node.name}()`;
      location = `${group.layer} / <button type="button" data-select-group="${group.id}">${group.id}</button> / method`;
      badge = '1 method = 1 node';
      body =
        state.tab === 'boundary'
          ? methodBoundary(node)
          : state.tab === 'internal'
            ? methodInternal(node)
            : sourceView(node);
    } else if (state.kind === 'property') {
      const property = properties.get(state.id);
      const group = groups.get(property.group);
      title = property.name;
      location = `${group.layer} / <button type="button" data-select-group="${group.id}">${group.id}</button> / ${property.kind}`;
      badge =
        property.kind === 'getter' ? 'getter · 実在するアクセサー' : 'property · メソッドではない';
      body = propertyView(property);
    } else if (state.kind === 'group') {
      const group = groups.get(state.id);
      title = group.id;
      location = `${group.layer} / class`;
      badge = 'class group';
      body = groupView(group);
    } else if (state.kind === 'type') {
      title = 'Order';
      location = '型情報 / src/infra/db/schema.ts';
      badge = 'type · 関数 node ではない';
      body = typeView();
    } else {
      title = '表示範囲';
      location = 'ec-backend / 手入力 fixture';
      badge = '9 methods / 3 properties';
      body = scopeView();
    }
    const tabNames = {
      boundary: '境界の契約',
      internal: '内部の呼出・参照',
      source: '実コードとの対応',
    };
    inspector.innerHTML = `<div class="inspector-head"><div><div class="detail-location">${location}</div><h2 id="detail-title">${escapeHtml(title)}</h2></div><span class="detail-badge">${badge}</span></div>${isNode ? `<div class="tabs" role="tablist" aria-label="読む深さ">${tabs.map((tab) => `<button type="button" id="tab-${tab}" data-tab="${tab}" role="tab" aria-selected="${state.tab === tab}" aria-controls="detail-content" tabindex="${state.tab === tab ? 0 : -1}">${tabNames[tab]}</button>`).join('')}</div>` : ''}<div id="detail-content" class="detail-body" ${isNode ? `role="tabpanel" aria-labelledby="tab-${state.tab}"` : 'aria-labelledby="detail-title"'} tabindex="0">${body}</div>`;
  }

  function render() {
    renderInspector();
    const impacts = [...model.types.Order.direct, ...model.types.Order.propagated];
    document.querySelectorAll('[data-node]').forEach((el) => {
      const node = nodes.get(el.dataset.node);
      const selected = state.kind === 'node' && state.id === node.id;
      el.classList.toggle('selected', selected);
      el.classList.toggle('dimmed', state.flow !== 'all' && !node.flows.includes(state.flow));
      el.classList.toggle('impacted', state.change && impacts.includes(node.id));
      el.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-group]').forEach((el) => {
      el.hidden = viewOf(groups.get(el.dataset.group)) !== state.view;
      const selected = state.kind === 'group' && state.id === el.dataset.group;
      el.classList.toggle('selected', selected);
      el.querySelector('.group-heading').setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-edge]').forEach((el) => {
      el.style.display = state.view === 'orders' ? '' : 'none';
      const edge = model.edges[Number(el.dataset.edge)];
      el.classList.toggle('dimmed', state.flow !== 'all' && edge.flow !== state.flow);
      el.classList.toggle(
        'focused',
        state.kind === 'node' && (edge.from === state.id || edge.to === state.id),
      );
    });
    document.querySelectorAll('[data-property]').forEach((el) => {
      const selected = state.kind === 'property' && state.id === el.dataset.property;
      el.classList.toggle('selected', selected);
      el.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-read-edge]').forEach((el) => {
      const read = model.reads[Number(el.dataset.readEdge)];
      const shown = viewOf(groups.get(nodes.get(read.from).group)) === state.view;
      el.style.display = shown ? '' : 'none';
      el.classList.toggle(
        'dimmed',
        state.view === 'orders' && state.flow !== 'all' && read.flow !== state.flow,
      );
      el.classList.toggle('focused', state.id === read.from || state.id === read.to);
    });
    document.getElementById('architecture-map').dataset.view = state.view;
    document.querySelectorAll('[data-view]').forEach((el) => {
      if (el.tagName === 'BUTTON')
        el.setAttribute('aria-pressed', String(el.dataset.view === state.view));
    });
    const configView = state.view === 'config';
    document.querySelector('.flow-nav').style.visibility = configView ? 'hidden' : '';
    document.querySelector('.scenario-toggle').style.visibility = configView ? 'hidden' : '';
    document.querySelector('.type-strip').style.visibility = configView ? 'hidden' : '';
    document.getElementById('map-title').textContent = configView
      ? '認証と設定の依存'
      : '注文の依存関係';
    document.getElementById('map-caption').textContent = configView
      ? '注入先の型と override 宣言を区別 · EcJwtConfig は createEcApp の configs に登録'
      : '呼ぶ先・読む先を表示 · 選択・flow 切替で位置は固定';
    document.querySelectorAll('[data-flow]').forEach((el) => {
      el.setAttribute('aria-pressed', String(el.dataset.flow === state.flow));
    });
    document
      .querySelector('[data-action="toggle-change"]')
      .setAttribute('aria-pressed', String(state.change));
    document.querySelector('.type-strip').classList.toggle('changing', state.change);
    document.getElementById('type-status').textContent = state.change
      ? "仮変更: status に 'refunded' を追加 · 4メソッドを確認"
      : '関数 node ではありません';
    document.getElementById('scope-label').textContent =
      state.view === 'config'
        ? 'JWT 検証 · config の getter 読み取りと継承'
        : state.flow === 'all'
          ? '2 flows · 5 classes · 8 methods + db property'
          : `${state.flow === 'create' ? '注文作成' : '注文照会'}を強調 · 他の node の位置は保持`;
  }

  function select(kind, id) {
    if (
      (kind === 'node' && !nodes.has(id)) ||
      (kind === 'group' && !groups.has(id)) ||
      (kind === 'property' && !properties.has(id)) ||
      (kind === 'type' && id !== 'Order')
    )
      throw new Error(`Unknown selection: ${kind}/${id}`);
    state.kind = kind;
    state.id = id;
    state.tab = 'boundary';
    if (kind === 'node') state.view = viewOf(groups.get(nodes.get(id).group));
    if (kind === 'property') state.view = viewOf(groups.get(properties.get(id).group));
    if (kind === 'group') state.view = viewOf(groups.get(id));
    if (kind === 'type') state.view = 'orders';
    render();
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.select) return select('node', button.dataset.select);
    if (button.dataset.selectGroup) return select('group', button.dataset.selectGroup);
    if (button.dataset.selectProperty) return select('property', button.dataset.selectProperty);
    if (button.dataset.view) {
      state.flow = 'all';
      return button.dataset.view === 'orders'
        ? select('group', 'OrderService')
        : select('node', 'JwtService.verify');
    }
    if (button.dataset.type) return select('type', button.dataset.type);
    if (button.dataset.tab) {
      state.tab = button.dataset.tab;
      render();
      document.getElementById(`tab-${state.tab}`).focus({ preventScroll: true });
      return;
    }
    if (button.dataset.flow) {
      state.flow = button.dataset.flow;
      render();
      return;
    }
    switch (button.dataset.action) {
      case 'toggle-change':
        state.change = !state.change;
        select('type', 'Order');
        break;
      case 'scope':
        select('scope', 'scope');
        break;
      case 'help':
        help.showModal();
        break;
      case 'close-help':
        help.close();
        break;
      case 'reset':
        state = initial();
        render();
        document.querySelector('.map-scroll').scrollLeft = 0;
        break;
    }
  });
  inspector.addEventListener('keydown', (event) => {
    if (
      event.target.getAttribute('role') !== 'tab' ||
      !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)
    )
      return;
    event.preventDefault();
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 2
          : (tabs.indexOf(state.tab) + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
    state.tab = tabs[index];
    render();
    document.getElementById(`tab-${state.tab}`).focus({ preventScroll: true });
  });
  validateModel();
  buildMap();
  render();
})();
