import {validate, type Document} from '../document.ts';
import {validateSyncIdentity, type SyncIdentity} from './contracts.ts';

const ACCOUNT_PREFIX='mynder-account-v1:';
const BACKUP_SUFFIX=':backup';

export type SyncBaseline=Readonly<{revision:number;snapshot:string}>;
export type AccountLocalState={
  version:1;
  docs:Document[];
  baselines:Record<string,SyncBaseline>;
  dismissed:string[];
};

export class LocalAccountStoreError extends Error {
  readonly code:'invalid'|'blocked';
  constructor(code:'invalid'|'blocked'){
    super(code==='blocked'?'A cópia local da conta está corrompida; o original foi preservado.':'A cópia local da conta é inválida.');
    this.name='LocalAccountStoreError';
    this.code=code;
  }
}

export async function accountStorageKey(identityValue:SyncIdentity):Promise<string>{
  const identity=validateSyncIdentity(identityValue);
  const bytes=new TextEncoder().encode(JSON.stringify([identity.issuer,identity.subject]));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hex=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${ACCOUNT_PREFIX}${hex}`;
}

function emptyState():AccountLocalState{return{version:1,docs:[],baselines:{},dismissed:[]}}

function decodeState(raw:string):AccountLocalState{
  const value=JSON.parse(raw) as Partial<AccountLocalState>;
  if(!value||value.version!==1||!Array.isArray(value.docs)||!value.baselines||typeof value.baselines!=='object'||!Array.isArray(value.dismissed))throw new LocalAccountStoreError('invalid');
  const docs=value.docs.map(validate);
  if(new Set(docs.map(doc=>doc.id)).size!==docs.length)throw new LocalAccountStoreError('invalid');
  const baselines:Record<string,SyncBaseline>={};
  for(const [mapId,baseline]of Object.entries(value.baselines)){
    if(!baseline||!Number.isSafeInteger(baseline.revision)||baseline.revision<1||typeof baseline.snapshot!=='string')throw new LocalAccountStoreError('invalid');
    const snapshot=validate(JSON.parse(baseline.snapshot));
    if(snapshot.id!==mapId)throw new LocalAccountStoreError('invalid');
    baselines[mapId]={revision:baseline.revision,snapshot:JSON.stringify(snapshot)};
  }
  if(value.dismissed.some(id=>typeof id!=='string'||!id))throw new LocalAccountStoreError('invalid');
  return{version:1,docs,baselines,dismissed:[...new Set(value.dismissed)]};
}

export async function loadAccountState(identity:SyncIdentity):Promise<{state:AccountLocalState;blocked:boolean}>{
  const key=await accountStorageKey(identity);
  try{
    const raw=localStorage.getItem(key);
    if(!raw)return{state:emptyState(),blocked:false};
    try{return{state:decodeState(raw),blocked:false}}
    catch{
      const backup=localStorage.getItem(key+BACKUP_SUFFIX);
      if(backup)return{state:decodeState(backup),blocked:true};
      throw new LocalAccountStoreError('blocked');
    }
  }catch(error){
    if(error instanceof LocalAccountStoreError)throw error;
    throw new LocalAccountStoreError('blocked');
  }
}

export async function saveAccountState(identity:SyncIdentity,stateValue:AccountLocalState):Promise<void>{
  const key=await accountStorageKey(identity);
  const state=decodeState(JSON.stringify(stateValue));
  const raw=JSON.stringify(state);
  const previous=localStorage.getItem(key);
  if(previous){decodeState(previous);localStorage.setItem(key+BACKUP_SUFFIX,previous)}
  localStorage.setItem(key,raw);
}
