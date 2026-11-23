import { MySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    postgresUrl: string;
    mysqlUrl: string;
  }
}

// The contract runs on real database servers with the drivers applications use.
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [postgres, mysql] = await Promise.all([
    new PostgreSqlContainer('postgres:17.2').start(),
    new MySqlContainer('mysql:8.4.6').start(),
  ]);
  project.provide('postgresUrl', postgres.getConnectionUri());
  project.provide('mysqlUrl', mysql.getConnectionUri());
  return async () => {
    await Promise.all([postgres.stop(), mysql.stop()]);
  };
}
