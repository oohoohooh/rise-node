import { createContainer } from '@risevision/core-launchpad/tests/unit/utils/createContainer';
import { ModelSymbols } from '@risevision/core-models';
import { IAccountsModel, IBlocksModel, Symbols } from '@risevision/core-types';
import * as chai from 'chai';
import * as fs from 'fs';
import { Container } from 'inversify';
import { Op } from 'sequelize';
import * as sequelize from 'sequelize';
import { SinonSandbox, SinonStub } from 'sinon';
import * as sinon from 'sinon';
import { dPoSSymbols, RoundChanges } from '../../../src/helpers';
import { RoundLogic } from '../../../src/logic/round';

const expect = chai.expect;

const pgpStub = { as: undefined } as any;

const performVoteSnapshotSQL = fs.readFileSync(
  `${__dirname}/../../../sql/queries/performVotesSnapshot.sql`,
  'utf8'
);

// tslint:disable no-unused-expression no-big-function object-literal-sort-keys no-identical-functions
describe('logic/round', () => {
  let sandbox: SinonSandbox;
  let instance;
  let scope;
  let container: Container;
  let accountsModel: typeof IAccountsModel;
  let blocksModel: typeof IBlocksModel;
  let roundLogic: typeof RoundLogic;
  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    container = await createContainer([
      'core-consensus-dpos',
      'core-helpers',
      'core-crypto',
    ]);
    accountsModel = container.getNamed(
      ModelSymbols.model,
      Symbols.models.accounts
    );
    blocksModel = container.getNamed(ModelSymbols.model, Symbols.models.blocks);
    roundLogic = container.get(dPoSSymbols.logic.round);

    scope = {
      backwards: false,
      block: {
        generatorPublicKey: Buffer.from(
          '9d3058175acab969f41ad9b86f7a2926c74258670fe56b37c429c01fca9f2f0f',
          'hex'
        ),
        height: 2,
        id: '1',
      },
      library: {
        logger: {
          debug: sandbox.stub(),
          trace: sandbox.stub(),
        },
        RoundChanges: container.get(dPoSSymbols.helpers.roundChanges),
      },
      modules: {
        accounts: {
          generateAddressByPubData: sandbox
            .stub()
            .callsFake((a) => a.toString('hex')),
          mergeAccountAndGetOPs: sandbox.stub().returns([]),
        },
      },
      models: {
        AccountsModel: accountsModel,
        BlocksModel: blocksModel,
      },
      round: 10,
      roundDelegates: [Buffer.from('aabbcc', 'hex')],
      roundFees: 0n,
      roundOutsiders: ['1', '2', '3'],
      roundRewards: [],
    };
    instance = new roundLogic(scope, container.get(dPoSSymbols.helpers.slots));
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it('should throw an error when a property is missing', () => {
      const scopeOriginal = Object.assign({}, scope);
      const requiredProperties = [
        'library',
        'modules',
        'block',
        'round',
        'backwards',
      ];

      requiredProperties.forEach((prop) => {
        scope = Object.assign({}, scopeOriginal);

        delete scope[prop];
        const throwError = () => {
          new roundLogic(scope, container.get(dPoSSymbols.helpers.slots));
        };
        expect(throwError).to.throw();
      });
    });

    it('should throw error if finishRound and missing requiredProperty', () => {
      scope.finishRound = true;
      const scopeOriginal = Object.assign({}, scope);
      const requiredProperties = [
        'library',
        'modules',
        'block',
        'round',
        'backwards',
        'roundFees',
        'roundRewards',
        'roundDelegates',
        'roundOutsiders',
      ];

      requiredProperties.forEach((prop) => {
        scope = Object.assign({}, scopeOriginal);

        delete scope[prop];
        const throwError = () => {
          new roundLogic(scope, container.get(dPoSSymbols.helpers.slots));
        };
        expect(throwError).to.throw();
      });
    });

    it('success', () => {
      expect(instance.scope).to.be.deep.equal(scope);
      // expect(instance.task).to.be.deep.equal(task);
    });
  });

  // describe('mergeBlockGenerator', () => {
  //   it('should call mergeAccountAndGetOPs', async () => {
  //     await instance.mergeBlockGenerator();
  //     expect(scope.modules.accounts.mergeAccountAndGetOPs.calledOnce).to.equal(true);
  //     expect(scope.modules.accounts.mergeAccountAndGetOPs.firstCall.args[0]).to.deep.equal({
  //       blockId       : scope.block.id,
  //       producedblocks: scope.backwards ? -1 : 1,
  //       publicKey     : scope.block.generatorPublicKey,
  //       // round         : scope.round,
  //     });
  //   });
  // });

  describe('updateMissedBlocks', () => {
    it('should return null roundOutsiders is empty', async () => {
      scope.roundOutsiders = [];
      const ar = await instance.updateMissedBlocks();
      expect(ar).to.be.null;
    });

    it('should return result from updateMissedBlocks', async () => {
      const retVal = await instance.updateMissedBlocks();
      expect(retVal.model).to.be.deep.eq(accountsModel);
      delete retVal.model; // causes memory issue
      expect(retVal).to.be.deep.eq({
        options: { where: { address: { [Op.in]: scope.roundOutsiders } } },
        type: 'update',
        values: { cmb: 0, missedblocks: { val: 'missedblocks + 1' } },
      });

      // chai does not support deep eq on obj with symbols
      expect(retVal.options.where.address[Op.in]).to.be.deep.eq(
        scope.roundOutsiders
      );
    });
  });

  describe('reCalcVotes', () => {
    it('should return custom DBOp with RoundsModel SQL', () => {
      scope.round = 10;
      const ret = instance.reCalcVotes();
      expect(ret.type).is.eq('custom');
      expect(ret.model).is.deep.eq(accountsModel);
      expect(ret.query).is.deep.eq(
        fs.readFileSync(`${__dirname}/../../../sql/queries/recalcVotes.sql`, {
          encoding: 'utf8',
        })
      );
    });
  });

  describe('restoreVotesSnapshot', () => {
    it('should return custom op over accountsModel', () => {
      const res = instance.restoreVotesSnapshot();
      expect(res.model).to.be.deep.eq(accountsModel);
      expect(res.type).to.be.deep.eq('custom');
      // TODO: test query?
    });
  });

  describe('applyRound', () => {
    let at: SinonStub;
    beforeEach(() => {
      const rc = container.get<typeof RoundChanges>(
        dPoSSymbols.helpers.roundChanges
      );
      at = sandbox.stub(rc.prototype, 'at');
    });

    it('should apply round changes to each delegate, with backwards false and fees > 0', async () => {
      at.returns({
        balance: 0n,
        fees: 0n,
        rewards: 0n,
        feesRemaining: 10n,
      });

      await instance.applyRound();

      expect(at.calledOnce).to.be.true;
      expect(at.firstCall.args).deep.eq([0]);
    });

    it('should behave correctly when backwards false, fees > 0 && feesRemaining > 0', async () => {
      at.returns({
        feesRemaining: 1n,
        balance: 10n,
        fees: 5n,
        rewards: 4n,
      });
      scope.roundDelegates = [
        Buffer.from('aa', 'hex'),
        Buffer.from('bb', 'hex'),
      ];

      const retVal = await instance.applyRound();

      expect(at.calledTwice).to.be.true;
      expect(at.firstCall.args[0]).to.equal(0);
      expect(at.secondCall.args[0]).to.equal(1);

      expect(retVal[0].options.where.address).eq('aa');
      expect(retVal[0].values).deep.eq({
        balance: sequelize.literal('balance + 10'),
        fees: sequelize.literal('fees + 5'),
        u_balance: sequelize.literal('u_balance + 10'),
        producedblocks: sequelize.literal('producedblocks + 1'),
        rewards: sequelize.literal('rewards + 4'),
        cmb: 0,
      });
      expect(retVal[1].options.where.address).eq('bb');
      expect(retVal[1].values).deep.eq({
        balance: sequelize.literal('balance + 10'),
        fees: sequelize.literal('fees + 5'),
        u_balance: sequelize.literal('u_balance + 10'),
        producedblocks: sequelize.literal('producedblocks + 1'),
        rewards: sequelize.literal('rewards + 4'),
        cmb: 0,
      });
    });
  });

  describe('land', () => {
    let updateMissedBlocks: SinonStub;
    let applyRound: SinonStub;
    let reCalcVotes: SinonStub;
    beforeEach(() => {
      updateMissedBlocks = sandbox
        .stub(instance, 'updateMissedBlocks')
        .returns({ updateMissed: true });
      applyRound = sandbox
        .stub(instance, 'applyRound')
        .returns([{ apply: 1 }, { apply: 2 }]);
      reCalcVotes = sandbox.stub(instance, 'reCalcVotes');
      reCalcVotes.onCall(0).returns({ reCalcVotes: 1 });
      reCalcVotes.onCall(1).returns({ reCalcVotes: 2 });
    });
    it('should call correct methods for finishRound v1', async () => {
      scope.finishRound = true;
      scope.dposV2 = false;
      const res = instance.apply();

      expect(updateMissedBlocks.calledOnce).to.be.true;
      expect(applyRound.calledOnce).to.be.true;
      expect(reCalcVotes.calledOnce).to.be.true;

      updateMissedBlocks.restore();
      applyRound.restore();

      expect(res).to.be.deep.eq([
        { updateMissed: true },
        { apply: 1 },
        { apply: 2 },
        {
          type: 'custom',
          query: performVoteSnapshotSQL,
          model: scope.models.AccountsModel,
        },
        { reCalcVotes: 1 },
      ]);
    });
  });

  describe('backwardLand', () => {
    let updateMissedBlocks: SinonStub;
    let applyRound: SinonStub;
    let restoreVotesSnapshot: SinonStub;
    let reCalcVotes: SinonStub;
    beforeEach(() => {
      updateMissedBlocks = sandbox
        .stub(instance, 'updateMissedBlocks')
        .returns({ updateMissed: true });
      applyRound = sandbox
        .stub(instance, 'applyRound')
        .returns([{ apply: 1 }, { apply: 2 }]);
      restoreVotesSnapshot = sandbox
        .stub(instance, 'restoreVotesSnapshot')
        .returns({ restorevotes: true });
      reCalcVotes = sandbox.stub(instance, 'reCalcVotes');
      reCalcVotes.onCall(0).returns({ reCalcVotes: 1 });
      reCalcVotes.onCall(1).returns({ reCalcVotes: 2 });
    });
    it('should call correct methods and return proper data for v1 finishRound', async () => {
      scope.dposV2 = false;
      scope.finishRound = true;
      const res = instance.undo();

      expect(updateMissedBlocks.calledOnce).to.be.true;
      expect(applyRound.calledOnce).to.be.true;
      expect(restoreVotesSnapshot.calledOnce).to.be.true;

      updateMissedBlocks.restore();
      applyRound.restore();

      expect(res).to.be.deep.eq([
        { updateMissed: true },
        { apply: 1 },
        { apply: 2 },
        { restorevotes: true },
      ]);
    });
  });
});
