import * as chai from 'chai';
import { expect } from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { WordPressHookSystem, WPHooksSubscriber } from 'mangiafuoco';
import { Container } from 'inversify';
import * as sinon from 'sinon';
import { SinonSandbox, SinonStub } from 'sinon';
// import { AccountsModuleStub, DelegatesModuleStub, SystemModuleStub, } from '../../stubs';
import { AccountsAPI, AccountsModule, AccountsSymbols, CoreModule, FilterAPIGetAccount } from '../../src';
import { APISymbols } from '../../../core-apis/dist/helpers';
import { createContainer } from '@risevision/core-launchpad/tests/utils/createContainer';
import 'reflect-metadata';
import { Symbols } from '../../../core-interfaces/src';

chai.use(chaiAsPromised);

let isEmptyStub: SinonStub;
// const ProxyAccountsAPI = proxyquire('../../../src/apis/accountsAPI', {
//   'is-empty': (...args) => isEmptyStub.apply(this, args),
// });

// tslint:disable no-unused-expression max-line-length
describe('apis/accountsAPI', () => {

  let sandbox: SinonSandbox;
  let instance: AccountsAPI;
  let container: Container;
  // let schema: ZSchemaStub;
  // let accountsModule: AccountsModuleStub;
  // let delegatesModule: DelegatesModuleStub;
  // let systemModule: SystemModuleStub;

  beforeEach(() => {
    sandbox   = sinon.createSandbox();
    container = createContainer([
      'core-accounts',
      'core',
      'core-helpers',
    ]);

  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getAccount', () => {
    it('should validate schema', async () => {
      instance = container.getNamed(APISymbols.api, AccountsSymbols.api);
      await expect(instance.getAccount({ address: 'meow' })).rejectedWith('address - Object didn\'t pass');
      await expect(instance.getAccount({ publicKey: 'meow' })).rejectedWith('publicKey - Object didn\'t pass');
      await expect(instance.getAccount({} as any)).rejectedWith('Missing required property: address or publicKey');
      await expect(instance.getAccount({ address: '1R', extra: 'data' } as any)).rejectedWith('Additional properties not allowed: extra');
    });

    it('should validate against generated address if both pubKey and address are provided', async () => {
      instance = container.getNamed(APISymbols.api, AccountsSymbols.api);
      await expect(instance.getAccount({ address: '1R', publicKey: '69bcf81be8a34393507d3d371c551325a8d48f6e92284633bd7043030f5c6a26' })).rejectedWith('Account publicKey does not match address');
    });

    it('should query accountsModule', async () => {
      const accModule = container.get<AccountsModule>(AccountsSymbols.module);
      instance        = container.getNamed(APISymbols.api, AccountsSymbols.api);
      const stub      = sandbox.stub(accModule, 'getAccount').resolves(null);
      await expect(instance.getAccount({ address: '1R' })).rejectedWith('Account not found');

      expect(stub.calledOnce).is.true;
      expect(stub.firstCall.args[0]).deep.eq({ address: '1R' });
      stub.resetHistory();

      // It should also query by calculated address
      await expect(instance.getAccount({ publicKey: '69bcf81be8a34393507d3d371c551325a8d48f6e92284633bd7043030f5c6a26' })).rejectedWith('Account not found');
      expect(stub.calledOnce).is.true;
      expect(stub.firstCall.args[0]).deep.eq({
        address  : '4736561281125553123R',
        publicKey: Buffer.from('69bcf81be8a34393507d3d371c551325a8d48f6e92284633bd7043030f5c6a26', 'hex')
      });
    });

    it('should applyFilter for return response', async () => {
      const hookSystem: WordPressHookSystem = container.get(Symbols.generic.hookSystem);

      class FilterAccountResponse extends WPHooksSubscriber(Object) {
        public hookSystem = hookSystem;

        @FilterAPIGetAccount()
        public async filterAccount(acc: any) {
          return { ...acc, meow: true };
        }
      }

      const filterInstance = new FilterAccountResponse();
      await filterInstance.hookMethods();

      const accModule = container.get<AccountsModule>(AccountsSymbols.module);
      instance        = container.getNamed(APISymbols.api, AccountsSymbols.api);
      sandbox.stub(accModule, 'getAccount').resolves({ address: '1R', balance: 10, hexPublicKey: 'hey', u_balance: 11 });

      const res = await instance.getAccount({ address: '1R' });
      expect(res).deep.eq({
        account: {
          address: '1R', balance: '10', publicKey: 'hey', unconfirmedBalance: '11',
          meow   : true
        },
      });

      await filterInstance.unHook();
    });
  });
  //
  // describe('getAccount', () => {
  //   let accData;
  //   let query;
  //   let generatedAddress;
  //
  //   beforeEach(() => {
  //     generatedAddress = 'generatedAddress';
  //     query            = {
  //       address  : 'address',
  //       publicKey: 'publicKey',
  //     };
  //     accData          = {
  //       _timestampAttributes: {},
  //       address             : 'address',
  //       balance             : 'balance',
  //       multisignatures     : [],
  //       publicKey           : Buffer.from('0011aabbccddeeff0011aabbccddeeff0011aabbccddeeff0011aabbccddeeff', 'hex'),
  //       secondPublicKey     : Buffer.from('1111aabbccddeeff0011aabbccddeeff0011aabbccddeeff0011aabbccddeeff', 'hex'),
  //       secondSignature     : 1,
  //       u_balance           : '10000',
  //       u_multisignatures   : [],
  //       u_secondSignature   : 1,
  //     };
  //
  //     accountsModule.enqueueResponse('generateAddressByPublicKey', generatedAddress);
  //     accountsModule.enqueueResponse('getAccount', Promise.resolve(new AccountsModel(accData)));
  //
  //     isEmptyStub = sandbox.stub();
  //     isEmptyStub.onCall(0).returns(false)
  //       .onCall(1).returns(false)
  //       .onCall(2).returns(true)
  //       .onCall(3).returns(true);
  //   });
  //
  //   it('should call isEmpty', async () => {
  //     await instance.getAccount(query);
  //
  //     expect(isEmptyStub.called).to.be.true;
  //   });
  //
  //   describe('Error: Missing required property: address or publicKey', () => {
  //
  //     it('should throw error if query.address and query.publicKey are empty', async () => {
  //       isEmptyStub.reset();
  //       isEmptyStub.returns(true);
  //
  //       await expect(instance.getAccount(query)).to.be.rejectedWith('Missing required property: address or publicKey');
  //     });
  //
  //     it('should not throw error if only query.address is empty', async () => {
  //       isEmptyStub.onCall(0).returns(true)
  //         .onCall(1).returns(false);
  //
  //       await expect(instance.getAccount(query)).to.be.not.rejectedWith('Missing required property: address or publicKey');
  //     });
  //
  //     it('should not throw error if only query.publicKey is empty', async () => {
  //       isEmptyStub.onCall(0).returns(false)
  //         .onCall(1).returns(true);
  //
  //       await expect(instance.getAccount(query)).to.be.not.rejectedWith('Missing required property: address or publicKey');
  //     });
  //   });
  //
  //   it('should call this.accountsModule.generateAddressByPublicKey if query.publicKey isn"t empty', async () => {
  //     await instance.getAccount(query);
  //
  //     expect(accountsModule.stubs.generateAddressByPublicKey.calledOnce).to.be.true;
  //     expect(accountsModule.stubs.generateAddressByPublicKey.firstCall.args.length).to.be.equal(1);
  //     expect(accountsModule.stubs.generateAddressByPublicKey.firstCall.args[0]).to.be.equal(query.publicKey);
  //   });
  //
  //   describe('Error: Account publicKey does not match address', () => {
  //
  //     it('should throw error if query.address and query.publicKey are empty and address !== query.address', async () => {
  //       isEmptyStub.onCall(2).returns(false);
  //       isEmptyStub.onCall(3).returns(false);
  //
  //       await expect(instance.getAccount(query)).to.be.rejectedWith('Account publicKey does not match address');
  //     });
  //
  //     it('should not throw error if only query.address is empty', async () => {
  //       isEmptyStub.onCall(3).returns(false);
  //
  //       await expect(instance.getAccount(query)).to.be.not.rejectedWith('Account publicKey does not match address');
  //
  //     });
  //
  //     it('should not throw error if only query.publicKey is empty', async () => {
  //       isEmptyStub.onCall(2).returns(false);
  //
  //       await expect(instance.getAccount(query)).to.be.not.rejectedWith('Account publicKey does not match address');
  //
  //     });
  //
  //     it('should not throw error if only address === query.address and check of setting address in query.address if query.publicKey is empty', async () => {
  //       isEmptyStub.onCall(1).returns(true);
  //       isEmptyStub.onCall(2).returns(false);
  //       isEmptyStub.onCall(3).returns(false);
  //
  //       await expect(instance.getAccount(query)).to.be.not.rejectedWith('Account publicKey does not match address');
  //     });
  //   });
  //
  //   it('should call accountsModule.getAccount with derived address from publicKey', async () => {
  //     await instance.getAccount({ publicKey: 'publicKey' });
  //
  //     expect(accountsModule.stubs.getAccount.calledOnce).to.be.true;
  //     expect(accountsModule.stubs.getAccount.firstCall.args.length).to.be.equal(1);
  //     expect(accountsModule.stubs.getAccount.firstCall.args[0]).to.be.deep.equal({ address: 'generatedAddress' });
  //   });
  //
  //   it('should throw error if accountsModule.getAccount returns falsy ', async () => {
  //     accountsModule.reset();
  //     accountsModule.enqueueResponse('generateAddressByPublicKey', generatedAddress);
  //     accountsModule.enqueueResponse('getAccount', null);
  //
  //     await expect(instance.getAccount(query)).to.be.rejectedWith('Account not found');
  //   });
  //
  //   it('should return an account', async () => {
  //     const res = await instance.getAccount(query);
  //
  //     expect(res).to.be.deep.equal({
  //       account: {
  //         address             : accData.address,
  //         balance             : accData.balance,
  //         multisignatures     : accData.multisignatures,
  //         publicKey           : accData.publicKey.toString('hex'),
  //         secondPublicKey     : accData.secondPublicKey.toString('hex'),
  //         secondSignature     : accData.secondSignature,
  //         u_multisignatures   : accData.u_multisignatures,
  //         unconfirmedBalance  : accData.u_balance,
  //         unconfirmedSignature: accData.u_secondSignature,
  //       }
  //     });
  //   });
  //
  // });
  //
  // describe('getBalance', () => {
  //
  //   let params;
  //   let account;
  //
  //   beforeEach(() => {
  //     params  = { address: 'address' };
  //     account = {
  //       balance  : '1',
  //       u_balance: '1',
  //     };
  //     accountsModule.enqueueResponse('getAccount', Promise.resolve(account));
  //   });
  //
  //   it('should call accountsModule.getAccount', async () => {
  //     await instance.getBalance(params);
  //
  //     expect(accountsModule.stubs.getAccount.calledOnce).to.be.true;
  //     expect(accountsModule.stubs.getAccount.firstCall.args.length).to.be.equal(1);
  //     expect(accountsModule.stubs.getAccount.firstCall.args[0]).to.be.deep.equal({ address: 'address' });
  //   });
  //
  //   it('should return a balance from an address', async () => {
  //     const ret = await instance.getBalance(params);
  //
  //     expect(ret).to.be.deep.equal({
  //       balance           : '1',
  //       unconfirmedBalance: '1',
  //     });
  //   });
  //
  //   it('should throw error if account not found', async () => {
  //     accountsModule.reset();
  //     accountsModule.enqueueResponse('getAccount', Promise.resolve());
  //
  //     const ret = await instance.getBalance(params);
  //
  //     expect(ret).to.be.deep.equal({
  //       balance           : '0',
  //       unconfirmedBalance: '0',
  //     });
  //   });
  //
  // });
  //
  // describe('getPublickey', () => {
  //
  //   let params;
  //   let account;
  //
  //   beforeEach(() => {
  //     params  = { address: 'address' };
  //     account = {
  //       publicKey: '1',
  //     };
  //     accountsModule.enqueueResponse('getAccount', Promise.resolve(new AccountsModel(account)));
  //   });
  //
  //   it('should call accountsModule.getAccount', async () => {
  //     await instance.getPublickey(params);
  //
  //     expect(accountsModule.stubs.getAccount.calledOnce).to.be.true;
  //     expect(accountsModule.stubs.getAccount.firstCall.args.length).to.be.equal(1);
  //     expect(accountsModule.stubs.getAccount.firstCall.args[0]).to.be.deep.equal({ address: 'address' });
  //   });
  //
  //   it('should return a public key from an address', async () => {
  //     const ret = await instance.getPublickey(params);
  //
  //     expect(ret).to.be.deep.equal({
  //       publicKey: '1',
  //     });
  //   });
  //
  //   it('should throw error if account not found', async () => {
  //     accountsModule.reset();
  //     accountsModule.enqueueResponse('getAccount', Promise.resolve());
  //
  //     await expect(instance.getPublickey(params)).to.be.rejectedWith('Account not found');
  //   });
  //
  // });
  //
  // describe('getDelegates', () => {
  //
  //   let params;
  //   let account;
  //
  //   beforeEach(() => {
  //     params  = { address: 'address' };
  //     account = { publicKey: '1' };
  //
  //     accountsModule.enqueueResponse('getAccount', Promise.resolve(account));
  //   });
  //
  //   it('should call accountsModule.getAccount', async () => {
  //     await instance.getDelegates(params);
  //
  //     expect(accountsModule.stubs.getAccount.calledOnce).to.be.true;
  //     expect(accountsModule.stubs.getAccount.firstCall.args.length).to.be.equal(1);
  //     expect(accountsModule.stubs.getAccount.firstCall.args[0]).to.be.deep.equal({ address: 'address' });
  //   });
  //
  //   it('should throw error if account not found', async () => {
  //     accountsModule.reset();
  //     accountsModule.enqueueResponse('getAccount', Promise.resolve());
  //
  //     await expect(instance.getDelegates(params)).to.be.rejectedWith('Account not found');
  //   });
  //
  //   describe('account.delegates is not null', () => {
  //
  //     let delegatesFromQuery;
  //     let del1;
  //     let del2;
  //
  //     beforeEach(() => {
  //       del1               = { publicKey: '1' };
  //       del2               = { publicKey: '3' };
  //       account.delegates  = ['1', '2'];
  //       delegatesFromQuery = [del1, del2].map((d, idx) => ({
  //         delegate: new AccountsModel(d), info: {
  //           rate        : idx,
  //           rank        : idx,
  //           approval    : 100,
  //           productivity: 100,
  //         },
  //       }));
  //       accountsModule.reset();
  //       accountsModule.enqueueResponse('getAccount', Promise.resolve(new AccountsModel(account)));
  //       delegatesModule.enqueueResponse('getDelegates', Promise.resolve({ delegates: delegatesFromQuery }));
  //     });
  //
  //     it('should call delegatesModule.getDelegates', async () => {
  //       await instance.getDelegates(params);
  //
  //       expect(delegatesModule.stubs.getDelegates.calledOnce).to.be.true;
  //       expect(delegatesModule.stubs.getDelegates.firstCall.args.length).to.be.equal(1);
  //       expect(delegatesModule.stubs.getDelegates.firstCall.args[0]).to.be.deep.equal({ orderBy: 'rank:desc' });
  //     });
  //
  //     it('should return object with same delegates from account"s delegates', async () => {
  //       const ret = await instance.getDelegates(params);
  //
  //       expect(ret).to.be.deep.equal({
  //         delegates: [
  //           {
  //             address: null,
  //             approval: 100,
  //             missedblocks: undefined,
  //             producedblocks: undefined,
  //             productivity: 100,
  //             rank: 0,
  //             rate: 0,
  //             username: undefined,
  //             vote: undefined,
  //             publicKey: '1',
  //           },
  //         ],
  //       });
  //     });
  //
  //   });
  //
  //   it('should return object with publicKey if account.delegates is null', async () => {
  //     const ret = await instance.getDelegates(params);
  //
  //     expect(ret).to.be.deep.equal({ publicKey: '1' });
  //   });
  //
  // });
  //
  // describe('getDelegatesFee', () => {
  //
  //   let params;
  //   let fee;
  //
  //   beforeEach(() => {
  //     fee    = {
  //       fees: {
  //         delegate: 1,
  //       },
  //     };
  //     params = { height: 1 };
  //     systemModule.enqueueResponse('getFees', fee);
  //   });
  //
  //   it('should call systemModule.getFees', async () => {
  //     await instance.getDelegatesFee(params);
  //
  //     expect(systemModule.stubs.getFees.calledOnce).to.be.true;
  //     expect(systemModule.stubs.getFees.firstCall.args.length).to.be.equal(1);
  //     expect(systemModule.stubs.getFees.firstCall.args[0]).to.be.equal(params.height);
  //   });
  //
  //   it('should return delegates fee from height', async () => {
  //     const ret = await instance.getDelegatesFee(params);
  //
  //     expect(ret).to.be.deep.equal({ fee: fee.fees.delegate });
  //   });
  //
  // });
  //
  // describe('open', () => {
  //
  //   it('should throw error', async () => {
  //     await expect(instance.open({ secret: 'sds' })).to.be.rejectedWith('Method is deprecated');
  //   });
  //
  // });
  // describe('addDelegate', () => {
  //
  //   it('should throw error', async () => {
  //     await expect(instance.addDelegate()).to.be.rejectedWith('Method is deprecated');
  //   });
  //
  // });
  // describe('generatePublicKey', () => {
  //
  //   it('should throw error', async () => {
  //     await expect(instance.generatePublicKey()).to.be.rejectedWith('Method is deprecated');
  //   });
  //
  // });
  //
  // describe('topAccounts', () => {
  //   let appConfig: AppConfig;
  //   beforeEach(() => {
  //     appConfig = container.get(Symbols.generic.appConfig);
  //     appConfig.topAccounts = true; // Enable it.
  //   });
  //
  //   it('should reject with appConfig.topAccounts not defined', async () => {
  //     delete appConfig.topAccounts;
  //     await expect(instance.topAccounts({})).to.be.rejectedWith('Top Accounts is not enabled');
  //     expect(accountsModule.stubs.getAccounts.called).is.false;
  //   });
  //   it('should reject with appConfig.topAccounts set to false', async () => {
  //     appConfig.topAccounts = false;
  //     await expect(instance.topAccounts({})).to.be.rejectedWith('Top Accounts is not enabled');
  //     expect(accountsModule.stubs.getAccounts.called).is.false;
  //   });
  //   it('should propagate request correctly with default params when not provided', async () => {
  //     appConfig.topAccounts = true;
  //     accountsModule.stubs.getAccounts.resolves([]);
  //
  //     await instance.topAccounts({});
  //     expect(accountsModule.stubs.getAccounts.calledOnce).is.true;
  //     expect(accountsModule.stubs.getAccounts.firstCall.args[0]).deep.eq({
  //       sort: { balance: -1 },
  //       limit: 100,
  //       offset: 0
  //     });
  //   });
  //   it('should query accountsModule.getAccounts with proper params', async () => {
  //     accountsModule.stubs.getAccounts.resolves([]);
  //     const res = await instance.topAccounts({limit: 1, offset: 10});
  //     expect(accountsModule.stubs.getAccounts.calledOnce).is.true;
  //     expect(accountsModule.stubs.getAccounts.firstCall.args[0]).deep.eq({
  //       sort: { balance: -1 },
  //       limit: 1,
  //       offset: 10
  //     });
  //     expect(accountsModule.stubs.getAccounts.firstCall.args[1]).deep.eq(
  //       ['address', 'balance', 'publicKey']
  //     );
  //     expect(res).to.be.deep.eq({accounts: []});
  //   });
  //   it('should remap getAccountsResult properly', async () => {
  //     accountsModule.stubs.getAccounts.resolves([
  //       new AccountsModel({ address: '1', balance: 10, u_balance: 11} as any),
  //       new AccountsModel({ address: '2', balance: 12, publicKey: Buffer.alloc(32).fill('a')}),
  //     ]);
  //     const res = await instance.topAccounts({});
  //     expect(res).to.be.deep.eq({
  //       accounts: [
  //         {address: '1', balance: 10, publicKey: null},
  //         {address: '2', balance: 12, publicKey: '6161616161616161616161616161616161616161616161616161616161616161'}
  //       ],
  //     });
  //   });
  // });
});