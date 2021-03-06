import { DestroyOptions, UpdateOptions, UpsertOptions } from 'sequelize';
import { Model } from 'sequelize-typescript';
import { Literal } from 'sequelize/types/lib/utils';
import { Omit, RecursivePartial } from './utils';

export type FilteredModelAttributes<T extends Model<T>> = RecursivePartial<
  Omit<T, keyof Model<any>>
>;

export type FilteredModelAttributesWithLiteral<T extends Model<T>> = {
  [P in keyof FilteredModelAttributes<T>]?:
    | FilteredModelAttributes<T>[P]
    | Literal;
};

// tslint:disable-next-line interface-name
export interface BaseDBOp<T extends Model<T>> {
  model: (new () => T) & (typeof Model);
}
export type DBUpdateOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'update';
  options: UpdateOptions;
  values: FilteredModelAttributesWithLiteral<T>;
};
export type DBCreateOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'create';
  values: FilteredModelAttributes<T>;
};
export type DBBulkCreateOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'bulkCreate';
  values: Array<FilteredModelAttributes<T>>;
};
export type DBRemoveOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'remove';
  options: DestroyOptions;
};
export type DBCustomOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'custom';
  query: string;
};
export type DBUpsertOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'upsert';
  values: FilteredModelAttributes<T>;
  options?: UpsertOptions;
};

export type DBOp<T extends Model<T>> =
  | DBCreateOp<T>
  | DBBulkCreateOp<T>
  | DBUpdateOp<T>
  | DBCustomOp<T>
  | DBRemoveOp<T>
  | DBUpsertOp<T>;
