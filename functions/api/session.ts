import {errorResponse, jsonResponse} from '../../server/http/json.ts';
import {requireSyncIdentity, type SyncApiContext} from './types.ts';

export const onRequestGet: PagesFunction<SyncApiContext['env'], string, SyncApiContext['data']> = (context) => {
  try {
    return jsonResponse({identity: requireSyncIdentity(context.data)});
  } catch (error) {
    return errorResponse(error);
  }
};
