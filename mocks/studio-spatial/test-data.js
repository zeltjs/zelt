/* Source-backed, deliberately bounded fixture. Not a test extractor. */
window.EC_TESTS = (() => {
  const unitFile = 'packages/auth-jwt/src/jwt.service.test.ts';
  const e2eFile = 'integration/ec-backend/e2e/product.spec.ts';
  const unit = [
    ['sign', 33, 'should generate a valid JWT token'],
    ['verify', 43, 'should verify and return payload for valid token'],
    ['verify', 53, 'should throw error for invalid token'],
    ['verify', 57, 'should throw error for tampered token'],
    ['decode', 66, 'should decode token without verification'],
    ['decode', 74, 'should return null for invalid token'],
  ].map(([method, line, name]) => ({
    file: unitFile,
    line,
    name,
    target: `JwtService.${method}`,
    suite: `JwtService / ${method}`,
    style: 'Sociable',
    mocks: [],
    evidence: `describe('${method}') 内で jwtService.${method} を直接呼出。createTestTarget(JwtService) を使用。joseは実装を利用。`,
    config: 'JwtConfig → TestJwtConfig（値の差し替え。実装のmockではない）',
  }));
  const e2e = [
    [22, 'returns empty list initially', 'GET /api/products', ['list']],
    [32, 'uses default pagination', 'GET /api/products', ['list']],
    [41, 'creates a product', 'POST /api/products', ['create']],
    [59, 'rejects invalid data', 'POST /api/products', ['create']],
    [67, 'rejects missing required fields', 'POST /api/products', ['create']],
    [74, 'returns product detail', 'GET /api/products/:id', ['create', 'detail']],
    [92, 'returns 404 for non-existent product', 'GET /api/products/:id', ['detail']],
    [97, 'returns 400 for invalid id', 'GET /api/products/:id', ['detail']],
    [104, 'updates a product', 'PUT /api/products/:id', ['create', 'update']],
    [126, 'returns 404 for non-existent product', 'PUT /api/products/:id', ['update']],
    [135, 'deletes a product', 'DELETE /api/products/:id', ['create', 'remove', 'detail']],
    [157, 'returns 404 for non-existent product', 'DELETE /api/products/:id', ['remove']],
    [182, 'paginates results', 'Pagination and filtering', ['list']],
    [191, 'filters by category', 'Pagination and filtering', ['list']],
    [198, 'filters by price range', 'Pagination and filtering', ['list']],
    [206, 'ignores invalid query params gracefully', 'Pagination and filtering', ['list']],
  ].map(([line, name, suite, methods]) => ({
    file: e2eFile,
    line,
    name,
    suite: `Product API / ${suite}`,
    targets: methods.map((method) => `ProductController.${method}`),
  }));
  return { unitFile, e2eFile, unit, e2e };
})();
