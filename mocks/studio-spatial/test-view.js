/* Inspector reads test associations; it never extends the graph's active scope. */
function ecTestList(id) {
  const fixture = window.EC_TESTS;
  const ids = new Set(ecSeed(id));
  const unit = fixture.unit.filter((test) => ids.has(test.target));
  const endpoints = ecModel.roots.filter((root) => root.kind === 'HTTP' && ids.has(root.id));
  const isGroup = ecGroups.has(id);
  const provenance = (test) => ecEscape(`${test.suite}\n${test.file}:${test.line}`);
  const table = (heading, rows, label) =>
    `<div class="test-table-scroll" tabindex="0" role="region" aria-label="${label}"><table class="test-table"><thead><tr>${heading.map((name) => `<th scope="col">${name}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const unitRows = unit
    .map((test) => {
      const { style, mocks } = fixture.summarizeSetup(fixture.setups[test.setup]);
      return `<tr class="unit-test" data-test-line="${test.line}"><td title="${provenance(test)}">${ecEscape(test.name)}</td>${isGroup ? `<td>${ecButton(test.target, test.target.split('.').at(-1))}</td>` : ''}<td class="test-style">${style ?? '未判定'}</td><td class="test-mocks">${mocks === null ? '未確認' : mocks.length ? mocks.map(ecEscape).join(', ') : 'なし'}</td></tr>`;
    })
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
      const rows = tests
        .map(
          (test) =>
            `<tr class="e2e-test" data-test-line="${test.line}"><td title="${provenance(test)}">${ecEscape(test.name)}</td><td class="test-suite">${ecEscape(test.suite.replace('Product API / ', ''))}</td><td class="test-source" title="${ecEscape(test.file)}">${ecEscape(test.file.split('/').at(-1))}:${test.line}</td></tr>`,
        )
        .join('');
      return `<section class="endpoint-tests"><h4 title="${ecEscape(endpoint.id)}">${ecEscape(endpoint.label)}</h4>${tests.length ? table(['test名', 'suite', '出典'], rows, '関連E2E一覧') : '<p class="muted">未収録（テストの有無は未確認）</p>'}</section>`;
    })
    .join('');
  return `<div class="contract-tests"><section aria-label="Unit tests"><h3>Unit tests <small>${unit.length || ''}</small></h3>${unit.length ? table(['test名', ...(isGroup ? ['対象'] : []), '分類', 'mock対象'], unitRows, 'Unit test一覧') : `<p class="muted">${empty}</p>`}<p class="test-coverage">収録: jwt.service.test.ts（6件）</p></section>${endpoints.length ? `<section aria-label="Endpointの関連E2E"><h3>Endpointの関連E2E</h3>${e2e}<p class="test-coverage">収録: product.spec.ts の本体内request（準備を含む）。共通setup・他ファイルは未収録。method実行の保証ではありません。</p></section>` : ''}</div>`;
}
