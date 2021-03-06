import { createContainer } from '@risevision/core-launchpad/tests/unit/utils/createContainer';
import { ModelSymbols } from '@risevision/core-models';
import {
  Address,
  ConstantsType,
  DBCreateOp,
  IAccountLogic,
  IBaseTransaction,
  ICrypto,
  IKeypair,
  Symbols,
} from '@risevision/core-types';
import * as ByteBuffer from 'bytebuffer';
import * as chai from 'chai';
import 'chai-arrays';
import * as crypto from 'crypto';
import { RiseV2 } from 'dpos-offline';
import { Container } from 'inversify';
import { SinonSandbox, SinonSpy } from 'sinon';
import * as sinon from 'sinon';
import { As } from 'type-tagger';
import { toNativeTx } from '../../../../core-transactions/tests/unit/utils/txCrafter';
import {
  BlockLogic,
  BlocksConstantsType,
  BlocksModel,
  BlocksSymbols,
} from '../../../src';
import { createFakeBlock } from '../utils/createFakeBlocks';

// tslint:disable-next-line no-var-requires
const assertArrays = require('chai-arrays');

const { expect } = chai;
chai.use(assertArrays);

// tslint:disable no-unused-expression no-big-function object-literal-sort-keys
describe('logic/block', () => {
  const passphrase =
    'oath polypody manumit effector half sigmoid abound osmium jewfish weed sunproof ramose';
  const account = RiseV2.deriveKeypair(passphrase);
  let keyPair: IKeypair;
  let sandbox: SinonSandbox;
  let container: Container;
  let dummyBlock;
  let dummyTransactions: Array<IBaseTransaction<any>>;
  let callback;
  let instance: BlockLogic;
  let constants: ConstantsType;
  let data;
  let createHashSpy: SinonSpy;
  let blocksModel: typeof BlocksModel;
  let cryptoImplementation: ICrypto;

  const bb = new ByteBuffer(1 + 4 + 32 + 32 + 8 + 8 + 64 + 64, true);
  bb.writeInt(123);
  bb.flip();
  const buffer = bb.toBuffer();
  before(async () => {
    container = await createContainer([
      'core-blocks',
      'core-helpers',
      'core-crypto',
      'core',
      'core-accounts',
      'core-transactions',
    ]);

    const bc = container.get<BlocksConstantsType>(BlocksSymbols.constants);
    bc.rewards = [
      { fromHeight: 1, reward: '0' },
      { fromHeight: 10, reward: '1500000000' },
      { fromHeight: 11, reward: '30000000' },
      { fromHeight: 12, reward: '20000000' },
      { fromHeight: 13, reward: '1500000000' },
      { fromHeight: 1054080, reward: '1200000000' },
      { fromHeight: 1054080 * 2, reward: '900000000' },
      { fromHeight: 1054080 * 3, reward: '600000000' },
      { fromHeight: 1054080 * 4, reward: '300000000' },
      { fromHeight: 1054080 * 5, reward: '100000000' },
    ];
  });
  beforeEach(async () => {
    sandbox = sinon.createSandbox();

    cryptoImplementation = container.get(Symbols.generic.crypto);
    keyPair = cryptoImplementation.makeKeyPair(
      crypto
        .createHash('sha256')
        .update(passphrase, 'utf8')
        .digest()
    );
    constants = container.get(Symbols.generic.constants);
    createHashSpy = sandbox.spy(crypto, 'createHash');
    dummyTransactions = [
      RiseV2.txs.createAndSign(
        {
          kind: 'send-v2',
          recipient: '15256762582730568272R' as Address,
          amount: '1',
          fee: '5',
          nonce: '0' as string & As<'nonce'>,
        },
        account,
        true
      ),
      RiseV2.txs.createAndSign(
        {
          kind: 'send-v2',
          recipient: '15256762582730568272R' as Address,
          amount: '2',
          fee: '5',
          nonce: '1' as string & As<'nonce'>,
        },
        account,
        true
      ),
      RiseV2.txs.createAndSign(
        {
          kind: 'send-v2',
          recipient: '15256762582730568272R' as Address,
          amount: '3',
          fee: '5',
          nonce: '2' as string & As<'nonce'>,
        },
        account,
        true
      ),
      RiseV2.txs.createAndSign(
        {
          kind: 'send-v2',
          recipient: '15256762582730568272R' as Address,
          amount: '4',
          fee: '5',
          nonce: '3' as string & As<'nonce'>,
        },
        account,
        true
      ),
    ].map((t) => toNativeTx(t));

    dummyBlock = {
      blockSignature: Buffer.from(
        '8c5f2b088eaf0634e1f6e12f94a1f3e871f21194489c76ad2aae5c1b71acd848bc7b' +
          '158fa3b827e97f3f685c772bfe1a72d59975cbd2ccaa0467026d13bae50a',
        'hex'
      ),
      generatorPublicKey: Buffer.from(
        'c950f1e6c91485d2e6932fbd689bba636f73970557fe644cd901a438f74883c5',
        'hex'
      ),
      numberOfTransactions: 2,
      payloadHash: Buffer.from(
        'b3cf5bb113442c9ba61ed0a485159b767ca181dd447f5a3d93e9dd73564ae762',
        'hex'
      ),
      payloadLength: 8,
      previousBlock: '1',
      reward: 30000000n,
      timestamp: 1506889306558,
      totalAmount: 217821782000000n,
      totalFee: 8n,
      transactions: dummyTransactions,
      version: 0,
    };

    callback = sandbox.spy();
    instance = container.get(BlocksSymbols.logic.block);
    data = {
      keypair: keyPair,
      previousBlock: { id: '1', height: 10 },
      timestamp: Date.now(),
      transactions: dummyTransactions,
    };

    blocksModel = container.getNamed(ModelSymbols.model, BlocksSymbols.model);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('create', () => {
    it('should return a valid signed block', () => {
      const newBlock = instance.create(data);
      expect(newBlock).to.be.an.instanceof(Object);
      expect(newBlock.totalFee).to.equal(20n);
      expect(newBlock.numberOfTransactions).to.equal(4);
      expect(newBlock.transactions).to.have.lengthOf(4);
      expect(newBlock.payloadLength).eq(532);
      expect(newBlock.previousBlock).eq('1');
      expect(newBlock.reward).eq(30000000n);
      expect(newBlock.totalAmount).eq(10n);

      expect(newBlock.payloadHash).deep.eq(
        Buffer.from(
          'e13014bba397c427809d9cdda4041f39f792ff2b3ecab6597b2b7cd319e28b5d',
          'hex'
        )
      );
      expect(newBlock.generatorPublicKey).deep.eq(keyPair.publicKey);
      expect(
        cryptoImplementation.verify(
          instance.getHash(newBlock, false),
          newBlock.blockSignature,
          keyPair.publicKey
        )
      ).true;
    });
  });

  describe('sign', () => {
    it('should return a block signature of 64byte ', () => {
      const blockSignature = instance.sign(dummyBlock, keyPair);
      expect(blockSignature).to.have.lengthOf(64);
    });
    it('should return a valid signature', () => {
      const newBlock = instance.create(data);
      expect(instance.verifySignature(newBlock)).true;
    });
  });

  // TODO: Migrate this test to blockBytes.
  // describe('getBytes', () => {
  //   it('should return a Buffer', () => {
  //     expect(instance.getBytes(dummyBlock)).to.be.an.instanceof(Buffer);
  //   });
  //
  //   it('should return a Buffer of a given length', () => {
  //     expect(instance.getBytes(dummyBlock).length).to.lte(
  //       4 + 4 + 8 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64
  //     );
  //   });
  // });

  describe('getHash', () => {
    it('should return a hash of Buffer type', () => {
      const hash = instance.getHash(dummyBlock);
      expect(hash).to.be.an.instanceof(Buffer);
      expect(hash).to.be.ofSize(32);
      expect(hash.toString('hex')).to.be.eq(
        '861efb7163c6f4f27944262395233fd80f5bbe863e535c25ca37c303062a6640'
      );
    });
  });

  describe('verifySignature', () => {
    // it('should call ed.verify and return the same result', () => {
    //   const verifySpy = sinon.spy(ed, 'verify');
    //   const signed = instance.create(data);
    //   const verified = instance.verifySignature(signed);
    //   expect(verifySpy.calledOnce).to.be.true;
    //   expect(verifySpy.firstCall.returnValue).to.be.equal(verified);
    //   verifySpy.restore();
    // });
    //
    it('should call BlockLogic.getHash', () => {
      const signed = instance.create(data);
      const getHashSpy = sinon.spy(instance, 'getHash');
      instance.verifySignature(signed);
      expect(getHashSpy.calledOnce).to.be.true;
      expect(getHashSpy.firstCall.args[0]).to.be.deep.eq(signed);
      getHashSpy.restore();
    });
  });

  describe('dbSave', () => {
    it('should return a specific object', () => {
      const result: DBCreateOp<BlocksModel> = instance.dbSaveOp(
        dummyBlock
      ) as any;
      expect(result.model).to.be.deep.eq(blocksModel);
      expect(result.type).to.be.deep.eq('create');
      const toSave = { ...dummyBlock };
      delete toSave.transactions;
      expect(result.values).to.be.deep.eq(toSave);
    });
  });

  describe('objectNormalize', () => {
    it('should return a normalized block', () => {
      const validBlock: any = instance.create(data);
      validBlock.foo = null;
      validBlock.bar = undefined;
      const block: any = instance.objectNormalize(validBlock);
      expect(block).to.be.an.instanceof(Object);
      expect(block.foo).to.be.undefined;
      expect(block.bar).to.be.undefined;
      expect(block.greeting).to.be.undefined;
    });

    it('should call fail by schema validation', () => {
      const validBlock: any = instance.create(data);
      delete validBlock.id;
      expect(() => instance.objectNormalize(validBlock)).to.throw(
        'Missing required property: id'
      );
    });
  });

  describe('objectNormalize with real data', () => {
    it('should pass with fake but correct block', () => {
      const b = createFakeBlock(container, {});
      instance.objectNormalize(b);
    });
    it('should return buffers on proper fields', () => {
      const b = createFakeBlock(container, {});
      b.generatorPublicKey = b.generatorPublicKey.toString('hex') as any;
      const res = instance.objectNormalize(b);
      expect(res.generatorPublicKey).instanceOf(Buffer);
    });
    it('should reject if height < 1', () => {
      const b = createFakeBlock(container, {});
      b.height = 0;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Failed to validate block schema: Value 0 is less than minimum 1'
      );
    });
    it('should reject if id is exceeding length', () => {
      const b = createFakeBlock(container, {});
      b.id = Array(21)
        .fill('1')
        .join('');
      expect(() => instance.objectNormalize(b)).to.throw(
        'Failed to validate block schema: String is too long'
      );
    });
    it('should reject if id is defined but zero length', () => {
      const b = createFakeBlock(container, {});
      b.id = '';
      expect(() => instance.objectNormalize(b)).to.throw(
        'Failed to validate block schema: String is too short'
      );
    });
    // tslint:disable-next-line
    it('should reject if id is defined invalid', () => {
      const b = createFakeBlock(container, {});
      b.id = 'a1a';
      expect(() => instance.objectNormalize(b)).to.throw(
        "Failed to validate block schema: Object didn't pass validation for format id: a1a"
      );
    });
    it('should validate blockSignature', () => {
      const b = createFakeBlock(container, {});
      delete b.blockSignature;
      expect(() => instance.objectNormalize(b)).to.throw();
      b.blockSignature = null;
      expect(() => instance.objectNormalize(b)).to.throw();

      // blocksignature not long 64bytes
      b.blockSignature = Buffer.alloc(0);
      const error =
        "Failed to validate block schema: Object didn't pass validation for format signatureBuf";
      expect(() => instance.objectNormalize(b)).to.throw(error);

      // blockSignature as string not long enough
      b.blockSignature = Buffer.alloc(32).toString('hex') as any;
      expect(() => instance.objectNormalize(b)).to.throw(error);

      // valid buffer
      b.blockSignature = Buffer.alloc(64);
      instance.objectNormalize(b);

      // Valid string
      b.blockSignature = Buffer.alloc(64).toString('hex') as any;
      instance.objectNormalize(b);
    });
    it('should validate generatorPublicKEy', () => {
      const b = createFakeBlock(container, {});
      delete b.generatorPublicKey;
      expect(() => instance.objectNormalize(b)).to.throw();
      b.generatorPublicKey = null;
      expect(() => instance.objectNormalize(b)).to.throw();

      // blocksignature not long 64bytes
      b.generatorPublicKey = Buffer.alloc(0);
      const error =
        "Failed to validate block schema: Object didn't pass validation for format publicKeyBuf";
      expect(() => instance.objectNormalize(b)).to.throw(error);

      // blockSignature as string not long enough
      b.generatorPublicKey = Buffer.alloc(31).toString('hex') as any;
      expect(() => instance.objectNormalize(b)).to.throw(error);

      // valid buffer
      b.generatorPublicKey = Buffer.alloc(32);
      instance.objectNormalize(b);

      // Valid string
      b.generatorPublicKey = Buffer.alloc(32).toString('hex') as any;
      instance.objectNormalize(b);
    });
    it('should validate numberOfTransactions field', () => {
      const b = createFakeBlock(container, {});

      delete b.numberOfTransactions;
      expect(() => instance.objectNormalize(b)).to.throw();
      b.numberOfTransactions = null;
      expect(() => instance.objectNormalize(b)).to.throw();

      b.numberOfTransactions = -1;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Value -1 is less than minimum'
      );
    });
    it('should validate payloadHash field', () => {
      const b = createFakeBlock(container, {});
      delete b.payloadHash;
      expect(() => instance.objectNormalize(b)).to.throw();
      b.payloadHash = null;
      expect(() => instance.objectNormalize(b)).to.throw();
      // payloadHash not long 32bytes
      b.payloadHash = Buffer.alloc(0);
      const error =
        "Failed to validate block schema: Object didn't pass validation for format sha256Buf";
      expect(() => instance.objectNormalize(b)).to.throw(error);

      // payloadHash as string not long enough
      b.payloadHash = Buffer.alloc(31).toString('hex') as any;
      expect(() => instance.objectNormalize(b)).to.throw(error);

      // valid buffer
      b.payloadHash = Buffer.alloc(32);
      instance.objectNormalize(b);

      // Valid string
      b.payloadHash = Buffer.alloc(32).toString('hex') as any;
      instance.objectNormalize(b);
    });
    it('should validate payloadLength', () => {
      const b = createFakeBlock(container, {});
      delete b.payloadLength;
      expect(() => instance.objectNormalize(b)).to.throw();
      b.payloadLength = null;
      expect(() => instance.objectNormalize(b)).to.throw();
      b.payloadLength = -1;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Value -1 is less than minimum'
      );
    });
    it('should validate previousBlock field', () => {
      const b = createFakeBlock(container, {});
      delete b.previousBlock;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Missing required property: previousBlock'
      );

      b.previousBlock = 'a1a';
      expect(() => instance.objectNormalize(b)).to.throw(
        " Object didn't pass validation for format id: a1a"
      );
    });
    it('should validate timestamp field', () => {
      const b = createFakeBlock(container, {});
      delete b.timestamp;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Missing required property: timestamp'
      );

      b.timestamp = -1;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Value -1 is less than minimum 0'
      );
    });
    it('should validate totalAmount', () => {
      const b = createFakeBlock(container, {});
      delete b.totalAmount;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Missing required property: totalAmount'
      );

      b.totalAmount = -1n;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Block validation failed. One of reward,totalFee,totalAmount is lt 0'
      );
    });
    it('should validate totalFee', () => {
      const b = createFakeBlock(container, {});
      delete b.totalFee;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Missing required property: totalFee'
      );

      b.totalFee = -1n;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Block validation failed. One of reward,totalFee,totalAmount is lt 0'
      );
    });
    it('should validate reward', () => {
      const b = createFakeBlock(container, {});
      delete b.reward;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Missing required property: reward'
      );

      b.reward = -1n;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Block validation failed. One of reward,totalFee,totalAmount is lt 0'
      );
    });
    it('should validate height', () => {
      const b = createFakeBlock(container, {});
      delete b.height;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Missing required property: height'
      );

      b.height = 0;
      expect(() => instance.objectNormalize(b)).to.throw();
    });
    it('should validate version', () => {
      const b = createFakeBlock(container, {});
      delete b.version;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Missing required property: version'
      );

      b.version = -1;
      expect(() => instance.objectNormalize(b)).to.throw(
        'Value -1 is less than minimum 0'
      );
    });
    //
    // it('should validate transactions', () => {
    //   let b = createFakeBlock(container, {});
    //   delete b.transactions;
    //   expect(() => instance.objectNormalize(b))
    //     .to.throw('Missing required property: transactions');
    //   b.transactions = null;
    //   expect(() => instance.objectNormalize(b))
    //     .to.throw('Missing required property: transactions');
    // tslint:disable-next-line
    //   b = createFakeBlock(container, {transactions: createRandomTransactions({send: 2}).map((tx) => toBufferedTransaction(tx))});
    //   instance.objectNormalize(b);
    //   expect(transactionLogicStub.stubs.objectNormalize.callCount).eq(2);
    // });
  });
  // describe('objectNormalize() with a bad block schema', () => {
  //   it('should throw an exception if schema validation fails', () => {
  //     zschemastub.enqueueResponse('getLastErrors', []);
  //     zschemastub.enqueueResponse('validate', false);
  //     dummyBlock.greeting = 'Hello World!';
  //     expect(() => {
  //       instance.objectNormalize(dummyBlock);
  //     }).to.throw(/Failed to validate block schema/);
  //   });
  //   it('should throw an exception if schema validation fails with errors', () => {
  //     zschemastub.enqueueResponse('validate', false);
  //     zschemastub.enqueueResponse('getLastErrors', [{message: '1'}, {message: '2'}]);
  //     dummyBlock.greeting = 'Hello World!';
  //     expect(() => {
  //       instance.objectNormalize(dummyBlock);
  //     }).to.throw('Failed to validate block schema: 1, 2');
  //   });
  // });

  // describe('getId', () => {
  //   it('should returns an id string', () => {
  //     expect(instance.getId(dummyBlock)).to.equal('1931531116681750305');
  //   });
  //
  //   it('should call crypto.createHash', () => {
  //     instance.getId(dummyBlock);
  //     expect(createHashSpy.called).to.be.true;
  //   });
  //
  //   it('should call BlockLogic.getBytes with block', () => {
  //     const getBytesSpy = sinon.spy(instance, 'getBytes');
  //     instance.getId(dummyBlock);
  //     expect(getBytesSpy.called).to.be.true;
  //     expect(getBytesSpy.firstCall.args[0]).to.be.deep.equal(dummyBlock);
  //     getBytesSpy.restore();
  //   });
  // });
});
