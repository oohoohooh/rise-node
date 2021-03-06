import {
  AppConfig,
  IJobsQueue,
  ILogger,
  PeerState,
  PeerType,
  Symbols,
} from '@risevision/core-types';
import * as assert from 'assert';
import { inject, injectable, postConstruct } from 'inversify';
import * as _ from 'lodash';
import * as PromiseThrottle from 'promise-parallel-throttle';
import { P2PConstantsType, p2pSymbols } from './helpers';
import { IBroadcasterLogic } from './interfaces/IBroadcasterLogic';
import { PeersLogic } from './peersLogic';
import { PeersModule } from './peersModule';
import { BaseTransportMethod, SingleTransportPayload } from './requests/';

// tslint:disable-next-line
export type BroadcastFilters = {
  limit?: number;
  broadhash?: string;
  peers?: PeerType[];
  allowedStates?: PeerState[];
};

// tslint:disable-next-line
export interface BroadcastTaskOptions<Body, Query, Out> {
  immediate?: boolean;
  headers?: { [h: string]: string };
  method: BaseTransportMethod<Body, Query, Out>;
  payload?: SingleTransportPayload<Body, Query>;
}

// tslint:disable-next-line
export interface BroadcastTask<Body, Query, Out> {
  options: BroadcastTaskOptions<Body, Query, Out>;
  filters: BroadcastFilters;
}

type Queue = Array<BroadcastTask<any, any, any>>;

@injectable()
export class BroadcasterLogic implements IBroadcasterLogic {
  public queue: Queue = [];
  // Generics
  @inject(Symbols.generic.appConfig)
  private config: AppConfig;

  // Helpers
  @inject(p2pSymbols.constants)
  private p2pConstants: P2PConstantsType;

  @inject(Symbols.helpers.jobsQueue)
  private jobsQueue: IJobsQueue;
  @inject(Symbols.helpers.logger)
  private logger: ILogger;

  // Logic
  @inject(Symbols.logic.peers)
  private peersLogic: PeersLogic;

  // Modules
  @inject(Symbols.modules.peers)
  private peersModule: PeersModule;

  @postConstruct()
  public afterConstruct() {
    this.jobsQueue.register(
      'broadcasterNextRelease',
      () =>
        this.releaseQueue().catch((err) => {
          this.logger.log('Broadcast timer', err);
          return;
        }),
      this.p2pConstants.broadcastInterval
    );
  }

  public cleanup() {
    this.jobsQueue.unregister('broadcasterNextRelease');
  }

  /**
   * Checks if object is entitled for being broadcasted. If so it will enqueue the object.
   * @param payload payload object to broadcast
   * @param method
   * @param filters eventual filters.
   */
  public maybeEnqueue<Body, Query, Out>(
    payload: SingleTransportPayload<Body & { relays?: number }, Query>,
    method: BaseTransportMethod<Body, Query, Out>,
    filters?: BroadcastFilters
  ): boolean {
    if (!payload.body) {
      throw new Error('payload.body param required');
    }
    payload.body.relays = (payload.body.relays || 0) + 1;
    if (payload.body.relays < this.maxRelays()) {
      this.enqueue(payload, method, filters);
      return true;
    }
    return false;
  }

  public enqueue<Body, Query, Out>(
    payload: SingleTransportPayload<Body, Query>,
    method: BaseTransportMethod<Body, Query, Out>,
    filters?: BroadcastFilters
  ): number {
    return this.queue.push({
      filters: filters || {},
      options: { immediate: false, method, payload },
    });
  }

  public async broadcast(
    // require `task.filters.peers` as not-null
    task: BroadcastTask<any, any, any> & { filters: BroadcastFilters }
  ): Promise<{ peer: PeerType[] }> {
    assert(task.filters, 'task.filters params required');
    // assert(task.filters.peers, 'task.filters.peers params required');

    task.filters.limit = task.filters.limit || this.p2pConstants.maxPeers;

    let peers = task.filters.peers;
    if (!peers) {
      peers = this.peersModule.getPeers(task.filters);
    }

    this.logger.debug('Begin broadcast');

    if (task.filters.limit === this.p2pConstants.maxPeers) {
      peers = peers.slice(0, this.p2pConstants.broadcastLimit);
    }

    await PromiseThrottle.all(
      peers
        .map((p) => this.peersLogic.create(p))
        .map((peer) => () => {
          return peer
            .makeRequest(task.options.method, task.options.payload)
            .catch((err) => {
              this.logger.debug(
                `Failed to broadcast to peer: ${peer.string}`,
                err
              );
              return null;
            });
        }),
      { maxInProgress: this.p2pConstants.parallelLimit }
    );
    this.logger.debug('End broadcast');
    return { peer: peers };
  }

  /**
   * Count relays, eventually increment by one and return true if broadcast is exhausted
   */
  public maxRelays(): number {
    return this.p2pConstants.relayLimit;
  }

  /**
   * Filter the queue basd on the tasks included.
   * Will include the ones with the immediate flag and transactions which are in pool or in unconfirmed state
   */
  private async filterQueue(): Promise<void> {
    this.logger.debug(`Broadcast before filtering: ${this.queue.length}`);
    const newQueue: Queue = [];
    const oldQueue = this.queue.slice();
    this.queue = [];
    for (const task of oldQueue) {
      if (task.options.immediate) {
        newQueue.push(task);
      } else if (
        !(await task.options.method.isRequestExpired(task.options.payload))
      ) {
        newQueue.push(task);
      }
    }

    this.queue.push(...newQueue);
    this.logger.debug(`Broadcasts after filtering: ${this.queue.length}`);
  }

  /**
   * Group broadcast requests by API.
   */
  private squashQueue(
    broadcasts: Array<BroadcastTask<any, any, any>>
  ): Array<BroadcastTask<any, any, any>> {
    const byRequests = _.groupBy(broadcasts, (b) => b.options.method.baseUrl);

    const squashed: Array<BroadcastTask<any, any, any>> = [];

    // tslint:disable-next-line
    for (const type in byRequests) {
      const requests = byRequests[type];
      const [first] = requests;

      const payloads = requests
        .map((item) => item.options.payload)
        .filter((payload) => payload);
      // cast manually as `filter` doesnt
      const payloadsFiltered: Required<typeof payloads> = payloads as any;

      const newRequests = first.options.method.mergeRequests(payloadsFiltered);

      squashed.push(
        ...newRequests.map((payload) => ({
          filters: {},
          options: {
            immediate: false,
            method: first.options.method,
            payload,
          },
        }))
      );
    }

    return squashed;
  }

  /**
   * Release and broadcasts enqueued stuff
   */
  private async releaseQueue(): Promise<void> {
    this.logger.debug('Releasing enqueued broadcasts');
    if (this.queue.length === 0) {
      this.logger.debug('Queue empty');
      return;
    }

    await this.filterQueue();
    let broadcasts = this.queue.splice(0, this.p2pConstants.releaseLimit);

    broadcasts = this.squashQueue(broadcasts);

    try {
      for (const brc of broadcasts) {
        await this.broadcast(brc);
      }
      this.logger.debug(`Broadcasts released ${broadcasts.length}`);
    } catch (e) {
      this.logger.warn('Failed to release broadcast queue', e);
    }
  }
}
