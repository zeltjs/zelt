/* Inspector reads test associations; it never extends the graph's active scope. */
function ecTestList(id) {
  const fixture = window.EC_TESTS;
  const ids = new Set(ecSeed(id));
  const unit = fixture.unit.filter((test) => ids.has(test.target));
  const endpoints = ecModel.roots.filter((root) => root.kind === 'HTTP' && ids.has(root.id));
  const provenance = (test) =>
    `<small class="test-location">${ecEscape(test.suite)}<br>${ecEscape(test.file)}:${test.line}</small>`;
  const unitRows = unit
    .map(
      (test) =>
        `<li class="unit-test" data-test-line="${test.line}"><div class="test-title"><strong>${ecEscape(test.name)}</strong><span class="test-style">${ecEscape(test.style)}</span></div>${provenance(test)}<p>対象: ${ecEscape(test.target)} · Mock: ${test.mocks.length ? test.mocks.map(ecEscape).join(', ') : 'なし'}</p><details><summary>対応・分類の根拠</summary><p>${ecEscape(test.evidence)}</p><p>${ecEscape(test.config)}</p></details></li>`,
    )
    .join('');
  const group = ecOwner(id);
  const empty = group.file.startsWith('integration/ec-backend/src/')
    ? '対応するUnit testなし（ec-backend内にUnit testファイルなし）'
    : group.id === 'JwtService'
      ? '収録ファイル内に、この宣言を対象とするUnit testなし'
      : '未収録（テストの有無は未確認）';
  const e2e = endpoints
    .map((endpoint) => {
      const tests = fixture.e2e.filter((test) => test.targets.includes(endpoint.id));
      return `<section class="endpoint-tests"><h4>${ecEscape(endpoint.label)}</h4><p class="muted">${ecEscape(endpoint.id)}</p>${tests.length ? `<ul class="test-list">${tests.map((test) => `<li class="e2e-test" data-test-line="${test.line}"><strong>${ecEscape(test.name)}</strong>${provenance(test)}<details><summary>リクエストの対応</summary><p>${ecEscape(endpoint.id.endsWith('.create') ? 'createProduct → authRequest → http.request（POST /api/products）' : endpoint.id.endsWith('.update') || endpoint.id.endsWith('.remove') ? 'authRequest → http.request。HTTP methodとURLをroute登録に対応付け。' : 'http.request（GET）。URLをroute登録に対応付け。')}</p><p>テスト本体内のリクエスト（準備の呼出も含む）。method本体の実行・網羅を保証しません。</p></details></li>`).join('')}</ul>` : '<p class="muted">未収録（テストの有無は未確認）</p>'}</section>`;
    })
    .join('');
  return `<div class="contract-tests"><section aria-label="Unit tests"><h3>Unit tests <small>${unit.length || ''}</small></h3>${unit.length ? `<ul class="test-list">${unitRows}</ul>` : `<p class="muted">${empty}</p>`}<p class="test-coverage">収録: JwtService の6件。describeの対象メソッドと直接呼出を照合。準備だけの呼出・下流経由は対象に追加しません。</p></section>${endpoints.length ? `<section aria-label="Endpointの関連E2E"><h3>Endpointの関連E2E</h3><p class="test-coverage">収録: product.spec.ts のテスト本体内リクエストのみ。共通setup・他ファイルは未収録。Unitとは別の対応です。</p>${e2e}</section>` : ''}</div>`;
}
