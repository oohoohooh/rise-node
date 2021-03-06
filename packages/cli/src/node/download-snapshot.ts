// tslint:disable:no-console
import { leaf } from '@carnesen/cli';
import axios from 'axios';
import { execSync } from 'child_process';
import fs from 'fs';
import { BACKUPS_DIR } from '../shared/constants';
import { closeLog, debug, log } from '../shared/log';
import { execSyncAsUser, getSudoUsername, isSudo } from '../shared/misc';
import {
  configOption,
  IConfig,
  INetwork,
  IVerbose,
  networkOption,
  verboseOption,
} from '../shared/options';
import { nodeImportDB } from './import-db';

export type TOptions = IConfig & INetwork & IVerbose;

export default leaf({
  commandName: 'download-snapshot',
  description: 'Downloads the latest snapshot and imports it',

  options: {
    ...configOption,
    ...networkOption,
    ...verboseOption,
  },

  async action(options: TOptions) {
    try {
      await nodeDownloadSnapshot(options);
    } catch (err) {
      debug(err);
      if (options.verbose) {
        log(err);
      }
      log(
        '\nSomething went wrong.' +
          (options.verbose ? '' : ' Examine the log using --verbose.')
      );
      process.exit(1);
    } finally {
      closeLog();
    }
  },
});

async function downloadLatest({ network }: TOptions): Promise<string> {
  log('Downloading the latest snapshot file...');
  const url = `https://downloads.rise.vision/snapshots/${network}/latest`;
  execSyncAsUser(`mkdir -p ${BACKUPS_DIR}`);
  const filename = `${BACKUPS_DIR}/snap_${network}_latest.gz`;
  const writer = fs.createWriteStream(filename);
  const res = await axios.get(url, { responseType: 'stream' });
  res.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  // fix perms when in sudo
  if (isSudo()) {
    execSync(`chown ${getSudoUsername()} ${filename}`);
  }
  return filename;
}

export async function nodeDownloadSnapshot({
  config,
  network,
  verbose,
}: TOptions) {
  const filename = await downloadLatest({ network });
  await nodeImportDB({
    config,
    file: filename,
    network,
    snapshot: true,
    verbose,
  });
}
