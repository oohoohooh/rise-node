// tslint:disable:no-console
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  BACKUP_LOCK_FILE,
  BACKUPS_DIR,
  DOCKER_DIR,
  NODE_DIR,
  NODE_FILE,
  NODE_LOCK_FILE,
  NodeStates,
  SNAPSHOT_LOCK_FILE,
  TNetworkType,
} from './constants';
import { NoRiseDistFileError } from './exceptions';
import { debug, log } from './log';
import {
  execCmd,
  getSudoUsername,
  isDevEnv,
  isSudo,
} from './misc';

export async function checkSourceDir(relativeToCLI = false) {
  const dirPath = relativeToCLI ? path.resolve(__dirname, NODE_DIR) : NODE_DIR;
  if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) {
    await extractSourceFile();
  }
}

export function checkLaunchpadExists(): boolean {
  const file = getLaunchpadFilePath();
  if (!fs.existsSync(file)) {
    debug(`Missing: ${file}`);
    log(`ERROR: can't find launchpad executable in ${NODE_DIR}.`);
    log('You can download the latest version using:');
    log('  ./rise download');
    return false;
  }
  return true;
}

export function checkDockerDirExists(): boolean {
  if (!fs.existsSync(DOCKER_DIR) || !fs.lstatSync(DOCKER_DIR).isDirectory()) {
    log(`Error: directory '${DOCKER_DIR}' doesn't exist.`);
    log('You can download the latest version using:');
    log('  ./rise download');
    return false;
  }
  return true;
}

export function getDockerDir(relativeToCLI = false): string {
  const root = relativeToCLI ? __dirname : process.cwd();
  return path.resolve(root, DOCKER_DIR);
}

export function getNodeDir(relativeToCLI = false): string {
  const root = relativeToCLI ? __dirname : process.cwd();
  return path.resolve(root, NODE_DIR);
}

export async function extractSourceFile(
  relativeToCLI = false,
  streamOutput = false
) {
  const filePath = getSourceFilePath(relativeToCLI);
  if (!fs.existsSync(filePath)) {
    log(`ERROR: File ${DOCKER_DIR}/${NODE_FILE} missing`);
    log('You can download the latest version using:');
    log('  ./rise download');
    throw new NoRiseDistFileError();
  }

  log(`Extracting ${DOCKER_DIR}/${NODE_FILE}`);
  await execCmd(
    'tar',
    ['-zxf', NODE_FILE],
    `Couldn't extract ${getSourceFilePath(relativeToCLI)}`,
    {
      cwd: getDockerDir(relativeToCLI),
    },
    streamOutput
  );
}

/**
 * Returns the path to the lerna CLI file.
 */
export function getLaunchpadFilePath(): string {
  return path.resolve(
    process.cwd(),
    NODE_DIR,
    'node_modules',
    '.bin',
    'rise-launchpad'
  );
}

/**
 * Returns the path to a specific package.
 */
export function getPackagePath(packageName: string = null): string {
  return path.resolve(process.cwd(), NODE_DIR, 'packages', packageName);
}

/**
 * Returns the path to the rise-node.tar.gz file.
 */
export function getSourceFilePath(relativeToCLI = false): string {
  const root = relativeToCLI ? __dirname : process.cwd();
  return path.resolve(root, DOCKER_DIR, NODE_FILE);
}

export function getConfigPath(
  networkType: TNetworkType,
  relativeToCLI = false
): string {
  return path.resolve(
    getNodeDir(relativeToCLI),
    'packages',
    'rise',
    'etc',
    networkType,
    'config.json'
  );
}

export function getBackupsDir(): string {
  return path.resolve(process.cwd(), BACKUPS_DIR);
}

export function getCoreRiseDir(): string {
  return path.resolve(process.cwd(), NODE_DIR, 'packages', 'rise');
}

export function setBackupLock() {
  fs.writeFileSync(BACKUP_LOCK_FILE, process.pid);
  if (isSudo()) {
    execSync(`chown ${getSudoUsername()} ${BACKUP_LOCK_FILE}`);
  }
}

export function removeBackupLock() {
  if (fs.existsSync(BACKUP_LOCK_FILE)) {
    fs.unlinkSync(BACKUP_LOCK_FILE);
  }
}

export function setSnapshotLock() {
  fs.writeFileSync(SNAPSHOT_LOCK_FILE, process.pid);
  if (isSudo()) {
    execSync(`chown ${getSudoUsername()} ${SNAPSHOT_LOCK_FILE}`);
  }
}

export function removeSnapshotLock() {
  if (fs.existsSync(SNAPSHOT_LOCK_FILE)) {
    fs.unlinkSync(SNAPSHOT_LOCK_FILE);
  }
}

export function setNodeLock(pid: number, state: NodeStates) {
  debug(`Creating lock file ${NODE_LOCK_FILE} (${pid})`);
  const data = [pid, state].join('\n');
  fs.writeFileSync(NODE_LOCK_FILE, data, { encoding: 'utf8' });
  if (isSudo()) {
    execSync(`chown ${getSudoUsername()} ${NODE_LOCK_FILE}`);
  }
}

export function removeNodeLock() {
  debug('removing node lock');
  if (!isDevEnv() && fs.existsSync(NODE_LOCK_FILE)) {
    fs.unlinkSync(NODE_LOCK_FILE);
  }
}

/**
 * Gets the PID from a PID lock file.
 *
 * Performs garbage collection if the process isn't running any more.
 *
 * @param filePath
 * @return [pid, state]
 */
export function getPID(filePath: string): [number, NodeStates] | false {
  try {
    const [pid, state] = fs
      .readFileSync(filePath, { encoding: 'utf8' })
      .split('\n');
    let exists: string;
    try {
      // null output when using execSyncAsUser
      exists = execSync(`ps -p ${pid} -o pid=`)
        .toString('utf8')
        .trim();
    } catch {
      // empty
    }
    if (!exists) {
      log(`PID ${pid} doesn't exist, removing the lock file`);
      fs.unlinkSync(filePath);
      return false;
    }
    return [parseInt(pid, 10), state as NodeStates];
  } catch {
    // empty
  }
  return false;
}

/**
 * Returns the PID of currently running node.
 */
export function getNodePID(): number | false {
  try {
    return getPID(NODE_LOCK_FILE)[0];
  } catch {
    return false;
  }
}

export function getNodeState(): NodeStates | false {
  try {
    return getPID(NODE_LOCK_FILE)[1];
  } catch {
    return false;
  }
}

export function getBackupPID(): number | false {
  try {
    return getPID(BACKUP_LOCK_FILE)[0];
  } catch {
    return false;
  }
}

export function getSnapshotPID(): number | false {
  try {
    return getPID(SNAPSHOT_LOCK_FILE)[0];
  } catch {
    return false;
  }
}
