import {SyncMapService} from '../../../../server/maps/service.ts';
import {ApiRequestError, assertAllowedKeys, errorResponse, jsonResponse, readJsonObject} from '../../../../server/http/json.ts';
import {requireSyncIdentity, type SyncApiContext} from '../../types.ts';

export const onRequestPost:PagesFunction<SyncApiContext['env'],string,SyncApiContext['data']>=async context=>{
  try{
    const mapId=context.params.id;
    if(typeof mapId!=='string')throw new ApiRequestError('invalid');
    const body=await readJsonObject(context.request);
    assertAllowedKeys(body,['expectedRevision']);
    if(typeof body.expectedRevision!=='number')throw new ApiRequestError('invalid');
    const map=await new SyncMapService(context.env.DB).restore(requireSyncIdentity(context.data),mapId,body.expectedRevision);
    return jsonResponse(map);
  }catch(error){return errorResponse(error)}
};
