import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { Prisma, PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';

type SourceRow = Record<string, SQLOutputValue>;
type ForeignKey = { table: string; from: string; to: string };
type TargetColumn = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  udt_schema: string;
};

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
const financialFields = [
  'grossSaleSantim',
  'productCostSantim',
  'eligibleProfitSantim',
  'commissionSantim',
  'sellerAmountSantim',
  'processingFeeSantim',
  'refundSantim',
] as const;
const commissionTablesAbsentFromLegacySqlite = new Set([
  'CommissionSale',
  'WeeklyCommissionStatement',
  'CommissionPaymentSubmission',
  'CommissionPaymentAllocation',
  'CommissionCredit',
  'CommissionCreditAllocation',
  'CommissionReminder',
  'OwnerCommissionDestination',
]);

function sourcePath() {
  const index = process.argv.indexOf('--source');
  const value = index === -1 ? 'prisma/dev.db' : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('Pass the SQLite path with --source <path>.');
  return resolve(value);
}

function sourceForeignKeys(source: DatabaseSync, table: string): ForeignKey[] {
  return source.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all().map((row) => {
    const referencedTable = row.table;
    const from = row.from;
    const to = row.to;
    if (typeof referencedTable !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
      throw new Error(`SQLite foreign key metadata is incomplete for ${table}.`);
    }
    return { table: referencedTable, from, to };
  });
}

function orderedTables(tables: string[], dependencies: Map<string, Set<string>>) {
  const remaining = new Set(tables);
  const ordered: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((table) =>
      [...(dependencies.get(table) ?? [])].every((dependency) => !remaining.has(dependency)),
    );
    if (!ready.length) throw new Error('SQLite tables contain a cyclic foreign-key dependency; no data was imported.');
    for (const table of ready) {
      remaining.delete(table);
      ordered.push(table);
    }
  }
  return ordered;
}

function orderedSelfRows(rows: SourceRow[], foreignKeys: ForeignKey[], table: string) {
  if (!foreignKeys.length) return rows;
  const pending = [...rows];
  const ordered: SourceRow[] = [];
  const available = new Map<string, Set<string>>();

  while (pending.length) {
    const index = pending.findIndex((row) => foreignKeys.every(({ from, to }) => {
      const value = row[from];
      return value === null || available.get(to)?.has(String(value));
    }));
    if (index === -1) throw new Error(`Rows in ${table} contain a cyclic self-reference; no data was imported.`);
    const [row] = pending.splice(index, 1);
    ordered.push(row);
    for (const { to } of foreignKeys) {
      const values = available.get(to) ?? new Set<string>();
      const value = row[to];
      if (value !== null && value !== undefined) values.add(String(value));
      available.set(to, values);
    }
  }
  return ordered;
}

function prepareValue(value: SQLOutputValue, column: TargetColumn) {
  if (value === null) return null;
  if (column.data_type === 'boolean') {
    if (value === 0 || value === 1) return value === 1;
    if (typeof value === 'boolean') return value;
    throw new Error(`SQLite value for ${column.table_name}.${column.column_name} is not a boolean.`);
  }
  if (column.data_type === 'json' || column.data_type === 'jsonb') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  if (column.data_type === 'bytea' && value instanceof Uint8Array) return Buffer.from(value);
  return value;
}

function castFor(column: TargetColumn, parameter: number) {
  const value = `$${parameter}`;
  if (column.data_type === 'USER-DEFINED') {
    return `${value}::${quoteIdentifier(column.udt_schema)}.${quoteIdentifier(column.udt_name)}`;
  }
  if (column.data_type === 'json' || column.data_type === 'jsonb' || column.data_type === 'boolean' ||
    column.data_type === 'bytea' || column.data_type === 'date' ||
    column.data_type === 'timestamp without time zone' || column.data_type === 'timestamp with time zone' ||
    column.data_type === 'time without time zone' || column.data_type === 'time with time zone') {
    return `${value}::${column.data_type}`;
  }
  return value;
}

