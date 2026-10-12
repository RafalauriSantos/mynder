import {SyncMapService} from '../../../server/maps/service.ts';
import {ApiRequestError, assertAllowedKeys, errorResponse, jsonResponse, readJsonObject} from '../../../server/http/json.ts';
import {requireSyncIdentity, type SyncApiContext} from '../types.ts';

function mapId(context: SyncApiContext): string {
  const value = context.params.id;
  if (typeof value !== 'string') throw new ApiRequestError('invalid');
  return value;
}

export const onRequestGet: PagesFunction<SyncApiContext['env'], string, SyncApiContext['data']> = async (context) => {
  try {
    const map = await new SyncMapService(context.env.DB).get(requireSyncIdentity(context.data), mapId(context));
    return map ? jsonResponse(map) : jsonResponse({error: {code: 'forbidden', message: 'Você não tem acesso a este mapa.', retryable: false}}, 404);
  } catch (error) {
    return errorResponse(error);
  }
};

export const onRequestPut: PagesFunction<SyncApiContext['env'], string, SyncApiContext['data']> = async (context) => {
  try {
    const body = await readJsonObject(context.request);
    assertAllowedKeys(body, ['expectedRevision', 'document']);
    if (typeof body.expectedRevision !== 'number' || !body.document || typeof body.document !== 'object' || Array.isArray(body.document)) {
      throw new ApiRequestError('invalid');
    }
    const map = await new SyncMapService(context.env.DB).update(requireSyncIdentity(context.data), mapId(context), body.expectedRevision, body.document);
    return jsonResponse(map);
  } catch (error) {
    return errorResponse(error);
  }
};

export const onRequestDelete: PagesFunction<SyncApiContext['env'], string, SyncApiContext['data']> = async (context) => {
  try {
    const body = await readJsonObject(context.request);
    assertAllowedKeys(body, ['expectedRevision']);
    if (typeof body.expectedRevision !== 'number') {
      throw new ApiRequestError('invalid');
    }
    const map = await new SyncMapService(context.env.DB).delete(requireSyncIdentity(context.data), mapId(context), body.expectedRevision);
    return jsonResponse(map);
  } catch (error) {
    return errorResponse(error);
  }
};
