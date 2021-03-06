import { ModelSymbols } from '@risevision/core-models';
import {
  DBCreateOp,
  DBOp,
  IAccountLogic,
  IAccountsModel,
  IAccountsModule,
  IBaseTransaction,
  ISystemModule,
  SignedBlockType,
  Symbols,
} from '@risevision/core-types';
import { inject, injectable, named } from 'inversify';
import { BaseTx } from './BaseTx';
import { SendTxApplyFilter, SendTxUndoFilter } from './hooks/filters';
import { SendTxAssetModel } from './models';
import { TXSymbols } from './txSymbols';

// tslint:disable-next-line
export type SendTxAsset<T = Buffer> = {
  data: T;
};

@injectable()
export class SendTransaction extends BaseTx<SendTxAsset, SendTxAssetModel> {
  @inject(Symbols.modules.accounts)
  private accountsModule: IAccountsModule;
  @inject(Symbols.logic.account)
  private accountLogic: IAccountLogic;

  @inject(Symbols.modules.system)
  private systemModule: ISystemModule;

  @inject(ModelSymbols.model)
  @named(Symbols.models.accounts)
  private AccountsModel: typeof IAccountsModel;

  @inject(ModelSymbols.model)
  @named(TXSymbols.models.sendTxAsset)
  private SendTxAssetModel: typeof SendTxAssetModel;

  public assetBytes(tx: IBaseTransaction<SendTxAsset>): Buffer {
    if (!tx.asset || !tx.asset.data) {
      return Buffer.alloc(0);
    }
    return tx.asset.data;
  }

  public calculateMinFee(
    tx: IBaseTransaction<SendTxAsset, bigint>,
    sender: IAccountsModel,
    height: number
  ): bigint {
    const fees = this.systemModule.getFees(height).fees;
    return (
      fees.send +
      BigInt(tx.asset && tx.asset.data ? tx.asset.data.length : 0) *
        fees.sendDataMultiplier
    );
  }

  public async verify(
    tx: IBaseTransaction<SendTxAsset, bigint>,
    sender: IAccountsModel
  ): Promise<void> {
    if (!tx.recipientId) {
      throw new Error('Missing recipient');
    }

    if (tx.amount <= 0) {
      throw new Error('Invalid transaction amount');
    }

    if (tx.asset && tx.asset.data && tx.asset.data.length > 128) {
      throw new Error('Cannot send more than 128bytes in data field');
    }
  }

  public async apply(
    tx: IBaseTransaction<SendTxAsset>,
    block: SignedBlockType,
    sender: IAccountsModel
  ): Promise<Array<DBOp<any>>> {
    return await this.hookSystem.apply_filters(
      SendTxApplyFilter.name,
      [
        ...this.accountLogic.mergeBalanceDiff(tx.recipientId, {
          balance: BigInt(tx.amount),
          u_balance: BigInt(tx.amount),
        }),
      ],
      tx,
      block,
      sender
    );
  }

  // tslint:disable-next-line max-line-length
  public async undo(
    tx: IBaseTransaction<SendTxAsset>,
    block: SignedBlockType,
    sender: IAccountsModel
  ): Promise<Array<DBOp<any>>> {
    return await this.hookSystem.apply_filters(
      SendTxUndoFilter.name,
      [
        ...this.accountLogic.mergeBalanceDiff(tx.recipientId, {
          balance: -BigInt(tx.amount),
          u_balance: -BigInt(tx.amount),
        }),
      ],
      tx,
      block,
      sender
    );
  }

  public objectNormalize(
    tx: IBaseTransaction<SendTxAsset<string | Buffer>, bigint>
  ): IBaseTransaction<SendTxAsset, bigint> {
    if (tx.asset && typeof tx.asset.data === 'string') {
      tx.asset.data = Buffer.from(tx.asset.data, 'utf8');
    }
    return tx as IBaseTransaction<SendTxAsset>;
  }

  public async attachAssets(
    txs: Array<IBaseTransaction<SendTxAsset>>
  ): Promise<void> {
    const r =
      (await this.SendTxAssetModel.findAll({
        raw: true,
        where: {
          transactionId: txs.map((t) => t.id),
        },
      })) || [];
    const byId: { [id: string]: IBaseTransaction<SendTxAsset> } = {};
    txs.forEach((t) => (byId[t.id] = t));

    for (const m of r) {
      byId[m.transactionId].asset = {
        data: m.data,
      };
    }
  }

  public dbSave(tx: IBaseTransaction<SendTxAsset>) {
    if (!tx.asset || !tx.asset.data) {
      return null;
    }
    return {
      model: this.SendTxAssetModel,
      type: 'create',
      values: {
        data: tx.asset && tx.asset.data ? tx.asset.data : null,
        transactionId: tx.id,
      },
    } as DBCreateOp<SendTxAssetModel>;
  }
}
