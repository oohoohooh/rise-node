import {
  DBBulkCreateOp,
  DBCreateOp,
  DBOp,
  DBRemoveOp,
  DBUpdateOp,
  DBUpsertOp,
} from '@risevision/core-types';
import { wait } from '@risevision/core-utils';
import { inject, injectable, postConstruct } from 'inversify';
import * as sequelize from 'sequelize';
import { Op, Sequelize, Transaction } from 'sequelize';
import { Model } from 'sequelize-typescript';
import { ModelSymbols } from './modelSymbols';

@injectable()
export class DBHelper {
  @inject(ModelSymbols.sequelize)
  private sequelize: Sequelize;

  private queryGenerator: any;

  @postConstruct()
  public postConstruct() {
    this.queryGenerator = this.sequelize.getQueryInterface()
      .QueryGenerator as any;
  }

  public handleUpdate(updateOp: DBUpdateOp<any>) {
    return this.prepareStatement(
      this.queryGenerator.updateQuery(
        updateOp.model.getTableName(),
        updateOp.values,
        updateOp.options.where,
        updateOp.options
      )
    );
  }

  public handleInsert(insertOp: DBCreateOp<any>) {
    const keys = Object.keys(insertOp.values);
    const attributesSQL = keys
      .map((attr) => this.queryGenerator.quoteIdentifier(attr))
      .join(',');
    const tableSQL = this.queryGenerator.quoteTable(
      insertOp.model.getTableName()
    );
    const valuesSQL = keys
      .map((k) =>
        this.queryGenerator.escape(
          insertOp.values[k],
          insertOp.model.rawAttributes[k],
          { context: 'INSERT' }
        )
      )
      .join(',');
    return `INSERT INTO ${tableSQL} (${attributesSQL}) VALUES(${valuesSQL})`;
  }

  public handleBulkInsert(insertOp: DBBulkCreateOp<any>) {
    if (insertOp.values.length === 0) {
      return '';
    }
    const keys = Object.keys(insertOp.values[0]);

    const attributesSQL = keys
      .map((attr) => this.queryGenerator.quoteIdentifier(attr))
      .join(',');
    const tableSQL = this.queryGenerator.quoteTable(
      insertOp.model.getTableName()
    );
    const valuesSQL = insertOp.values
      .map(
        (tuple) =>
          `(${keys
            .map((k) =>
              this.queryGenerator.escape(
                tuple[k],
                insertOp.model.rawAttributes[k],
                { context: 'INSERT' }
              )
            )
            .join(',')})`
      )
      .join(', ');
    return `INSERT INTO ${tableSQL} (${attributesSQL}) VALUES ${valuesSQL}`;
  }

  public handleUpsert(upsertOp: DBUpsertOp<any>) {
    return this.queryGenerator.upsertQuery(
      upsertOp.model.getTableName(),
      upsertOp.values,
      upsertOp.values,
      {
        [Op.or]: [
          {
            [upsertOp.model.primaryKeyAttribute]:
              upsertOp.values[upsertOp.model.primaryKeyAttribute],
          },
        ],
      },
      upsertOp.model,
      { raw: true }
      // upsertOp.options.wh
    );
  }

  public handleDelete(deleteOp: DBRemoveOp<any>) {
    return this.queryGenerator.deleteQuery(
      deleteOp.model.getTableName(),
      deleteOp.options.where,
      { ...deleteOp.options, limit: null },
      deleteOp.model
    );
  }

  /**
   * Batches operations together and performs them parallelly (eventually in a transaction)
   * @param {Array<IDBOp<any>>} what
   * @param {sequelize.Transaction} transaction
   * @returns {Promise<[Model<string>[] , any]>}
   */
  public async performOps(
    what: Array<DBOp<any>>,
    transaction?: sequelize.Transaction
  ) {
    const baseOptions: any = { raw: true };
    if (transaction) {
      baseOptions.transaction = transaction;
    }

    const opsToDoIterator = this.splitOps(what, 1010);
    let chunk = opsToDoIterator.next();
    while (!chunk.done) {
      chunk = await (async () => {
        const p = this.sequelize.query(chunk.value, baseOptions);
        const nextChunk = await wait(1).then(() => opsToDoIterator.next());
        return p.then(() => nextChunk);
      })();
    }
    await this.sequelize.query(chunk.value, baseOptions);
  }

  public *splitOps(
    what: Array<DBOp<any>>,
    chunkSize: number
  ): Iterator<string> {
    let tempOps = [];
    for (const op of what) {
      if (op === null) {
        continue;
      }
      switch (op.type) {
        case 'bulkCreate':
          tempOps.push(this.handleBulkInsert(op));
          break;
        case 'create':
          tempOps.push(this.handleInsert(op));
          break;
        case 'update':
          tempOps.push(this.handleUpdate(op));
          break;
        case 'upsert':
          tempOps.push(this.handleUpsert(op));
          break;
        case 'remove':
          tempOps.push(this.handleDelete(op));
          break;
        case 'custom':
          tempOps.push(op.query);
          break;
      }
      if (tempOps.length === chunkSize) {
        yield tempOps.join(';');
        tempOps = [];
      }
    }
    return tempOps.join(';');
  }

  private prepareStatement(data: { query: string; bind: any[] }) {
    return data.query.replace(/\$([0-9]+)/g, (_, k) => {
      const numericK = parseInt(k, 10) - 1;
      if (isNaN(numericK)) {
        throw new Error('non numeric data');
      }
      if (numericK in data.bind) {
        return this.queryGenerator.escape(data.bind[numericK]);
      } else {
        throw new Error('cant find');
      }
    });
  }
}
