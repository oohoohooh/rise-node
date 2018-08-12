import {
  IAccountLogic,
  IBlockLogic,
  IBlocksModel,
  ICrypto,
  ITransactionLogic,
  Symbols
} from '@risevision/core-interfaces';
import * as ByteBuffer from 'bytebuffer';
import * as crypto from 'crypto';
import * as filterObject from 'filter-object';
import { inject, injectable, named } from 'inversify';
import z_schema from 'z-schema';
import { BlockRewardLogic } from './blockReward';
import {
  BlockType,
  ConstantsType,
  DBOp,
  IBaseTransaction,
  IKeypair,
  RawFullBlockListType,
  SignedAndChainedBlockType,
  SignedAndChainedTransportBlockType,
  SignedBlockType
} from '@risevision/core-types';
import { MyBigNumb } from '@risevision/core-utils';
import { ModelSymbols } from '@risevision/core-models';
import { BlocksSymbols } from '../blocksSymbols';

const blockSchema = require('../../schema/block.json');

// tslint:disable-next-line interface-over-type-literal

@injectable()
export class BlockLogic implements IBlockLogic {

  public table    = 'blocks';
  public dbFields = [
    'id',
    'version',
    'timestamp',
    'height',
    'previousBlock',
    'numberOfTransactions',
    'totalAmount',
    'totalFee',
    'reward',
    'payloadLength',
    'payloadHash',
    'generatorPublicKey',
    'blockSignature',
  ];
  @inject(Symbols.generic.zschema)
  public zschema: z_schema;

  @inject(Symbols.generic.constants)
  private constants: ConstantsType;
  @inject(Symbols.logic.blockReward)
  private blockReward: BlockRewardLogic;
  @inject(Symbols.generic.crypto)
  private crypto: ICrypto;
  @inject(Symbols.logic.transaction)
  private transaction: ITransactionLogic;
  @inject(Symbols.logic.account)
  private accountLogic: IAccountLogic;

  @inject(ModelSymbols.model)
  @named(BlocksSymbols.model)
  private BlocksModel: typeof IBlocksModel;

  public create(data: {
    keypair: IKeypair, timestamp: number,
    transactions: Array<IBaseTransaction<any>>,
    previousBlock?: SignedAndChainedBlockType
  }): SignedAndChainedBlockType {
    const transactions = data.transactions;
    transactions.sort((a, b) => {
      if (a.type < b.type) {
        return -1;
      }
      if (a.type > b.type) {
        return 1;
      }
      if (a.amount < b.amount) {
        return -1;
      }
      if (a.amount > b.amount) {
        return 1;
      }
      return 0;
    });

    const nextHeight = (data.previousBlock) ? data.previousBlock.height + 1 : 1;

    const reward    = this.blockReward.calcReward(nextHeight);
    let totalFee    = 0;
    let totalAmount = 0;
    let size        = 0;

    const blockTransactions = [];
    const payloadHash       = crypto.createHash('sha256');

    for (const transaction of transactions) {
      const bytes: Buffer = this.transaction.getBytes(transaction);

      if (size + bytes.length > this.constants.maxPayloadLength) {
        break;
      }

      size += bytes.length;

      totalFee += transaction.fee;
      totalAmount += transaction.amount;

      blockTransactions.push(transaction);
      payloadHash.update(bytes);
    }

    const block: SignedAndChainedBlockType = {
      blockSignature      : undefined,
      generatorPublicKey  : data.keypair.publicKey,
      height              : data.previousBlock.height + 1,
      id                  : undefined,
      numberOfTransactions: blockTransactions.length,
      payloadHash         : payloadHash.digest(),
      payloadLength       : size,
      previousBlock       : data.previousBlock.id,
      reward,
      timestamp           : data.timestamp,
      totalAmount,
      totalFee,
      transactions        : blockTransactions,
      version             : 0,
    };

    block.blockSignature = this.sign(block, data.keypair);
    block.id             = this.getId(block);
    return this.objectNormalize(block);
  }

  /**
   * Sign the block
   * @param {BlockType} block
   * @param {IKeypair} key
   * @returns {string}
   */
  public sign(block: BlockType, key: IKeypair): Buffer {
    return this.crypto.sign(
      this.getHash(block, false),
      key
    );
  }

  /**
   * Verifies block hash, generator block public key and block signature
   * @param {BlockType} block
   */
  public verifySignature(block: SignedBlockType): boolean {
    // console.log(block);
    // const res = new OldImplementation(this.ed, this.zschema, this.transaction, null)
    //  .verifySignature(block);
    // console.log(res);
    return this.crypto.verify(
      this.getHash(block, false),
      block.blockSignature,
      block.generatorPublicKey
    );
  }

  /**
   * Creates db object transaction to `blocks` table.
   * @param {BlockType} block
   * TODO: Change method name to something more meaningful as this does NOT save
   */
  public dbSave(block: SignedBlockType): DBOp<IBlocksModel & { id: string }> {
    const values = { ...filterObject(block, this.dbFields) };
    return {
      model: this.BlocksModel,
      type : 'create',
      values,
    };
  }

