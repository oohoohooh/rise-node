// tslint:disable:no-console
import { leaf } from '@carnesen/cli';
import { checkSourceDir, getNodeDir } from '../shared/fs-ops';
import { closeLog, debug, log } from '../shared/log';
import { execCmd, isSudo } from '../shared/misc';
import { IVerbose, verboseOption } from '../shared/options';
import { nodeInstallDeps } from './install-deps';

export default leaf({
  commandName: 'rebuild-native',
  description: 'Rebuilds the native node_modules for the current OS.',
  options: verboseOption,

  async action({ verbose }: IVerbose) {
    try {
      await nodeRebuildNative({ verbose });
    } catch (err) {
      debug(err);
      if (verbose) {
        log(err);
      }
      log(
        '\nError while rebuilding native node modules.' +
          (verbose ? '' : 'Examine the log using --verbose.')
      );
      process.exit(1);
    } finally {
      closeLog();
    }
  },
});

export async function nodeRebuildNative({ verbose }: IVerbose) {
  await checkSourceDir();

  log('Rebuilding native modules...');

  if (isSudo()) {
    await nodeInstallDeps({ verbose });
  }

  const errorMsg =
    "Couldn't rebuild native modules.\n\n" +
    'Make sure you have all the dependencies installed by running:\n' +
    '$ sudo ./rise node install-deps';

  await execCmd(
    'npm',
    ['rebuild'],
    errorMsg,
    {
      cwd: getNodeDir(),
    },
    verbose
  );

  log('Native node_modules have been rebuilt.');
}
