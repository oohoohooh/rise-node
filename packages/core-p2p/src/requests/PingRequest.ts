import { injectable } from 'inversify';
import { BaseTransportMethod } from './BaseTransportMethod';
import { SingleTransportPayload } from './ITransportMethod';

// tslint:disable-next-line
@injectable()
// TODO values for the generic
export class PingRequest extends BaseTransportMethod<null, null, null> {
  public readonly method: 'GET' = 'GET';
  public readonly baseUrl = '/v2/peer/ping';

  get isRequestEncodable(): boolean {
    return false;
  }

  get isResponseEncodable(): boolean {
    return false;
  }

  protected async produceResponse(
    request: SingleTransportPayload<null, null>
  ): Promise<null> {
    return null;
  }
}
