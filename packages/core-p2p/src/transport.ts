import {
  IAppState,
  IBlocksModel,
  IBlocksModule,
  IJobsQueue,
  ILogger,
  ISequence,
  ISystemModule,
  ITransactionsModel,
  Symbols,
} from '@risevision/core-interfaces';
import { ModelSymbols } from '@risevision/core-models';
import {
  AppConfig,
  BasePeerType,
  ConstantsType,
  PeerHeaders,
  PeerRequestOptions,
  PeerState, PeerType,
} from '@risevision/core-types';
import { cbToPromise } from '@risevision/core-utils';
import { decorate, inject, injectable, named, postConstruct } from 'inversify';
import { WordPressHookSystem, WPHooksSubscriber } from 'mangiafuoco';
import * as popsicle from 'popsicle';
import * as Throttle from 'promise-parallel-throttle';
import * as promiseRetry from 'promise-retry';
import * as z_schema from 'z-schema';
import { BroadcasterLogic } from './broadcaster';
import { p2pSymbols } from './helpers';
import { OnPeersReady } from './hooks/actions';
import { PeersLogic } from './peersLogic';
import { PeersModule } from './peersModule';
import { BaseTransportMethod, PeersListRequest, PeersListResponse, SingleTransportPayload } from './requests/';

// tslint:disable-next-line
const peersSchema     = require('../schema/peers.json');
// tslint:disable-next-line
const transportSchema = require('../schema/transport.json');

const Extendable = WPHooksSubscriber(Object);
decorate(injectable(), Extendable);

// tslint:disable-next-line
@injectable()
export class TransportModule extends Extendable {
  // Generics
  @inject(Symbols.generic.appConfig)
  private appConfig: AppConfig;
  // @inject(Symbols.generic.socketIO)
  // private io: SocketIO.Server;
  // tslint:disable-next-line member-ordering
  @inject(Symbols.generic.zschema)
  public schema: z_schema;
  // tslint:disable-next-line member-ordering
  @inject(Symbols.generic.hookSystem)
  public hookSystem: WordPressHookSystem;

  // Helpers
  // tslint:disable-next-line member-ordering
  @inject(Symbols.helpers.sequence)
  @named(Symbols.names.helpers.balancesSequence)
  public balancesSequence: ISequence;
  @inject(Symbols.generic.constants)
  private constants: ConstantsType;
  @inject(Symbols.helpers.jobsQueue)
  private jobsQueue: IJobsQueue;
  @inject(Symbols.helpers.logger)
  private logger: ILogger;

  // Logic
  @inject(Symbols.logic.appState)
  private appState: IAppState;
  @inject(Symbols.logic.broadcaster)
  private broadcasterLogic: BroadcasterLogic;
  @inject(Symbols.logic.peers)
  private peersLogic: PeersLogic;

  // Modules
  @inject(Symbols.modules.peers)
  private peersModule: PeersModule;
  @inject(Symbols.modules.system)
  private systemModule: ISystemModule;
  @inject(Symbols.modules.blocks)
  private blocksModule: IBlocksModule;

  // models
  @inject(ModelSymbols.model)
  @named(Symbols.models.blocks)
  private BlocksModel: typeof IBlocksModel;
  @inject(ModelSymbols.model)
  @named(Symbols.models.transactions)
  private TransactionsModel: typeof ITransactionsModel;

  @inject(p2pSymbols.requests.peersList)
  private peersListMethod: PeersListRequest;

  private loaded: boolean = false;

  @postConstruct()
  public postConstructor() {
    this.appState.setComputed('node.poorConsensus', (a: IAppState) => {
      if (typeof(a.get('node.consensus')) === 'undefined') {
        return false;
      }
      return a.get('node.consensus') < this.constants.minBroadhashConsensus;
    });
  }

