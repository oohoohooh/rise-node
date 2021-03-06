import { IMigrationsModel } from '@risevision/core-types';
import { Column, Model, PrimaryKey, Table } from 'sequelize-typescript';

@Table({ tableName: 'migrations', timestamps: false })
export class MigrationsModel extends Model<MigrationsModel>
  implements IMigrationsModel {
  @PrimaryKey
  @Column
  public id: string;

  @PrimaryKey
  @Column
  public name: string;
}
