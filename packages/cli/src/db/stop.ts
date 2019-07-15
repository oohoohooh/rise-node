// tslint:disable:no-console
import { leaf } from '@carnesen/cli';
import {
  checkNodeDirExists,
  cmdSilenceString,
  DB_DATA_DIR,
  DB_LOCK_FILE,
  DB_LOG_FILE,
  DB_PG_CTL,
  execCmd,
  extractSourceFile,
  getDBEnvVars,
  getPID,
  log,
  printUsingConfig,
} from '../shared/misc';
import {
  configOption,
  IConfig,
  INetwork,
  IShowLogs,
  networkOption,
  showLogsOption,
} from '../shared/options';

export type TOptions = INetwork & IConfig & IShowLogs;

export default leaf({
  commandName: 'stop',
  description: 'Stop a DB instance defined in the config',
  options: {
    ...configOption,
    ...showLogsOption,
    ...networkOption,
  },

  async action({ config, network, show_logs }: TOptions) {
    try {
      await dbStop({ config, network, show_logs });
    } catch {
      console.log(
        '\nError while stopping the DB. Examine the log using --show_logs.'
      );
      process.exit(1);
    }
  },
});

export async function dbStop({ config, network, show_logs }: TOptions) {
  if (!checkNodeDirExists(true, true)) {
    extractSourceFile(true);
  }
  if (!getPID(DB_LOCK_FILE)) {
    console.log('DB not running');
    return;
  }
  printUsingConfig(network, config);

  const silent = show_logs ? '' : cmdSilenceString;
  const envVars = getDBEnvVars(network, config, true);

  log(envVars);

  execCmd(
    `${DB_PG_CTL} -D ${DB_DATA_DIR} -l ${DB_LOG_FILE} stop ${silent}`,
    "Couldn't stop the DB.",
    envVars
  );

  console.log('DB stopped');
}