  // tslint:disable-next-line max-line-length
  public async getFromPeer<T>(peer: BasePeerType, options: PeerRequestOptions): Promise<{ body: T, peer: PeerType }> {
    const url     = options.url;
    const thePeer = this.peersLogic.create(peer);
    const req     = {
      body     : null,
      headers  : {
        ... this.systemModule.headers as any,
        accept        : 'application/octet-stream',
        'content-type': 'application/octet-stream',
      },
      method   : options.method,
      timeout  : this.appConfig.peers.options.timeout,
      transport: popsicle.createTransport({ type: 'buffer' }),
      url      : `http://${peer.ip}:${peer.port}${url}`,
    };

    const parsingPlugin = (request: popsicle.Request, next: () => Promise<popsicle.Response>) => {
      return next().then((response) => response);
    };

    let res: popsicle.Response;
    try {
      res = await
        promiseRetry(
          (retry) => popsicle.request(req)
            .use(parsingPlugin)
            .catch(retry),
          {
            minTimeout: 2000, /* this is the timeout for the retry. Lets wait at least 2seconds before retrying. */
            retries   : 1,
          }
        );
    } catch (err) {
      this.removePeer({ peer: thePeer, code: 'HTTPERROR' }, err.message);
      return Promise.reject(err);
    }

    if (res.status !== 200) {
      this.removePeer({ peer: thePeer, code: `ERESPONSE ${res.status}` }, `${req.method} ${req.url}`);
      return Promise.reject(new Error(`Received bad response code ${res.status} ${req.method} ${res.url}`));
    }

    const headers: PeerHeaders = thePeer.applyHeaders(res.headers as any);
    if (!this.schema.validate(headers, transportSchema.headers)) {
      this.removePeer({ peer: thePeer, code: 'EHEADERS' }, `${req.method} ${req.url}`);
      return Promise.reject(new Error(`Invalid response headers ${JSON.stringify(headers)} ${req.method} ${req.url}`));
    }

    if (!this.systemModule.networkCompatible(headers.nethash)) {
      this.removePeer({ peer: thePeer, code: 'ENETHASH' }, `${req.method} ${req.url}`);
      return Promise.reject(new Error(`Peer is not on the same network ${headers.nethash} ${req.method} ${req.url}`));
    }

    if (!this.systemModule.versionCompatible(headers.version)) {
      this.removePeer({ peer: thePeer, code: `EVERSION ${headers.version}` }, `${req.method} ${req.url}`);
      // tslint:disable-next-line max-line-length
      return Promise.reject(new Error(`Peer is using incompatible version ${headers.version} ${req.method} ${req.url}`));
    }
    this.peersModule.update(thePeer);
    return {
      body: res.body,
      peer: thePeer,
    };
  }

  // tslint:disable-next-line max-line-length
  public async getFromRandomPeer<Body, Query, Out>(config: { limit?: number, broadhash?: string, allowedStates?: PeerState[] },
                                                   transportMethod: BaseTransportMethod<Body, Query, Out>,
                                                   payload: SingleTransportPayload<Body, Query>
  ): Promise<Out> {
    config.limit         = 1;
    config.allowedStates = [PeerState.CONNECTED, PeerState.DISCONNECTED];
    const { peers }      = await this.peersModule.list(config);
    if (peers.length === 0) {
      throw new Error('No peer available');
    }
    return transportMethod.makeRequest(peers[0], payload);
  }

  public cleanup() {
    this.loaded = false;
    this.jobsQueue.unregister('peersDiscoveryAndUpdate');
    return Promise.resolve();
  }

  public onBlockchainReady() {
    this.loaded = true;
  }

  @OnPeersReady()
  public async onPeersReady() {
    this.logger.trace('Peers ready');
    // await this.discoverPeers();
    this.jobsQueue.register('peersDiscoveryAndUpdate', async () => {
      try {
        await this.discoverPeers();
      } catch (err) {
        this.logger.error('Discovering new peers failed', err);
      }

      const peers = this.peersLogic.list(false);
      this.logger.trace('Updating peers', { count: peers.length });

      await Throttle.all(peers.map((p) => async () => {
        if (p && p.state !== PeerState.BANNED && (!p.updated || Date.now() - p.updated > 3000)) {
          this.logger.trace('Updating peer', p.string);
          try {
            await p.pingAndUpdate();
          } catch (err) {
            this.logger.debug(`Ping failed when updating peer ${p.string}`, err);
          }
        }
      }), { maxInProgress: 50 });
      this.logger.trace('Updated Peers');
    }, 5000);
  }

