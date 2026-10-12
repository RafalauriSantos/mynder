import {validate} from '../document.ts';
import {createSyncPayload, makeSyncError, validateSyncIdentity, validateSyncRevision, type SyncErrorCode, type SyncIdentity, type SyncMap} from './contracts.ts';

export type AccessTokenProvider=()=>Promise<string|null>;

export class SyncApiError extends Error{
  readonly code:SyncErrorCode;
  readonly status:number;
  constructor(code:SyncErrorCode,status:number){
    super(makeSyncError(code).message);
    this.name='SyncApiError';
    this.code=code;
    this.status=status;
  }
}

function errorCode(value:unknown):SyncErrorCode{
  if(value&&typeof value==='object'&&'error'in value){
    const error=(value as {error?:unknown}).error;
    if(error&&typeof error==='object'&&'code'in error){
      const code=(error as {code:unknown}).code;
      if(['unauthenticated','forbidden','conflict','too_large','quota','unavailable','invalid'].includes(String(code)))return code as SyncErrorCode;
    }
  }
  return 'unavailable';
}

function parseMap(value:unknown):SyncMap{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new SyncApiError('invalid',502);
  const input=value as Record<string,unknown>;
  const document=validate(input.document);
  validateSyncRevision({mapId:document.id,revision:input.revision});
  if(!Number.isSafeInteger(input.updatedAt)||typeof input.updatedAt!=='number')throw new SyncApiError('invalid',502);
  if(input.deletedAt!==undefined&&(!Number.isSafeInteger(input.deletedAt)||typeof input.deletedAt!=='number'))throw new SyncApiError('invalid',502);
  return{document,revision:input.revision as number,updatedAt:input.updatedAt as number,...(input.deletedAt===undefined?{}:{deletedAt:input.deletedAt as number})};
}

export class SyncApiClient{
  private readonly tokenProvider:AccessTokenProvider;
  private readonly fetcher:typeof fetch;
  private readonly baseUrl:string;
  constructor(
    tokenProvider:AccessTokenProvider,
    fetcher:typeof fetch=fetch,
    baseUrl='',
  ){
    this.tokenProvider=tokenProvider;
    this.fetcher=fetcher;
    this.baseUrl=baseUrl;
  }

  async session():Promise<SyncIdentity>{
    const value=await this.request('/api/session');
    if(!value||typeof value!=='object'||!('identity'in value))throw new SyncApiError('invalid',502);
    return validateSyncIdentity((value as {identity:unknown}).identity);
  }

  async list():Promise<SyncMap[]>{
    const value=await this.request('/api/maps');
    if(!Array.isArray(value))throw new SyncApiError('invalid',502);
    return value.map(parseMap);
  }

  async create(document:unknown):Promise<SyncMap>{
    const payload=createSyncPayload(document);
    return parseMap(await this.request('/api/maps',{method:'POST',body:JSON.stringify({document:payload.document})}));
  }

  async update(mapId:string,expectedRevision:number,document:unknown):Promise<SyncMap>{
    const payload=createSyncPayload(document);
    validateSyncRevision({mapId,revision:expectedRevision});
    if(payload.document.id!==mapId)throw new SyncApiError('invalid',400);
    return parseMap(await this.request(`/api/maps/${encodeURIComponent(mapId)}`,{method:'PUT',body:JSON.stringify({expectedRevision,document:payload.document})}));
  }

  async delete(mapId:string,expectedRevision:number):Promise<SyncMap>{
    validateSyncRevision({mapId,revision:expectedRevision});
    return parseMap(await this.request(`/api/maps/${encodeURIComponent(mapId)}`,{method:'DELETE',body:JSON.stringify({expectedRevision})}));
  }

  private async request(path:string,init:RequestInit={}):Promise<unknown>{
    let token:string|null;
    try{token=await this.tokenProvider()}
    catch{throw new SyncApiError('unavailable',0)}
    if(!token)throw new SyncApiError('unauthenticated',401);
    let response:Response;
    try{
      response=await this.fetcher(`${this.baseUrl}${path}`,{
        ...init,
        headers:{...(init.body?{'content-type':'application/json'}:{}),...init.headers,authorization:`Bearer ${token}`},
        cache:'no-store',
      });
    }catch{throw new SyncApiError('unavailable',0)}
    let value:unknown;
    try{value=await response.json()}
    catch{throw new SyncApiError('unavailable',response.status)}
    if(!response.ok)throw new SyncApiError(errorCode(value),response.status);
    return value;
  }
}
