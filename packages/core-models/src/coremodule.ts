import { BaseCoreModule } from '@risevision/core-types';
import * as cls from 'cls-hooked';
import * as fs from 'fs';
import * as path from 'path';
import { Sequelize } from 'sequelize-typescript';
import { DbAppConfig, DBHelper, ModelSymbols } from './helpers/';
import { BaseModel } from './models';

export class CoreModule extends BaseCoreModule<DbAppConfig> {
  public configSchema = require('../schema/config.json');
  public constants = {};
  private sequelize: Sequelize;

  public addElementsToContainer(): void {
    const namespace = cls.createNamespace('sequelize-namespace');

    (Sequelize as any).__proto__.useCLS(namespace);

    this.sequelize = new Sequelize({
      database: this.config.db.database,
      dialect: 'postgres',
      host: this.config.db.host,
      logging: false,
      password: this.config.db.password,
      pool: {
        idle: this.config.db.poolIdleTimeout,
        max: this.config.db.poolSize,
      },
      port: this.config.db.port,
      username: this.config.db.user,
    });

    this.container.bind(ModelSymbols.sequelize).toConstantValue(this.sequelize);
    this.container
      .bind(ModelSymbols.sequelizeNamespace)
      .toConstantValue(namespace);
    this.container
      .bind(ModelSymbols.helpers.db)
      .to(DBHelper)
      .inSingletonScope();
  }

  public async initAppElements() {
    // Run indepotent schema files to initialize tables
    for (const module of this.sortedModules) {
      const schemaFile = path.join(module.directory, 'sql', 'schema.sql');
      if (fs.existsSync(schemaFile)) {
        await this.sequelize.query(fs.readFileSync(schemaFile, 'utf8'));
      }
    }

    for (const m of this.sortedModules) {
      // tslint:disable-next-line
      if (typeof m['onPreInitModels'] === 'function') {
        // tslint:disable-next-line
        await m['onPreInitModels']();
      }
    }
    const models = this.container.getAll<typeof BaseModel>(ModelSymbols.model);
    models.forEach((m) => (m.container = this.container));
    this.sequelize.addModels(models);

    for (const m of this.sortedModules) {
      // tslint:disable-next-line
      if (typeof m['onPostInitModels'] === 'function') {
        // tslint:disable-next-line
        await m['onPostInitModels']();
      }
    }
  }

  public afterConfigValidation<T extends DbAppConfig>(config: T): T {
    return config;
  }
}
