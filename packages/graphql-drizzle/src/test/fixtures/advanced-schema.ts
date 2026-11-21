import { relations } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import 'drizzle-metadata/register';
import '../../metadata';

export const employees = sqliteTable('employees', {
  employeeId: text('employee_id').primaryKey(),
  code: text().notNull(),
  tenant: text().notNull(),
  managerCode: text('manager_code'),
}).meta({ graphqlName: 'Employee' });

export const employeesRelations = relations(employees, ({ one, many }) => ({
  manager: one(employees, {
    fields: [employees.managerCode, employees.tenant],
    references: [employees.code, employees.tenant],
    relationName: 'manager',
  }),
  reports: many(employees, { relationName: 'manager' }),
  // Required, and unique only while no two employees share a code within a tenant.
  peer: one(employees, {
    fields: [employees.code, employees.tenant],
    references: [employees.code, employees.tenant],
    relationName: 'peer',
  }),
}));
