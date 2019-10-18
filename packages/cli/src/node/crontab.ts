// tslint:disable:no-console
import { leaf } from '@carnesen/cli';
import { execSync } from 'child_process';
import { closeLog, debug, log } from '../shared/log';
import { getCrontab } from '../shared/misc';
import {
  configOption,
  IConfig,
  INetwork,
  IV1,
  IVerbose,
  networkOption,
  v1Option,
  verboseOption,
} from '../shared/options';

export type TOptions = IVerbose &
  IV1 & { removeOnly?: boolean } & INetwork &
  IConfig;

export default leaf({
  commandName: 'crontab',
  description: 'Manages RISE Node entries in crontab',

  options: {
    ...configOption,
    ...verboseOption,
    // TODO remove-only
    removeOnly: {
      defaultValue: false,
      description: "Remove old entries, but don't add new ones",
      nullable: true,
      typeName: 'boolean',
    },
    ...networkOption,
    ...v1Option,
  },

  async action({ verbose, v1, removeOnly, config, network }: TOptions) {
    try {
      await nodeCrontab({ verbose, v1, removeOnly, config, network });
    } catch (err) {
      debug(err);
      if (verbose) {
        log(err);
      }
      log(
        '\nSomething went wrong. ' +
          (verbose ? '' : 'Examine the log using --verbose.')
      );
      process.exit(1);
    } finally {
      closeLog();
    }
  },
});

export async function nodeCrontab({
  verbose,
  v1,
  removeOnly,
  config,
  network,
}: TOptions) {
  await removeEntries({ verbose });
  if (!removeOnly) {
    await addEntries({ verbose, v1, config, network });
    log('RISE Node entries added to crontab');
  } else {
    log('RISE Node entries removed from crontab');
  }
}

async function addEntries({ verbose, v1, config, network }: TOptions) {
  // TODO assert `crontab` exists
  let crontab = await getCrontab(verbose);
  debug('old crontab', crontab);
  const params = [];

  if (v1) {
    params.push('--v1');
  }

  if (network && network !== 'mainnet') {
    params.push(`--network ${network}`);
  }

  if (config) {
    params.push(`--config ${config}`);
  }

  const cmd = `${__filename} node start ${params.join(' ')}`;
  crontab += `@reboot ${cmd} #managed_rise\n`;
  crontab += `@daily ${__filename} node logs archive #managed_rise\n`;
  debug('new crontab', crontab);

  execSync(`echo "${crontab}" | crontab -`);
}

// TODO share with /src/db/crontab
async function removeEntries({ verbose }: TOptions) {
  let crontab = await getCrontab(verbose);
  debug('old crontab', crontab);

  crontab = crontab.replace(/^.+#managed_rise\n?/gm, '');
  debug('new crontab', crontab);

  execSync(`echo "${crontab.trim()}" | crontab -`);
}
