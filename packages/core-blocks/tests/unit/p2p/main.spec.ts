import { createContainer } from '@risevision/core-launchpad/tests/unit/utils/createContainer';
import { IBroadcasterLogic, p2pSymbols } from '@risevision/core-p2p';
import { SignedAndChainedBlockType, Symbols } from '@risevision/core-types';
import { LoggerStub } from '@risevision/core-utils/tests/unit/stubs';
import { expect } from 'chai';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { Container } from 'inversify';
import { WordPressHookSystem } from 'mangiafuoco';
import { SinonSandbox, SinonStub } from 'sinon';
import * as sinon from 'sinon';
import { BlocksSymbols, OnBlockApplied } from '../../../src';
import { BlocksP2P } from '../../../src/p2p';
import { createFakeBlock } from '../utils/createFakeBlocks';

chai.use(chaiAsPromised);
// tslint:disable no-unused-expression
describe('blocks/p2p/main', () => {
  let sandbox: SinonSandbox;
  let container: Container;
  let instance: BlocksP2P;
  let hookSystem: WordPressHookSystem;
  let broadcaster: IBroadcasterLogic;
  let broadcastStub: SinonStub;
  let genesis: SignedAndChainedBlockType;
  before(async () => {
    sandbox = sinon.createSandbox();
    container = await createContainer([
      'core-blocks',
      'core-helpers',
      'core-crypto',
      'core',
      'core-accounts',
      'core-transactions',
    ]);
  });
  beforeEach(() => {
    sandbox.restore();
    instance = container.get(BlocksSymbols.__internals.mainP2P);
    hookSystem = container.get(Symbols.generic.hookSystem);
    broadcaster = container.get(p2pSymbols.logic.broadcaster);
    genesis = container.get(Symbols.generic.genesisBlock);
    broadcastStub = sandbox.stub(broadcaster, 'broadcast').resolves();
  });

  it('should not broadcast if broadcast is false.', async () => {
    await hookSystem.do_action(
      OnBlockApplied.name,
      createFakeBlock(container),
      false
    );
    expect(broadcastStub.called).is.false;
  });
  it('should not broadcast if broadcast is true but block exceeded maxRelays', async () => {
    await hookSystem.do_action(
      OnBlockApplied.name,
      { ...createFakeBlock(container), relays: 2 },
      false
    );
    expect(broadcastStub.called).is.false;
  });
  it('should broadcast', async () => {
    await hookSystem.do_action(
      OnBlockApplied.name,
      createFakeBlock(container),
      true
    );
    expect(broadcastStub.called).is.true;
  });
  it('should broadcast with new broadhash as header', async () => {
    const block = createFakeBlock(container);
    await hookSystem.do_action(OnBlockApplied.name, block, true);
    expect(
      broadcastStub.firstCall.args[0].options.payload.body.block.relays
    ).eq(1);
  });
  it('should incrementa relays to +1 if set and not exceeding maxRelays', async () => {
    const block = createFakeBlock(container);
    (block as any).relays = 1;
    await hookSystem.do_action(OnBlockApplied.name, block, true);
    expect(
      broadcastStub.firstCall.args[0].options.payload.body.block.relays
    ).eq(2);
  });

  it('should swallow broadcaster error to logger', async () => {
    const ls = container.get<LoggerStub>(Symbols.helpers.logger);
    ls.stubReset();
    broadcastStub.rejects(new Error('meow'));
    const block = createFakeBlock(container);
    await hookSystem.do_action(OnBlockApplied.name, block, true);
    expect(ls.stubs.warn.calledOnce).is.true;
    expect(ls.stubs.warn.firstCall.args[0]).contains('meow');
  });
});
