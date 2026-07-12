import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.spec.ts'],
    // better-sqlite3 等のネイティブアドオンは worker_threads 内での多重登録に
    // 対応しておらず "Module did not self-register" で落ちるため forks を使う
    pool: 'forks',
  },
});
