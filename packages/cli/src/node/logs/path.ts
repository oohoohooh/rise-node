// tslint:disable:no-console
import { leaf } from '@carnesen/cli';
import path from 'path';
import {
  DB_LOG_FILE,
  SHELL_LOG_FILE,
  V1_CONFIG_FILE,
} from '../../shared/constants';
import { getPackagePath } from '../../shared/fs-ops';
import { closeLog, debug, log } from '../../shared/log';
import { mergeConfig } from '../../shared/misc';
import {
  configOption,
  dbOption,
  IConfig,
  IDB,
  INetwork,
  IShell,
  IV1,
  IVerbose,
  networkOption,
  shellOption,
  v1Option,
  verboseOption,
} from '../../shared/options';

export type TOptions = IConfig & INetwork & IVerbose & IV1 & IShell & IDB;

export default leaf({
  commandName: 'path',
  description: 'Show the path of the log file',
  options: {
    ...configOption,
    ...networkOption,
    ...verboseOption,
    ...v1Option,
    ...shellOption,
    ...dbOption,
  },

  async action({ verbose, network, config, v1, shell, db }: TOptions) {
    try {
      log(nodeLogsPath({ network, config, v1, shell, db }));
    } catch (err) {
      debug(err);
      if (verbose) {
        log(err);
      }
      log(
        "Error when getting the log's file path. " +
          (verbose ? '' : 'Examine the log using --verbose.')
      );
      process.exit(1);
    } finally {
      closeLog();
    }
  },
});

export function nodeLogsPath({ network, config, v1, shell, db }: TOptions) {
  if (shell) {
    return path.resolve(SHELL_LOG_FILE);
  } else if (db) {
    return path.resolve(DB_LOG_FILE);
  } else {
    if (v1 && !config) {
      config = V1_CONFIG_FILE;
    }
    const mergedConfig = mergeConfig(network, config);
    const filename = mergedConfig.logFileName;
    const root = getPackagePath('rise');
    return path.resolve(root, filename);
  }
}
