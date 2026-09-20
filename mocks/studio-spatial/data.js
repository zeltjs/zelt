/* Fixed, source-backed fixture. No source analysis runs in the browser. */
(() => {
  const ec = 'integration/ec-backend/src/';
  const http = 'packages/core/src/features/http/';
  const groups = [];
  const declarations = [];
  const edges = [];
  const roots = [];
  const columns = [
    'Entry / Middleware',
    'Use case',
    'Domain',
    'Port / interface',
    'Adapter / package service',
    'Config',
  ];
  function group(id, file, column, y, members, options = {}) {
    const value = { id, file, column, y, kind: 'class', ...options };
    groups.push(value);
    for (const item of members) {
      const [name, kind = 'method', hint = '', extra = {}] =
        typeof item === 'string' ? [item] : item;
      const memberId = value.kind === 'file' ? name : `${id}.${name}`;
      declarations.push({ id: memberId, name, group: id, kind, hint, ...extra });
    }
  }
  function edge(from, to, kind, expression, evidence) {
    edges.push({ from, to, kind, expression, evidence });
  }
  const call = (from, to, expression) => edge(from, to, 'call', expression);
  const read = (from, to, expression) => edge(from, to, 'read', expression);
  const ref = (from, to, expression) => edge(from, to, 'type', expression);
  const method = (name, hint, extra = {}) => [name, 'method', hint, extra];
  const property = (name, hint) => [name, 'property', hint];
  const getter = (name, hint) => [name, 'getter', hint];
  const ctor = ['constructor', 'constructor', 'DI / 初期化'];

  group('AuthController', `${ec}entry/controllers/auth.controller.ts`, 0, 70, [
    method('register', 'POST /api/auth/register'),
    method('login', 'POST /api/auth/login'),
    method('me', 'GET /api/auth/me'),
    ctor,
  ]);
  group('ProductController', `${ec}entry/controllers/product.controller.ts`, 0, 370, [
    method('list', 'GET /api/products/'),
    method('detail', 'GET /api/products/:id'),
    method('create', 'POST /api/products/'),
    method('update', 'PUT /api/products/:id'),
    method('remove', 'DELETE /api/products/:id'),
    ctor,
  ]);
  group('CartController', `${ec}entry/controllers/cart.controller.ts`, 0, 780, [
    method('getCart', 'GET /api/cart/'),
    method('addItem', 'POST /api/cart/items'),
    method('updateItem', 'PUT /api/cart/items/:productId'),
    method('removeItem', 'DELETE /api/cart/items/:productId'),
    method('clearCart', 'DELETE /api/cart/'),
    ctor,
  ]);
  group('OrderController', `${ec}entry/controllers/order.controller.ts`, 0, 1190, [
    method('create', 'POST /api/orders/'),
    method('list', 'GET /api/orders/'),
    method('detail', 'GET /api/orders/:id'),
    ctor,
  ]);
  group(
    'OrderHandlers',
    `${ec}entry/job/order.handlers.ts`,
    0,
    1490,
    [
      [
        'startup@order:created',
        'callback',
        'EVENT order:created · 無名関数',
        { name: '(data) => …', owner: 'startup' },
      ],
      method('startup', 'lifecycle · 購読を登録'),
      method('shutdown', 'lifecycle · 購読解除'),
      ctor,
      property('notifications', '受信結果の配列'),
      property('unsubscribes', '解除関数の配列'),
    ],
    {
      notes:
        'event受信はstartup内のon第2引数の無名関数。startup自体は受信ハンドラーではない。notificationsはプロセス内メモリ。',
    },
  );
  group('LoggingMiddleware', `${ec}entry/middleware/logging.middleware.ts`, 0, 1900, [
    method('use', '全HTTP · next後に記録'),
    ctor,
  ]);
  group('JwtMiddleware', 'packages/auth-jwt/src/jwt.middleware.ts', 0, 2100, [
    method('use', 'JWT検証 / user設定'),
    method('extractToken', 'header / cookie'),
    ctor,
  ]);
  group('RateLimitMiddleware', 'packages/rate-limit/src/rate-limit.middleware.ts', 0, 2350, [
    method('use', 'register / login'),
    ctor,
  ]);
  group('CorsMiddleware', `${http}middleware/cors/cors.middleware.ts`, 0, 2550, [
    method('use', '全HTTP · core自動登録'),
    method('isEnabled', 'origin設定の判定'),
    ctor,
    property('delegate', 'Honoのmiddlewareラッパー'),
  ]);
  group(
    'SecureHeadersMiddleware',
    `${http}middleware/secure-headers/secure-headers.middleware.ts`,
    0,
    2850,
    [method('use', '全HTTP · core自動登録'), method('applyHeader', 'レスポンスヘッダー'), ctor],
  );
  group(
    'current-user.lib.ts',
    `${ec}entry/controllers/current-user.lib.ts`,
    0,
    3100,
    [['requireUser', 'function', 'request context → EcUser']],
    { kind: 'file' },
  );
  group(
    'app.ts',
    `${ec}app.ts`,
    0,
    3250,
    [['createEcApp', 'function', 'HTTP / eventbus / configs']],
    { kind: 'file' },
  );

  group(
    'AuthService',
    `${ec}usecase/auth.service.ts`,
    1,
    70,
    [
      method('register', 'RegisterInput → user'),
      method('login', 'email / password → token'),
      method('getProfile', 'userId → profile | undefined'),
      ctor,
    ],
    {
      notes:
        'usersを直接読む/書く。passwordHashは返さない。registerの重複は409、loginの失敗は401。',
    },
  );
  group(
    'ProductService',
    `${ec}usecase/product.service.ts`,
    1,
    370,
    [
      method('findAll', '条件 / page → items + total'),
      method('findById', 'id → Product | undefined'),
      method('create', 'CreateProductInput → Product'),
      method('update', 'id / input → Product | undefined'),
      method('remove', 'id → boolean'),
      ctor,
    ],
    { notes: 'productsテーブルを注文処理と共有。update/removeの存在確認と変更は別クエリ。' },
  );
  group(
    'CartService',
    `${ec}usecase/cart.service.ts`,
    1,
    780,
    [
      method('getCart', 'userId → CartData'),
      method('addItem', '商品 / 数量 → CartData'),
      method('updateQuantity', '数量0ならremoveItem'),
      method('removeItem', '商品削除 → CartData'),
      method('clearCart', 'userId → void'),
      ctor,
      property('store', 'KVStore · namespace cart:'),
    ],
    {
      notes:
        '商品情報・在庫はProductServiceから取得。KVにカートを保存（TTL 86400秒）。get→setはトランザクションではない。',
    },
  );
  group(
    'OrderService',
    `${ec}usecase/order.service.ts`,
    1,
    1240,
    [
      method('createOrder', 'userId → Order'),
      method('findByUser', 'userId / page → items + total'),
      method('findById', 'orderId / userId → Order | undefined'),
      method('getOrderItems', 'orderId → orderItems[]'),
      ctor,
    ],
    {
      notes:
        'products在庫更新・orders・orderItems挿入は1 DB transaction。その完了後にKV削除とevent発行。DB / KV / eventを跨ぐ原子性はない。findByIdは所有者も確認するがgetOrderItems単独では確認しない。',
    },
  );
  group(
    'auth.service.ts',
    `${ec}usecase/auth.service.ts`,
    1,
    1630,
    [
      ['hashPassword', 'function', 'password → hash'],
      ['verifyPassword', 'function', 'password / hash → boolean'],
      ['scryptAsync', 'value', 'promisify(scrypt) · 宣言関数ではない'],
    ],
    { kind: 'file' },
  );
  group(
    'cart.service.ts',
    `${ec}usecase/cart.service.ts`,
    1,
    1870,
    [
      ['CartData', 'type', 'readonly items'],
      ['CartItem', 'type', 'productId / quantity / price'],
      ['CART_TTL_SEC', 'value', 'KV TTL'],
    ],
    { kind: 'file' },
  );

  group(
    'auth.schema.ts',
    `${ec}domain/auth.schema.ts`,
    2,
    70,
    [
      ['RegisterSchema', 'schema', 'email / password / name'],
      ['LoginSchema', 'schema', 'email / password'],
      ['RegisterInput', 'type', 'InferOutput<RegisterSchema>'],
      ['LoginInput', 'type', 'InferOutput<LoginSchema>'],
    ],
    { kind: 'file' },
  );
  group(
    'product.schema.ts',
    `${ec}domain/product.schema.ts`,
    2,
    370,
    [
      ['CreateProductSchema', 'schema', '商品入力'],
      ['UpdateProductSchema', 'schema', 'optionalな商品入力'],
      ['CreateProductInput', 'type', 'InferOutput<CreateProductSchema>'],
      ['UpdateProductInput', 'type', 'InferOutput<UpdateProductSchema>'],
    ],
    { kind: 'file' },
  );
  group(
    'cart.schema.ts',
    `${ec}domain/cart.schema.ts`,
    2,
    780,
    [
      ['AddToCartSchema', 'schema', 'productId / quantity >= 1'],
      ['UpdateCartItemSchema', 'schema', 'quantity >= 0'],
      ['AddToCartInput', 'type', 'InferOutput<AddToCartSchema>'],
      ['UpdateCartItemInput', 'type', 'InferOutput<UpdateCartItemSchema>'],
    ],
    { kind: 'file' },
  );
  group(
    'user.types.ts',
    `${ec}domain/user.types.ts`,
    2,
    1100,
    [['EcUser', 'type', 'readonly id / email']],
    { kind: 'file' },
  );
  group(
    'order.events.ts',
    `${ec}domain/order.events.ts`,
    2,
    1280,
    [['order:created', 'event-type', 'EventBusSchema拡張 / payload']],
    { kind: 'file' },
  );

  group(
    'KVStore',
    'packages/kv/src/kv.types.ts',
    3,
    780,
    [
      ['get', 'signature', 'key → T | undefined'],
      ['set', 'signature', 'key / value / TTL → void'],
      ['del', 'signature', 'key → void'],
    ],
    {
      kind: 'interface',
      boundary: true,
      notes:
        'CartService.storeの静的な型。実装はMemoryKVAdaptor.namespaceが返すMemoryKVStore。アプリ独自のRepository Portではない。',
    },
  );
  group(
    'AtomicKVStore',
    'packages/kv/src/kv.types.ts',
    3,
    1030,
    [
      ['incr', 'signature', 'atomic increment'],
      ['setnx', 'signature', 'atomic set if absent'],
      ['namespace', 'signature', 'prefix → AtomicKVStore'],
    ],
    {
      kind: 'interface',
      boundary: true,
      notes: 'KVStoreを継承する実在の契約。MemoryKVStoreのimplements先はこのinterface。',
    },
  );
  group(
    'EventBusAdaptor',
    'packages/eventbus/src/eventbus.types.ts',
    3,
    1280,
    [
      ['emit', 'signature', 'event / payload'],
      ['on', 'signature', 'event / handler → unsubscribe'],
      ['once', 'signature', 'event / handler → unsubscribe'],
    ],
    {
      kind: 'interface',
      boundary: true,
      notes:
        'MemoryEventBusAdaptorが実装する契約。OrderServiceはinterfaceではなく具体classをinjectする。',
    },
  );

  group(
    'DrizzleService',
    `${ec}infra/db/drizzle.service.ts`,
    4,
    70,
    [
      property('db', 'BetterSQLite3Database<typeof schema>'),
      property('sqlite', 'Database.Database'),
      ctor,
      method('initSchema', 'DDL / tables作成'),
      method('startup', 'lifecycle · 空実装'),
      method('shutdown', 'SQLite接続を閉じる'),
    ],
    {
      notes:
        'SQLite :memory:。注文・商品・ユーザーで同じDB接続を共有する。Repository Portは存在しない。ORMのselect等はDrizzleServiceのメソッドではない。',
    },
  );
  group(
    'schema.ts',
    `${ec}infra/db/schema.ts`,
    4,
    490,
    [
      ['users', 'table', 'users'],
      ['products', 'table', 'products'],
      ['orders', 'table', 'orders'],
      ['orderItems', 'table', 'order_items'],
      ...[
        'User',
        'NewUser',
        'Product',
        'NewProduct',
        'Order',
        'NewOrder',
        'OrderItem',
        'NewOrderItem',
      ].map((name) => [name, 'type', 'DB schema由来']),
    ],
    {
      kind: 'file',
      notes:
        'Domain列に移して丸めない。型はsrc/infra/db/schema.tsの$inferSelect / $inferInsert由来。',
    },
  );
  group(
    'MemoryKVAdaptor',
    'packages/kv/src/adaptor-memory/memory-kv.adaptor.ts',
    4,
    1220,
    [method('namespace', 'prefix → AtomicKVStore')],
    {
      boundary: true,
      notes: 'ライブラリ内部は未展開。namespaceは実在するMemoryKVStoreをnewして返す。',
    },
  );
  group(
    'MemoryKVStore',
    'packages/kv/src/adaptor-memory/memory-kv.adaptor.ts',
    4,
    1380,
    [
      method('get', 'key → T | undefined'),
      method('set', 'key / value / TTL'),
      method('del', 'key → void'),
    ],
    {
      boundary: true,
      notes: 'AtomicKVStoreを実装（KVStoreを継承）。内部のKVUtilService / Map / TTL GC等は未展開。',
    },
  );
  group(
    'MemoryEventBusAdaptor',
    'packages/eventbus/src/adaptor-memory/memory-event-bus.adaptor.ts',
    4,
    1630,
    [
      method('emit', 'event / payload'),
      method('on', 'event / handler → unsubscribe'),
      method('once', 'event / handler → unsubscribe'),
    ],
    {
      boundary: true,
      notes:
        'mittを使うin-process bus。emitはthis.emitter.emitを呼ぶ。ネットワーク配送・永続キューではない。内部は未展開。',
    },
  );
  group(
    'JwtService',
    'packages/auth-jwt/src/jwt.service.ts',
    4,
    1880,
    [
      method('sign', 'payload → token'),
      method('verify', 'token → JwtPayload'),
      method('decode', 'token → JwtPayload | null'),
      method('parseExpiresIn', 'duration → string | number'),
      ctor,
    ],
    {
      notes: 'AuthService.loginとJwtMiddleware.useが同じclassを使う。joseライブラリ内部は未展開。',
    },
  );
  group(
    'LoggerService',
    'packages/core/src/built-in-service/logger/logger.service.ts',
    4,
    2240,
    [method('info', 'message / context → void')],
    {
      boundary: true,
      notes:
        'ここで内部展開を止める。info→log→LoggerConfig.level/transports、formatter、transportへの依存がある。依存なしではない。',
    },
  );
  group(
    'RateLimitService',
    'packages/rate-limit/src/rate-limit.service.ts',
    4,
    2400,
    [method('hit', 'key / options → result')],
    {
      boundary: true,
      notes:
        'ここで内部展開を止める。RateLimitConfig / AtomicKVStore / Loggerを使う。KV失敗時の挙動はfailureModeに依存する。',
    },
  );
  group(
    'LifecycleManager',
    'packages/core/src/kernel/lifecycle.lib.ts',
    4,
    2580,
    [method('register', 'lifecycle → ReadyValue | undefined')],
    {
      boundary: true,
      notes:
        'lifecycle登録の境界。startup / shutdownを実行するframework内部は未展開。registerの2つのoverload署名は同じ1実装に対応する。',
    },
  );

  group(
    'EcJwtConfig',
    `${ec}config/ec-jwt.config.ts`,
    5,
    70,
    [
      getter('secret', 'override · 値は非表示'),
      getter('expiresIn', 'override · 値は非表示'),
      getter('resolveUser', 'payload → Promise<ResolveUserResult>'),
      [
        'resolveUser@callback',
        'callback',
        'getterが返す無名関数',
        { name: 'async (payload) => …', owner: 'resolveUser' },
      ],
    ],
    {
      notes:
        'createEcAppのconfigsに登録。値を表示せず宣言・参照関係を示す。resolveUserの実装はpayloadからEcUserを構築し、DBは参照しない。',
    },
  );
  group(
    'JwtConfig',
    'packages/auth-jwt/src/jwt.config.ts',
    5,
    380,
    [
      getter('secret', '注入型のgetter'),
      getter('expiresIn', '注入型のgetter'),
      getter('driver', 'header / cookie'),
      getter('cookieName', 'cookie名'),
      getter('resolveUser', '返却関数の契約'),
    ],
    {
      boundary: true,
      notes:
        '静的な注入先の型。EcJwtConfigの登録とoverrideを別線で示す。基底secretはEnvを使うが、今回のoverrideは別実装。基底の内部依存は未展開。',
    },
  );
  group('EcCorsConfig', `${ec}config/ec-cors.config.ts`, 5, 750, [
    property('origin', 'override · 値は非表示'),
    property('credentials', 'override · 値は非表示'),
  ]);
  group(
    'CorsConfig',
    `${http}middleware/cors/cors.config.ts`,
    5,
    950,
    ['origin', 'allowMethods', 'allowHeaders', 'exposeHeaders', 'maxAge', 'credentials'].map(
      (name) => property(name, '設定値は非表示'),
    ),
  );
  group(
    'RateLimitConfig',
    'packages/rate-limit/src/rate-limit.config.ts',
    5,
    1370,
    [property('enabled', '設定値は非表示')],
    {
      boundary: true,
      notes:
        'defaultLimit / defaultWindowSec / kv / kvStoreNamespace / failureModeはRateLimitService側で使う。そちらの内部展開は未実施。',
    },
  );
  group(
    'SecureHeadersConfig',
    `${http}middleware/secure-headers/secure-headers.config.ts`,
    5,
    1560,
    [
      'crossOriginEmbedderPolicy',
      'crossOriginResourcePolicy',
      'crossOriginOpenerPolicy',
      'originAgentCluster',
      'referrerPolicy',
      'strictTransportSecurity',
      'xContentTypeOptions',
      'xDnsPrefetchControl',
      'xDownloadOptions',
      'xFrameOptions',
      'xPermittedCrossDomainPolicies',
      'xXssProtection',
      'removePoweredBy',
    ].map((name) => property(name, '設定値は非表示')),
  );

  for (const declaration of declarations.filter(
    (item) => /Controller$/.test(item.group) && item.kind === 'method',
  )) {
    roots.push({ id: declaration.id, kind: 'HTTP', label: declaration.hint });
  }
  roots.push({ id: 'OrderHandlers.startup@order:created', kind: 'Event', label: 'order:created' });
  for (const id of [
    'LoggingMiddleware',
    'JwtMiddleware',
    'RateLimitMiddleware',
    'CorsMiddleware',
    'SecureHeadersMiddleware',
  ]) {
    roots.push({ id: `${id}.use`, kind: 'Middleware', label: `${id}.use()` });
  }
  for (const id of [
    'createEcApp',
    'OrderHandlers.startup',
    'OrderHandlers.shutdown',
    'DrizzleService.constructor',
    'DrizzleService.startup',
    'DrizzleService.shutdown',
  ]) {
    roots.push({ id, kind: 'Lifecycle', label: id });
  }

  const mappings = {
    AuthController: {
      register: 'AuthService.register',
      login: 'AuthService.login',
      me: 'AuthService.getProfile',
    },
    ProductController: {
      list: 'ProductService.findAll',
      detail: 'ProductService.findById',
      create: 'ProductService.create',
      update: 'ProductService.update',
      remove: 'ProductService.remove',
    },
    CartController: {
      getCart: 'CartService.getCart',
      addItem: 'CartService.addItem',
      updateItem: 'CartService.updateQuantity',
      removeItem: 'CartService.removeItem',
      clearCart: 'CartService.clearCart',
    },
    OrderController: {
      create: 'OrderService.createOrder',
      list: 'OrderService.findByUser',
      detail: 'OrderService.findById',
    },
  };
  for (const [className, members] of Object.entries(mappings)) {
    const receiver = {
      AuthController: 'authService',
      ProductController: 'productService',
      CartController: 'cartService',
      OrderController: 'orderService',
    }[className];
    for (const [name, target] of Object.entries(members))
      call(`${className}.${name}`, target, `this.${receiver}.${target.split('.')[1]}`);
  }
  call('OrderController.detail', 'OrderService.getOrderItems', 'this.orderService.getOrderItems');
  for (const id of [
    'AuthController.me',
    ...roots
      .filter(
        (root) => root.id.startsWith('CartController.') || root.id.startsWith('OrderController.'),
      )
      .map((root) => root.id),
  ])
    call(id, 'requireUser', 'requireUser()');
  call('AuthService.register', 'hashPassword', 'hashPassword(data.password)');
  call('AuthService.login', 'verifyPassword', 'verifyPassword(password, user.passwordHash)');
  call('AuthService.login', 'JwtService.sign', 'this.jwtService.sign');
  read('hashPassword', 'scryptAsync', 'scryptAsync(password, salt, 64)');
  read('verifyPassword', 'scryptAsync', 'scryptAsync(password, salt, 64)');
  for (const groupId of ['AuthService', 'ProductService', 'OrderService']) {
    for (const node of declarations.filter((d) => d.group === groupId && d.kind === 'method'))
      read(node.id, 'DrizzleService.db', 'this.drizzle.db');
  }
  call('ProductService.update', 'ProductService.findById', 'this.findById(id)');
  call('ProductService.remove', 'ProductService.findById', 'this.findById(id)');
  for (const name of ['addItem', 'updateQuantity'])
    call(`CartService.${name}`, 'ProductService.findById', 'this.productService.findById');
  for (const name of ['addItem', 'updateQuantity', 'removeItem'])
    call(`CartService.${name}`, 'CartService.getCart', 'this.getCart(userId)');
  call(
    'CartService.updateQuantity',
    'CartService.removeItem',
    'this.removeItem(userId, productId)',
  );
  call('CartService.constructor', 'MemoryKVAdaptor.namespace', "this.kv.namespace('cart:')");
  for (const [methodName, targets] of Object.entries({
    getCart: ['get'],
    addItem: ['set'],
    updateQuantity: ['set'],
    removeItem: ['set', 'del'],
    clearCart: ['del'],
  })) {
    read(`CartService.${methodName}`, 'CartService.store', 'this.store');
    for (const target of targets)
      edge(`CartService.${methodName}`, `KVStore.${target}`, 'contract', `this.store.${target}`);
  }
  edge('MemoryKVAdaptor.namespace', 'MemoryKVStore', 'construct', 'new MemoryKVStore');
  edge('MemoryKVStore', 'AtomicKVStore', 'implements', 'implements AtomicKVStore');
  edge('AtomicKVStore', 'KVStore', 'extends', 'extends KVStore');
  edge('MemoryEventBusAdaptor', 'EventBusAdaptor', 'implements', 'implements EventBusAdaptor');
  call('OrderService.createOrder', 'CartService.getCart', 'this.cartService.getCart');
  call('OrderService.createOrder', 'CartService.clearCart', 'this.cartService.clearCart');
  call(
    'OrderService.createOrder',
    'MemoryEventBusAdaptor.emit',
    "this.eventBus.emit('order:created'",
  );
  call('OrderHandlers.startup', 'MemoryEventBusAdaptor.on', "this.eventBus.on('order:created'");
  edge(
    'OrderHandlers.startup',
    'OrderHandlers.startup@order:created',
    'register',
    "this.eventBus.on('order:created'",
  );
  edge(
    'OrderService.createOrder',
    'OrderHandlers.startup@order:created',
    'event',
    'order:created',
    { file: `${ec}entry/job/order.handlers.ts`, text: "this.eventBus.on('order:created'" },
  );
  read('OrderHandlers.startup@order:created', 'OrderHandlers.notifications', 'this.notifications');
  read('OrderHandlers.startup', 'OrderHandlers.unsubscribes', 'this.unsubscribes');
  read('OrderHandlers.shutdown', 'OrderHandlers.unsubscribes', 'this.unsubscribes');
  call('DrizzleService.constructor', 'DrizzleService.initSchema', 'this.initSchema()');
  for (const name of ['DrizzleService', 'OrderHandlers'])
    call(`${name}.constructor`, 'LifecycleManager.register', 'lifecycle.register(this)');
  for (const name of ['constructor', 'initSchema', 'shutdown'])
    read(`DrizzleService.${name}`, 'DrizzleService.sqlite', 'this.sqlite');
  call('LoggingMiddleware.use', 'LoggerService.info', 'this.logger.info');
  call('JwtMiddleware.use', 'JwtMiddleware.extractToken', 'this.extractToken(req)');
  call('JwtMiddleware.use', 'JwtService.verify', 'this.jwtService.verify(token)');
  read('JwtMiddleware.use', 'JwtConfig.resolveUser', 'this.config.resolveUser');
  for (const name of ['driver', 'cookieName'])
    read('JwtMiddleware.extractToken', `JwtConfig.${name}`, `this.config.${name}`);
  for (const name of ['sign', 'verify'])
    read(`JwtService.${name}`, 'JwtConfig.secret', 'this.config.secret');
  read('JwtService.sign', 'JwtConfig.expiresIn', 'this.config.expiresIn');
  call('JwtService.sign', 'JwtService.parseExpiresIn', 'this.parseExpiresIn');
  edge('EcJwtConfig', 'JwtConfig', 'extends', 'extends JwtConfig');
  edge('EcCorsConfig', 'CorsConfig', 'extends', 'extends CorsConfig');
  for (const name of ['secret', 'expiresIn', 'resolveUser'])
    edge(`EcJwtConfig.${name}`, `JwtConfig.${name}`, 'override', `override get ${name}`);
  for (const name of ['origin', 'credentials'])
    edge(`EcCorsConfig.${name}`, `CorsConfig.${name}`, 'override', `override readonly ${name}`);
  edge(
    'EcJwtConfig.resolveUser',
    'EcJwtConfig.resolveUser@callback',
    'returns',
    'return async (payload)',
  );
  call('RateLimitMiddleware.use', 'RateLimitService.hit', 'this.limiter.hit');
  read('RateLimitMiddleware.use', 'RateLimitConfig.enabled', 'this.config.enabled');
  call('CorsMiddleware.constructor', 'CorsMiddleware.isEnabled', 'this.isEnabled(config)');
  for (const name of [
    'origin',
    'allowMethods',
    'allowHeaders',
    'exposeHeaders',
    'maxAge',
    'credentials',
  ])
    read('CorsMiddleware.constructor', `CorsConfig.${name}`, `config.${name}`);
  read('CorsMiddleware.isEnabled', 'CorsConfig.origin', 'const { origin } = config');
  read('CorsMiddleware.use', 'CorsMiddleware.delegate', 'this.delegate');
  call('SecureHeadersMiddleware.use', 'SecureHeadersMiddleware.applyHeader', 'this.applyHeader');
  for (const declaration of declarations.filter((d) => d.group === 'SecureHeadersConfig'))
    read('SecureHeadersMiddleware.use', declaration.id, `this.config.${declaration.name}`);

  const jwtTargets = [
    'AuthController.me',
    'ProductController.create',
    'ProductController.update',
    'ProductController.remove',
    ...roots
      .filter((r) => r.id.startsWith('CartController.') || r.id.startsWith('OrderController.'))
      .map((r) => r.id),
  ];
  for (const root of roots.filter((r) => r.kind === 'HTTP')) {
    for (const mw of ['LoggingMiddleware', 'CorsMiddleware', 'SecureHeadersMiddleware'])
      edge(root.id, `${mw}.use`, 'middleware', mw, {
        file: mw === 'LoggingMiddleware' ? `${ec}app.ts` : `${http}http.service.ts`,
        text: mw === 'LoggingMiddleware' ? 'middlewares: [LoggingMiddleware]' : `${mw},`,
      });
  }
  for (const id of jwtTargets)
    edge(id, 'JwtMiddleware.use', 'middleware', '@UseMiddleware(JwtMiddleware)');
  for (const id of ['AuthController.register', 'AuthController.login'])
    edge(id, 'RateLimitMiddleware.use', 'middleware', '@RateLimit(', {
      file: 'packages/rate-limit/src/rate-limit.middleware.ts',
      text: 'UseMiddleware(RateLimitMiddleware.with(opts))',
    });
  for (const id of [
    'AuthController',
    'ProductController',
    'CartController',
    'OrderController',
    'LoggingMiddleware',
    'OrderHandlers',
    'MemoryEventBusAdaptor',
    'EcJwtConfig',
    'EcCorsConfig',
  ])
    edge('createEcApp', id, 'register', id);

  for (const [id, schema] of Object.entries({
    'AuthController.register': 'RegisterSchema',
    'AuthController.login': 'LoginSchema',
    'ProductController.create': 'CreateProductSchema',
    'ProductController.update': 'UpdateProductSchema',
    'CartController.addItem': 'AddToCartSchema',
    'CartController.updateItem': 'UpdateCartItemSchema',
  }))
    edge(id, schema, 'schema', schema);
  for (const [type, schema] of Object.entries({
    RegisterInput: 'RegisterSchema',
    LoginInput: 'LoginSchema',
    CreateProductInput: 'CreateProductSchema',
    UpdateProductInput: 'UpdateProductSchema',
    AddToCartInput: 'AddToCartSchema',
    UpdateCartItemInput: 'UpdateCartItemSchema',
  }))
    ref(type, schema, schema);
  ref('AuthService.register', 'RegisterInput', 'RegisterInput');
  ref('ProductService.create', 'CreateProductInput', 'CreateProductInput');
  ref('ProductService.update', 'UpdateProductInput', 'UpdateProductInput');
  for (const name of ['findAll', 'findById', 'create', 'update'])
    ref(`ProductService.${name}`, 'Product', 'Product');
  ref('ProductService.create', 'NewProduct', 'NewProduct');
  for (const name of ['createOrder', 'findByUser', 'findById'])
    ref(`OrderService.${name}`, 'Order', 'Order');
  for (const name of ['getCart', 'addItem', 'updateQuantity', 'removeItem'])
    ref(`CartService.${name}`, 'CartData', 'CartData');
  for (const name of ['addItem', 'updateQuantity', 'removeItem'])
    ref(`CartService.${name}`, 'CartItem', 'CartItem');
  ref('CartData', 'CartItem', 'CartItem');
  ref('requireUser', 'EcUser', 'EcUser');
  ref('EcJwtConfig.resolveUser@callback', 'EcUser', 'EcUser');
  for (const [table, ids] of Object.entries({
    users: ['AuthService.register', 'AuthService.login', 'AuthService.getProfile'],
    products: [
      'ProductService.findAll',
      'ProductService.findById',
      'ProductService.create',
      'ProductService.update',
      'ProductService.remove',
      'OrderService.createOrder',
    ],
    orders: ['OrderService.createOrder', 'OrderService.findByUser', 'OrderService.findById'],
    orderItems: ['OrderService.createOrder', 'OrderService.getOrderItems'],
  })) {
    for (const id of ids) edge(id, table, 'table', table);
  }
  for (const [type, table] of Object.entries({
    User: 'users',
    NewUser: 'users',
    Product: 'products',
    NewProduct: 'products',
    Order: 'orders',
    NewOrder: 'orders',
    OrderItem: 'orderItems',
    NewOrderItem: 'orderItems',
  }))
    ref(type, table, table);
  for (const id of ['CartService.addItem', 'CartService.updateQuantity', 'CartService.removeItem'])
    read(id, 'CART_TTL_SEC', 'CART_TTL_SEC');
  for (const id of ['OrderService.createOrder', 'OrderHandlers.startup@order:created'])
    edge(id, 'order:created', 'type', 'order:created', {
      file: `${ec}domain/order.events.ts`,
      text: "'order:created'",
    });

  window.EC_GRAPH = {
    groups,
    declarations,
    edges,
    roots,
    columns,
    width: 1880,
    height: 3440,
    version: 'ec-contract-tests-1',
  };
})();
