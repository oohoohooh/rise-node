// tslint:disable-next-line interface-name
import { Model } from 'sequelize-typescript';
import { ModelAttributes, Partial } from './utils';
import { FilteredModelAttributes } from 'sequelize-typescript/lib/models/Model';
import { CreateOptions, DestroyOptions, UpdateOptions } from 'sequelize';

export interface AppConfigDatabase {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  poolSize: number;
  poolIdleTimeout: number;
  reapIntervalMillis: number;
  logEvents: string[];
}

// tslint:disable-next-line interface-name
export interface AppConfig {
  port: number;
  address: string;
  version: string;
  minVersion: string;
  fileLogLevel: string;
  consoleLogLevel: string;
  logFileName: string;
  trustProxy: boolean;
  cacheEnabled: boolean;
  db: AppConfigDatabase;

  redis: {
    host: string,
    port: number,
    db: number,
    password: string;
  };

  api: {
    enabled: boolean;
    access: {
      public: boolean;
      whiteList: string[]
    },
    options: {
      limits: {
        max: number,
        delayMs: number,
        delayAfter: number,
        windowMs: number,
      }
    }
  };

  peers: {
    enabled: boolean;
    list: Array<{
      ip: string,
      port: number
    }>,
    access: {
      blackList: any[];
    },
    options: {
      limits: {
        max: number
        delayMs: number
        delayAfter: number
        windowMs: number
      },
      timeout: number
    }
  };

  broadcasts: {
    broadcastInterval: number
    broadcastLimit: number
    parallelLimit: number
    releaseLimit: number
    relayLimit: number
  };

  transactions: {
    maxTxsPerQueue: number
  };

  forging: {
    force: boolean,
    secret: string[]
    access: {
      whiteList: string[]
    }
  };

  loading: {
    verifyOnLoading: false,
    snapshot?: number | true,
    loadPerIteration: number,
  };

  nethash: string;
}

// tslint:disable interface-name interface-over-type-literal
export interface PeerHeaders {
  os: string;
  version: string;
  port: number;
  height: number;
  nethash: string;
  broadhash: string;
  nonce: string;
}

type BaseDBOp<T extends Model<T>> = {
  model: (new () => T) & (typeof Model);
};
export type DBUpdateOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'update',
  options?: UpdateOptions
  values: FilteredModelAttributes<T>;
};
export type DBCreateOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'create',
  values: FilteredModelAttributes<T>;
};
export type DBRemoveOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'remove',
  options: DestroyOptions;
};
export type DBCustomOp<T extends Model<T>> = BaseDBOp<T> & {
  type: 'custom',
  query: string
};

export type DBOp<T extends Model<T>> = DBCreateOp<T> | DBUpdateOp<T> | DBCustomOp<T> | DBRemoveOp<T>;