async function main() {
  const directUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!directUrl) throw new Error('Set DATABASE_URL_UNPOOLED to the direct Neon connection string before importing.');

  const source = new DatabaseSync(sourcePath(), { readOnly: true });
  const target = new PrismaClient({ datasourceUrl: directUrl });
  try {
    source.exec('BEGIN');
    const integrity = source.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') {
      throw new Error('SQLite integrity check failed; no data was imported.');
    }
    const foreignKeyProblems = source.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyProblems.length) throw new Error('SQLite contains foreign-key violations; no data was imported.');

    const models = Prisma.dmmf.datamodel.models.map((model) => ({
      table: model.dbName ?? model.name,
      columns: model.fields
        .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
        .map((field) => field.dbName ?? field.name),
    }));
    const modelTables = new Set(models.map((model) => model.table));
    const sourceTables = (source.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'",
    ).all() as { name: string }[]).map((row) => row.name);
    const unexpectedTables = sourceTables.filter((table) => !modelTables.has(table));
    const missingTables = models.filter((model) =>
      !sourceTables.includes(model.table) && !commissionTablesAbsentFromLegacySqlite.has(model.table),
    );
    if (unexpectedTables.length || missingTables.length) {
      throw new Error(`SQLite tables do not match the Prisma schema (unexpected: ${unexpectedTables.join(', ') || 'none'}; missing: ${missingTables.map((model) => model.table).join(', ') || 'none'}).`);
    }

    const sourceRows = new Map<string, SourceRow[]>();
    const sourceCounts = new Map<string, number>();
    const dependencies = new Map<string, Set<string>>();
    const selfReferences = new Map<string, ForeignKey[]>();
    for (const model of models) {
      if (!sourceTables.includes(model.table) && commissionTablesAbsentFromLegacySqlite.has(model.table)) {
        sourceRows.set(model.table, []);
        sourceCounts.set(model.table, 0);
        dependencies.set(model.table, new Set());
        selfReferences.set(model.table, []);
        continue;
      }
      const sourceColumns = source.prepare(`PRAGMA table_info(${quoteIdentifier(model.table)})`).all()
        .map((row) => String(row.name));
      if (sourceColumns.length !== model.columns.length ||
        model.columns.some((column) => !sourceColumns.includes(column))) {
        throw new Error(`SQLite columns for ${model.table} do not match the Prisma schema; no data was imported.`);
      }
      const rows = source.prepare(`SELECT * FROM ${quoteIdentifier(model.table)}`).all() as SourceRow[];
      sourceRows.set(model.table, rows);
      sourceCounts.set(model.table, rows.length);

      const foreignKeys = sourceForeignKeys(source, model.table);
      dependencies.set(model.table, new Set(foreignKeys.filter((key) => key.table !== model.table).map((key) => key.table)));
      selfReferences.set(model.table, foreignKeys.filter((key) => key.table === model.table));
    }

    const targetColumns = await target.$queryRaw<TargetColumn[]>`
      SELECT table_name, column_name, data_type, udt_name, udt_schema
      FROM information_schema.columns
      WHERE table_schema = current_schema()
    `;
    const targetByTable = new Map<string, Map<string, TargetColumn>>();
    for (const column of targetColumns) {
      const columns = targetByTable.get(column.table_name) ?? new Map<string, TargetColumn>();
      columns.set(column.column_name, column);
      targetByTable.set(column.table_name, columns);
    }
    for (const model of models) {
      const columns = targetByTable.get(model.table);
      if (!columns || model.columns.length !== columns.size ||
        model.columns.some((column) => !columns.has(column))) {
        throw new Error(`PostgreSQL table ${model.table} is missing or differs from the migrated Prisma schema.`);
      }
    }

    const tableOrder = orderedTables(models.map((model) => model.table), dependencies);
    const modelsByTable = new Map(models.map((model) => [model.table, model]));
    const importedCounts = new Map<string, number>();
    await target.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `LOCK TABLE ${models.map((model) => quoteIdentifier(model.table)).join(', ')} IN SHARE ROW EXCLUSIVE MODE`,
      );
      for (const model of models) {
        const exists = await tx.$queryRawUnsafe<{ exists: boolean }[]>(
          `SELECT EXISTS (SELECT 1 FROM ${quoteIdentifier(model.table)} LIMIT 1) AS exists`,
        );
        if (exists[0]?.exists) {
          throw new Error(`PostgreSQL table ${model.table} is not empty; refusing to import or overwrite records.`);
        }
      }

      for (const table of tableOrder) {
        const model = modelsByTable.get(table)!;
        const rows = orderedSelfRows(sourceRows.get(table)!, selfReferences.get(table)!, table);
        const columns = model.columns.map((column) => targetByTable.get(table)!.get(column)!);
        const batchSize = Math.max(1, Math.floor(40000 / columns.length));

        for (let start = 0; start < rows.length; start += batchSize) {
          const batch = rows.slice(start, start + batchSize);
          const values: unknown[] = [];
          const valueRows = batch.map((row) => `(${columns.map((column) => {
            values.push(prepareValue(row[column.column_name], column));
            return castFor(column, values.length);
          }).join(', ')})`);
          const statement = `INSERT INTO ${quoteIdentifier(table)} (${columns.map((column) => quoteIdentifier(column.column_name)).join(', ')}) VALUES ${valueRows.join(', ')}`;
          await tx.$executeRawUnsafe(statement, ...values);
        }
      }

      for (const model of models) {
        const result = await tx.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) AS count FROM ${quoteIdentifier(model.table)}`,
        );
        const imported = Number(result[0]?.count);
        if (imported !== sourceCounts.get(model.table)) {
          throw new Error(`Row count mismatch for ${model.table}: SQLite has ${sourceCounts.get(model.table)}, PostgreSQL has ${imported}.`);
        }
        importedCounts.set(model.table, imported);
      }

      const sourceFinancialTotals = Object.fromEntries(financialFields.map((field) => {
        const total = sourceRows.get('FinancialTransaction')!.reduce((sum, row) => {
          const value = row[field] ?? 0;
          if (typeof value !== 'number') {
            throw new Error(`SQLite financial field ${field} contains a non-numeric value.`);
          }
          if (!Number.isSafeInteger(value)) throw new Error(`SQLite financial field ${field} exceeds the safe integer range.`);
          const nextTotal = sum + value;
          if (!Number.isSafeInteger(nextTotal)) {
            throw new Error(`SQLite financial total ${field} exceeds the safe integer range.`);
          }
          return nextTotal;
        }, 0);
        return [field, String(total)];
      }));
      const targetFinancialTotals = await tx.$queryRawUnsafe<Record<(typeof financialFields)[number], string>[]>(
        `SELECT ${financialFields.map((field) =>
          `COALESCE(SUM(${quoteIdentifier(field)}), 0)::text AS ${quoteIdentifier(field)}`,
        ).join(', ')} FROM "FinancialTransaction"`,
      );
      if (financialFields.some((field) => targetFinancialTotals[0]?.[field] !== sourceFinancialTotals[field])) {
        throw new Error('Financial ledger totals differ between SQLite and PostgreSQL; import rolled back.');
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 300000 });

    for (const model of models) {
      console.log(`${model.table}: ${importedCounts.get(model.table)} rows copied and verified`);
    }
    console.log('Financial ledger totals verified');
    source.exec('ROLLBACK');
  } finally {
    source.close();
    await target.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'SQLite import failed.');
  process.exitCode = 1;
});
