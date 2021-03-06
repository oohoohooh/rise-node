import { BlocksConstantsType, BlocksSymbols } from '@risevision/core-blocks';
import {
  AppConfig,
  ConstantsType,
  IBlocksModule,
  ISystemModule,
  PeerHeaders,
  SignedAndChainedBlockType,
  Symbols,
} from '@risevision/core-types';
import { inject, injectable, postConstruct } from 'inversify';
import * as os from 'os';
import * as semver from 'semver';

const rcRegExp = /-?[a-z]+$/;

@injectable()
export class SystemModule implements ISystemModule {
  public get broadhash() {
    return this.headers.broadhash;
  }
  public headers: PeerHeaders;
  public minVersion: string;

  private lastMinVer: string;
  private minVersionChar: string;

  // Generic and helpers
  @inject(Symbols.generic.appConfig)
  private appConfig: AppConfig;
  @inject(Symbols.generic.constants)
  private constants: ConstantsType;
  @inject(BlocksSymbols.constants)
  private blocksConstants: BlocksConstantsType;
  @inject(Symbols.generic.nonce)
  private nonce: string;

  @inject(Symbols.generic.genesisBlock)
  private genesisBlock: SignedAndChainedBlockType;

  @postConstruct()
  public postConstruct() {
    this.headers = {
      broadhash: this.genesisBlock.id,
      firewalled: this.appConfig.firewalled ? 'true' : 'false',
      height: 1,
      nethash: this.genesisBlock.payloadHash.toString('hex'),
      nonce: this.nonce,
      os: `${os.platform()}${os.release()}`,
      port: this.appConfig.port,
      version: this.appConfig.version,
    };
  }

  public cleanup() {
    return Promise.resolve();
  }

  public getOS() {
    return this.headers.os;
  }

  public getVersion() {
    return this.headers.version;
  }

  /**
   * Gets private variable `port`
   * @return {number}
   */
  public getPort() {
    return this.headers.port;
  }

  /**
   * Gets private variable `height`
   * @return {number}
   */
  public getHeight() {
    return this.headers.height;
  }

  /**
   * Gets private variable `nethash`
   * @return {hash}
   */
  public getNethash() {
    return this.headers.nethash;
  }

  /**
   * Gets private variable `nonce`
   * @return {nonce}
   */
  public getNonce() {
    return this.headers.nonce;
  }

  /**
   * Gets private variable `nethash` and compares with input param.
   */
  public networkCompatible(nethash: string): boolean {
    return this.headers.nethash === nethash;
  }

  /**
   * Gets private variable `minVersion`
   * @return {string}
   */
  public getMinVersion(height: number = this.headers.height) {
    let minVer = '';
    for (
      let i = this.constants.minVersion.length - 1;
      i >= 0 && minVer === '';
      --i
    ) {
      if (height >= this.constants.minVersion[i].height) {
        minVer = this.constants.minVersion[i].ver;
      }
    }

    // update this.minVersion / this.minVersionChar, if necessary
    if (minVer !== this.lastMinVer) {
      this.lastMinVer = minVer;
      if (rcRegExp.test(minVer)) {
        this.minVersion = minVer.replace(rcRegExp, '');
        this.minVersionChar = minVer.charAt(minVer.length - 1);
      } else {
        this.minVersion = minVer;
        this.minVersionChar = '';
      }
    }

    return minVer;
  }

  /**
   * Checks version compatibility from input param against private values.
   * @implements {semver}
   * @param {string} version
   * @return {boolean}
   */
  public versionCompatible(version) {
    this.getMinVersion(); // set current minVersion

    let versionChar;

    if (rcRegExp.test(version)) {
      versionChar = version.charAt(version.length - 1);
      version = version.replace(rcRegExp, '');
    }

    // if no range specifier is used for minVersion, check the complete version string (inclusive versionChar)
    const rangeRegExp = /[\^~\*]/;
    if (
      this.minVersionChar &&
      versionChar &&
      !rangeRegExp.test(this.minVersion)
    ) {
      return version + versionChar === this.minVersion + this.minVersionChar;
    }

    // ignore versionChar, check only version
    return semver.satisfies(version, this.minVersion);
  }

  public getFees(
    height: number = this.headers.height + 1
  ): {
    fees: {
      [kind: string]: bigint;
    };
    fromHeight: number;
    height: number;
    toHeight: number;
  } {
    let i;
    for (i = this.constants.fees.length - 1; i > 0; i--) {
      if (height >= this.constants.fees[i].height) {
        break;
      }
    }

    return {
      fees: this.constants.fees[i].fees as any,
      fromHeight: this.constants.fees[i].height,
      height,
      toHeight:
        i === this.constants.fees.length - 1
          ? null
          : this.constants.fees[i + 1].height - 1,
    };
  }

  /**
   * Updates private broadhash and height values.
   */
  public update(lastBlock: SignedAndChainedBlockType) {
    this.headers.broadhash = lastBlock.id;
    this.headers.height = lastBlock.height;
  }
}