  /**
   * Normalize block object and eventually throw if something is not valid
   * Does NOT perform signature validation but just content validation.
   * @param {BlockType} block
   * @returns {BlockType}
   */
  public objectNormalize<T extends BlockType<Buffer | string>>(block: T | SignedAndChainedTransportBlockType): T | SignedAndChainedBlockType {
    // Delete null or undefined elements in block obj
    for (const key in block) {
      if (block[key] === null || typeof(block[key]) === 'undefined') {
        delete block[key];
      }
    }

    ['generatorPublicKey', 'payloadHash', 'blockSignature'].forEach((bufKey) => {
      if (!Buffer.isBuffer(block[bufKey])) {
        block[bufKey] = Buffer.from(block[bufKey], 'hex');
      }
    });

    const report = this.zschema.validate(
      block,
      blockSchema
    );
    if (!report) {
      throw new Error(`Failed to validate block schema: ${this.zschema
        .getLastErrors().map((err) => err.message).join(', ')}`
      );
    }

    for (let i = 0; i < block.transactions.length; i++) {
      block.transactions[i] = this.transaction.objectNormalize(block.transactions[i]);
    }
    // cast to any is correct as we transform non-buffer items to
    return block as any;
  }

  public dbRead(rawBlock: RawFullBlockListType): SignedBlockType & { totalForged: string, readonly generatorId: string } {
    if (!rawBlock.b_id) {
      return null;
    } else {
      const self        = this;
      const block       = {
        blockSignature      : Buffer.from(rawBlock.b_blockSignature, 'hex'),
        get generatorId() {
          return self.accountLogic.generateAddressByPublicKey(rawBlock.b_generatorPublicKey);
        },
        generatorPublicKey  : Buffer.from(rawBlock.b_generatorPublicKey, 'hex'),
        height              : parseInt(`${rawBlock.b_height}`, 10),
        id                  : rawBlock.b_id,
        numberOfTransactions: parseInt(`${rawBlock.b_numberOfTransactions}`, 10),
        payloadHash         : Buffer.from(rawBlock.b_payloadHash, 'hex'),
        payloadLength       : parseInt(`${rawBlock.b_payloadLength}`, 10),
        previousBlock       : rawBlock.b_previousBlock,
        reward              : parseInt(`${rawBlock.b_reward}`, 10),
        timestamp           : parseInt(`${rawBlock.b_timestamp}`, 10),
        totalAmount         : parseInt(`${rawBlock.b_totalAmount}`, 10),
        totalFee            : parseInt(`${rawBlock.b_totalFee}`, 10),
        totalForged         : '',
        version             : parseInt(`${rawBlock.b_version}`, 10),
      };
      block.totalForged = new MyBigNumb(block.totalFee).plus(new MyBigNumb(block.reward)).toString();
      return block;
    }
  }

  /**
   * Calculates block id.
   * @param {BlockType} block
   * @returns {string}
   */
  public getId(block: BlockType): string {
    const hash = crypto.createHash('sha256').update(this.getBytes(block)).digest();
    const temp = Buffer.alloc(8);
    for (let i = 0; i < 8; i++) {
      temp[i] = hash[7 - i];
    }
    return MyBigNumb.fromBuffer(temp).toString();
  }

  public getHash(block: BlockType, includeSignature: boolean = true) {
    return crypto.createHash('sha256')
      .update(this.getBytes(block, includeSignature))
      .digest();
  }

  public getBytes(block: BlockType | SignedBlockType, includeSignature: boolean = true): Buffer {
    const size = 4 + 4 + 8 + 4 + 4 + 8 + 8 + 4 + 4 + 4 + 32 + 32 + 64;
    const bb   = new ByteBuffer(size, true /* little endian */);
    bb.writeInt(block.version);
    bb.writeInt(block.timestamp);

    if (block.previousBlock) {
      const pb = new MyBigNumb(block.previousBlock)
        .toBuffer({ size: 8 });

      for (let i = 0; i < 8; i++) {
        bb.writeByte(pb[i]);
      }
    } else {
      for (let i = 0; i < 8; i++) {
        bb.writeByte(0);
      }
    }

    bb.writeInt(block.numberOfTransactions);

    // tslint:disable no-string-literal
    bb['writeLong'](block.totalAmount);
    bb['writeLong'](block.totalFee);
    bb['writeLong'](block.reward);
    // tslint:enable no-string-literal

    bb.writeInt(block.payloadLength);

    const payloadHashBuffer = block.payloadHash;
    // tslint:disable-next-line
    for (let i = 0; i < payloadHashBuffer.length; i++) {
      bb.writeByte(payloadHashBuffer[i]);
    }

    const generatorPublicKeyBuffer = block.generatorPublicKey;
    // tslint:disable-next-line
    for (let i = 0; i < generatorPublicKeyBuffer.length; i++) {
      bb.writeByte(generatorPublicKeyBuffer[i]);
    }

    if (typeof((block as SignedBlockType).blockSignature) !== 'undefined' && includeSignature) {
      const blockSignatureBuffer = (block as SignedBlockType).blockSignature;
      // tslint:disable-next-line
      for (let i = 0; i < blockSignatureBuffer.length; i++) {
        bb.writeByte(blockSignatureBuffer[i]);
      }
    }

    bb.flip();

    return bb.toBuffer() as any;
  }

}