  /**
   * Calls enqueue signatures and emits a signature change socket message
   * TODO: Move me to consensus-dpos.
   */
  public onSignature(signature: { transaction: string, signature: string, relays?: number }, broadcast: boolean) {
    // signature.relays = signature.relays || 1;
    // if (broadcast && signature.relays < this.broadcasterLogic.maxRelays()) {
    //   const requestHandler = this.psrFactory({
    //     data: {
    //       signatures: [{
    //         relays     : Number.isInteger(signature.relays) ? signature.relays : 1,
    //         signature  : Buffer.from(signature.signature, 'hex'),
    //         transaction: signature.transaction,
    //       }],
    //     },
    //   });
    //   this.broadcasterLogic.enqueue({}, { requestHandler });
    //   this.io.sockets.emit('signature/change', signature);
    // }
  }

  /**
   * On new block get current broadhash, update system (to calc new broadhash) and broadcast block to all
   * peers on old broadhash.
   * Be aware that original block will be modified by adding relays if not there.
   * TODO: eventually fixme ^^
   */
  // public async onNewBlock(block: SignedBlockType & { relays?: number }, broadcast: boolean) {
  //   if (broadcast) {
  //     const broadhash = this.systemModule.broadhash;
  //     // await this.systemModule.update();
  //     block        = _.cloneDeep(block);
  //     block.relays = block.relays || 0;
  //     if (block.relays < this.broadcasterLogic.maxRelays()) {
  //       block.relays++;
  //       const reqHandler = this.pblocksFactory({ data: { block } });
  //       // We avoid awaiting the broadcast result as it could result in unnecessary peer removals.
  //       // Ex: Peer A, B, C
  //       // A broadcasts block to B which wants to rebroadcast to A (which is waiting for B to respond) =>
  //       // | - A will remove B as it will timeout and the same will happen to B
  //
  //       /* await */
  //       this.broadcasterLogic.broadcast({ limit: this.constants.maxPeers, broadhash },
  //         {
  //           immediate     : true,
  //           requestHandler: reqHandler,
  //         })
  //         .catch((err) => this.logger.warn('Error broadcasting block', err));
  //     }
  //   }
  // }
  //
  // TODO:
  // tslint:disable-next-line
  // public async receiveSignatures(signatures: Array<{ transaction: string, signature: string }>): Promise<void> {
  //   for (const signature of signatures) {
  //     try {
  //       await this.receiveSignature(signature);
  //     } catch (err) {
  //       this.logger.debug(err, signature);
  //     }
  //   }
  // }

// TODO
// /**
//  * Validate signature with schema and calls processSignature from module multisignautre
//  */
// @ValidateSchema()
// public async receiveSignature(@SchemaValid(transportSchema.signature, 'Invalid signature body')
//                                 signature: { transaction: string, signature: string }) {
//   try {
//     await this.multisigModule.processSignature(signature);
//   } catch (e) {
//     throw new Error(`Error processing signature: ${e.message || e}`);
//   }
// }

  /**
   * Removes a peer by calling modules peer remove
   */
  private removePeer(options: { code: string, peer: PeerType }, extraMessage: string) {
    this.logger.debug(`${options.code} Removing peer ${options.peer.string} ${extraMessage}`);
    this.peersModule.remove(options.peer.ip, options.peer.port);
  }

  /**
   * Discover peers by getting list and validates them
   */
  private async discoverPeers(): Promise<void> {
    this.logger.trace('Transport->discoverPeers');

    const response       = await this.getFromRandomPeer<void, void, PeersListResponse>(
      {},
      this.peersListMethod,
      null
    );

    await cbToPromise((cb) => this.schema.validate(response, peersSchema.discover.peers, cb));

    // Filter only acceptable peers.
    const acceptablePeers = this.peersLogic.acceptable(response.peers);

    let discovered   = 0;
    let alreadyKnown = 0;
    let rejected     = 0;
    for (const rawPeer of acceptablePeers) {
      const peer = this.peersLogic.create(rawPeer);
      if (this.schema.validate(peer, peersSchema.discover.peer)) {
        peer.state   = PeerState.DISCONNECTED;
        const newOne = this.peersLogic.upsert(peer, true);
        if (newOne) {
          discovered++;
        } else {
          alreadyKnown++;
        }
      } else {
        this.logger.warn(`Rejecting invalid peer: ${peer.string}`);
        rejected++;
      }
    }

    this.logger.debug(`Discovered ${discovered} peers - Rejected ${rejected} - AlreadyKnown ${alreadyKnown}`);

  }
}
