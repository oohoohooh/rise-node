import {
  AccountsModelWith2ndSign,
  SecondSignatureAsset,
  SecondSignatureTransaction,
  SignaturesModel,
  SigSymbols,
} from '@risevision/core-secondsignature';
import { TXSymbols } from '@risevision/core-transactions';
import {
  DBOp,
  IBaseTransaction,
  SignedBlockType,
} from '@risevision/core-types';
import { inject, injectable, named } from 'inversify';
import { OldBaseTx } from './BaseOldTx';

// tslint:disable-next-line
@injectable()
export class OldSecondSignatureTx extends OldBaseTx<
  SecondSignatureAsset,
  SignaturesModel
> {
  @inject(TXSymbols.transaction)
  @named(SigSymbols.transaction)
  private secondSignTX: SecondSignatureTransaction;

  public assetBytes(tx: IBaseTransaction<SecondSignatureAsset>): Buffer {
    return this.secondSignTX.assetBytes(tx);
  }

  public fromBytes(
    buff: Buffer
  ): IBaseTransaction<SecondSignatureAsset, bigint> {
    const tx = super.fromBytes(buff);
    if (tx.recipientId !== '0R') {
      throw new Error('Invalid recipient');
    }
    delete tx.recipientId;
    return tx;
  }

  public readAsset(
    bytes: Buffer
  ): { consumedBytes: number; asset: SecondSignatureAsset } {
    return {
      asset: {
        signature: {
          publicKey: bytes.slice(0, 32),
        },
      },
      consumedBytes: 32,
    };
  }

  public calculateMinFee(
    tx: IBaseTransaction<SecondSignatureAsset>,
    sender: AccountsModelWith2ndSign,
    height: number
  ): bigint {
    return this.secondSignTX.calculateMinFee(tx, sender, height);
  }

  public async verify(
    tx: IBaseTransaction<SecondSignatureAsset>,
    sender: AccountsModelWith2ndSign
  ): Promise<void> {
    await super.verify(tx, sender);
    return this.secondSignTX.verify(tx, sender);
  }

  public apply(
    tx: IBaseTransaction<SecondSignatureAsset>,
    block: SignedBlockType,
    sender: AccountsModelWith2ndSign
  ): Promise<Array<DBOp<any>>> {
    return this.secondSignTX.apply(tx, block, sender);
  }

  public undo(
    tx: IBaseTransaction<SecondSignatureAsset>,
    block: SignedBlockType,
    sender: AccountsModelWith2ndSign
  ): Promise<Array<DBOp<any>>> {
    return this.secondSignTX.undo(tx, block, sender);
  }

  public findConflicts(
    txs: Array<IBaseTransaction<SecondSignatureAsset>>
  ): Promise<Array<IBaseTransaction<SecondSignatureAsset>>> {
    return this.secondSignTX.findConflicts(txs);
  }

  public objectNormalize(
    tx: IBaseTransaction<SecondSignatureAsset<string | Buffer>, bigint>
  ): IBaseTransaction<SecondSignatureAsset, bigint> {
    return this.secondSignTX.objectNormalize(tx);
  }

  public dbSave(
    tx: IBaseTransaction<SecondSignatureAsset> & { senderId: string }
  ): DBOp<SignaturesModel> {
    return this.secondSignTX.dbSave(tx);
  }

  public attachAssets(
    txs: Array<IBaseTransaction<SecondSignatureAsset>>
  ): Promise<void> {
    return this.secondSignTX.attachAssets(txs);
  }
}
