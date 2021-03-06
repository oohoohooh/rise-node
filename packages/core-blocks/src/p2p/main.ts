import { IBroadcasterLogic, p2pSymbols } from '@risevision/core-p2p';
import {
  ILogger,
  ISystemModule,
  PeerState,
  SignedAndChainedBlockType,
  Symbols,
} from '@risevision/core-types';
import { logOnly } from '@risevision/core-utils';
import { decorate, inject, injectable, named } from 'inversify';
import * as _ from 'lodash';
import { WordPressHookSystem, WPHooksSubscriber } from 'mangiafuoco';
import { BlocksSymbols } from '../blocksSymbols';
import { OnBlockApplied } from '../hooks';
import { PostBlockRequest } from './PostBlockRequest';

const Extendable = WPHooksSubscriber(Object);
decorate(injectable(), Extendable);

/**
 * This class will subscribe to "PostApplyBlock" and will broadcast resulting block
 * to all other peers which have not the updated block yet (filter over old broadhash)
 */
@injectable()
export class BlocksP2P extends Extendable {
  @inject(Symbols.generic.hookSystem)
  public hookSystem: WordPressHookSystem;
  @inject(p2pSymbols.logic.broadcaster)
  private broadcaster: IBroadcasterLogic;
  @inject(p2pSymbols.transportMethod)
  @named(BlocksSymbols.p2p.postBlock)
  private postBlockRequest: PostBlockRequest;
  @inject(Symbols.modules.system)
  private systemModule: ISystemModule;
  @inject(Symbols.helpers.logger)
  private logger: ILogger;

  @OnBlockApplied(1000)
  public async onNewBlock(
    block: SignedAndChainedBlockType & { relays?: number },
    broadcast: boolean
  ) {
    if (broadcast) {
      const broadhash = block.previousBlock;
      block = _.cloneDeep(block);
      block.relays = block.relays || 0;
      if (block.relays < this.broadcaster.maxRelays()) {
        block.relays++;
        await this.broadcaster
          .broadcast({
            filters: { broadhash, allowedStates: [PeerState.CONNECTED] },
            options: {
              immediate: true,
              method: this.postBlockRequest,
              payload: {
                body: { block },
                headers: {
                  // We need to advertise ourselves with the new broadhash
                  broadhash: block.id,
                },
              },
            },
          })
          .catch(logOnly(this.logger));
      }
    }
  }
}
