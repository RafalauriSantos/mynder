import {SyncRepository} from '../../server/maps/repository.ts';
import {ApiRequestError, assertAllowedKeys, errorResponse, jsonResponse, readJsonObject} from '../../server/http/json.ts';
import {requireSyncIdentity, type SyncApiContext} from './types.ts';

export const onRequestGet: PagesFunction<SyncApiContext['env'], string, SyncApiContext['data']> = async (context) => {
  try {
    const maps = await new SyncRepository(context.env.DB).list(requireSyncIdentity(context.data));
    return jsonResponse(maps);
  } catch (error) {
    return errorResponse(error);
  }
};

export const onRequestPost: PagesFunction<SyncApiContext['env'], string, SyncApiContext['data']> = async (context) => {
  try {
    const body = await readJsonObject(context.request);
    assertAllowedKeys(body, ['document']);
    if (!body.document || typeof body.document !== 'object' || Array.isArray(body.document)) {
      throw new ApiRequestError('invalid');
    }
    const map = await new SyncRepository(context.env.DB).create(requireSyncIdentity(context.data), body.document as never);
    return jsonResponse(map, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
