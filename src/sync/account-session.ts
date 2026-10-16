import {empty, validate, type Document} from '../document.ts';
import {createImportedCopies} from '../backup.ts';
import {validateSyncIdentity, type SyncIdentity} from './contracts.ts';
import {SyncApiClient} from './client.ts';
import {loadAccountState, saveAccountState, type AccountLocalState} from './local-store.ts';
import {syncAccount, type SyncConflict, type SyncResult} from './engine.ts';

export class AccountSessionError extends Error {
  readonly code:'invalid'|'blocked';
  constructor(code:'invalid'|'blocked'){
    super(code==='blocked'
      ?'A cópia local desta conta está danificada; a cópia de recuperação foi preservada.'
      :'Não foi possível validar a conta Google. Tente entrar novamente.');
    this.name='AccountSessionError';
    this.code=code;
  }
}

export type AccountConnectResult=Readonly<{
  session:AccountSyncSession;
  syncResult?:SyncResult;
  syncError?:unknown;
}>;

/** Keeps the Google ID token in memory and persists only this account's maps locally. */
export class AccountSyncSession {
  readonly identity:SyncIdentity;
  private readonly api:SyncApiClient;
  private readonly credential:{token:string};
  private readonly fetcher:typeof fetch;
  private state:AccountLocalState;
  private generation=0;
  private activeSync:Promise<SyncResult>|null=null;

  private constructor(identity:SyncIdentity,api:SyncApiClient,credential:{token:string},fetcher:typeof fetch,state:AccountLocalState){
    this.identity=identity;
    this.api=api;
    this.credential=credential;
    this.fetcher=fetcher;
    this.state=state;
  }

  static async connect(token:string,fetcher:typeof fetch=fetch):Promise<AccountConnectResult>{
    if(typeof token!=='string'||!token.trim())throw new AccountSessionError('invalid');
    const credential={token};
    const api=new SyncApiClient(async()=>credential.token,fetcher);
    const identity=validateSyncIdentity(await api.session());
    const loaded=await loadAccountState(identity);
    if(loaded.blocked)throw new AccountSessionError('blocked');
    const session=new AccountSyncSession(identity,api,credential,fetcher,loaded.state);
    let syncResult:SyncResult|undefined;
    let syncError:unknown;
    try{syncResult=await session.sync()}
    catch(error){syncError=error}
    if(session.documents.length===0){
      await session.replaceDocuments([empty()]);
      if(!syncError){
        try{syncResult=await session.sync()}
        catch(error){syncError=error}
      }
    }
    return syncError?{session,syncError}:{session,syncResult};
  }

  get documents():Document[]{return this.state.docs.map(validate)}

  /** Swaps in a fresh Google ID token, but only when it belongs to the account already connected. */
  async refreshToken(token:string):Promise<void>{
    if(typeof token!=='string'||!token.trim())throw new AccountSessionError('invalid');
    const candidate=new SyncApiClient(async()=>token,this.fetcher);
    const identity=validateSyncIdentity(await candidate.session());
    if(identity.issuer!==this.identity.issuer||identity.subject!==this.identity.subject)throw new AccountSessionError('invalid');
    this.credential.token=token;
  }

  async replaceDocuments(documents:Document[]):Promise<void>{
    const validated=documents.map(validate);
    if(new Set(validated.map(document=>document.id)).size!==validated.length)throw new AccountSessionError('invalid');
    this.generation++;
    this.state={...this.state,docs:validated};
    await saveAccountState(this.identity,this.state);
  }

  async importAnonymousDocuments(documents:Document[]):Promise<{copies:Document[];syncResult?:SyncResult;syncError?:unknown}>{
    const copies=createImportedCopies(documents.map(validate));
    await this.replaceDocuments([...this.state.docs,...copies]);
    try{return{copies,syncResult:await this.sync()}}
    catch(syncError){return{copies,syncError}}
  }

  sync():Promise<SyncResult>{
    if(this.activeSync)return this.activeSync;
    const operation=this.syncUntilStable();
    this.activeSync=operation.finally(()=>{this.activeSync=null});
    return this.activeSync;
  }

  private async syncUntilStable():Promise<SyncResult>{
    let latest:SyncResult={state:this.state,conflicts:[]};
    for(let pass=0;pass<3;pass++){
      const startGeneration=this.generation;
      latest=await syncAccount(this.api,this.state,async progress=>{
        this.state=this.generation===startGeneration
          ?progress
          :{...progress,docs:this.state.docs};
        await saveAccountState(this.identity,this.state);
      });
      if(this.generation===startGeneration){
        this.state=latest.state;
        await saveAccountState(this.identity,this.state);
        return latest;
      }
      this.state={...latest.state,docs:this.state.docs};
      await saveAccountState(this.identity,this.state);
    }
    return latest;
  }
}

export function conflictsMessage(conflicts:SyncConflict[]):string{
  if(!conflicts.length)return '';
  return `${conflicts.length} mapa(s) têm alterações em conflito. As cópias locais foram preservadas; revise antes de continuar.`;
}

export type GoogleIdConfiguration={
  clientId:string;
  callback:(credential:string)=>void;
  onError:(message:string)=>void;
  onReady?:()=>void;
  buttonShape?:'pill'|'rectangular';
  buttonWidth?:number;
};

type GoogleIdentityApi={
  accounts:{id:{initialize:(config:{client_id:string;callback:(response:{credential?:string})=>void;auto_select?:boolean})=>void;renderButton:(element:HTMLElement,options:{theme:string;size:string;shape:string;text:string;logo_alignment:string;width:number})=>void;prompt?:()=>void;disableAutoSelect?:()=>void}};
};

declare global {interface Window {google?:GoogleIdentityApi}}

const GIS_SCRIPT_ID='mynder-google-identity-services';
let googleApiPromise:Promise<GoogleIdentityApi>|null=null;
let initializedGoogleClientId:string|null=null;
let currentGoogleConfiguration:GoogleIdConfiguration|null=null;

function loadGoogleIdentityApi():Promise<GoogleIdentityApi>{
  if(window.google)return Promise.resolve(window.google);
  if(googleApiPromise)return googleApiPromise;
  googleApiPromise=new Promise((resolve,reject)=>{
    let script=document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement|null;
    if(!script){
      script=document.createElement('script');
      script.id=GIS_SCRIPT_ID;
      script.src='https://accounts.google.com/gsi/client';
      script.async=true;
      script.defer=true;
      document.head.append(script);
    }
    const fail=()=>{googleApiPromise=null;reject(new Error('Não foi possível carregar o login Google. Verifique a conexão e tente novamente.'))};
    script.addEventListener('load',()=>window.google?resolve(window.google):fail(),{once:true});
    script.addEventListener('error',fail,{once:true});
    if(window.google)resolve(window.google);
  });
  return googleApiPromise;
}

function initializeGoogleOnce(api:GoogleIdentityApi,clientId:string):void{
  if(initializedGoogleClientId===clientId)return;
  api.accounts.id.initialize({
    client_id:clientId,
    auto_select:true,
    callback:response=>{
      const current=currentGoogleConfiguration;
      if(!current)return;
      if(typeof response.credential!=='string'||!response.credential){current.onError('O Google não retornou uma credencial válida.');return}
      current.callback(response.credential);
    },
  });
  initializedGoogleClientId=clientId;
}

const GOOGLE_HINT_KEY='mynder-google-hint';
/** Only a flag that this browser signed in before. The token itself is never stored. */
export function rememberGoogleSignIn():void{try{localStorage.setItem(GOOGLE_HINT_KEY,'1')}catch{/* storage unavailable */}}
export function hasGoogleSignInHint():boolean{try{return localStorage.getItem(GOOGLE_HINT_KEY)==='1'}catch{return false}}
export function forgetGoogleSignIn():void{
  try{localStorage.removeItem(GOOGLE_HINT_KEY)}catch{/* storage unavailable */}
  try{window.google?.accounts.id.disableAutoSelect?.()}catch{/* Google script not loaded */}
}

/** Asks Google for a fresh credential without a click; works when the person is signed in to Google and approved Mynder before. */
export async function requestSilentGoogleCredential(configuration:GoogleIdConfiguration):Promise<void>{
  if(!configuration.clientId.trim())throw new Error('O login Google ainda não foi configurado.');
  const api=await loadGoogleIdentityApi();
  currentGoogleConfiguration=configuration;
  initializeGoogleOnce(api,configuration.clientId);
  api.accounts.id.prompt?.();
}

export async function mountGoogleSignIn(element:HTMLElement,configuration:GoogleIdConfiguration):Promise<void>{
  if(!configuration.clientId.trim())throw new Error('O login Google ainda não foi configurado.');
  const api=await loadGoogleIdentityApi();
  currentGoogleConfiguration=configuration;
  initializeGoogleOnce(api,configuration.clientId);
  api.accounts.id.renderButton(element,{theme:'outline',size:'large',shape:configuration.buttonShape??'rectangular',text:'continue_with',logo_alignment:'left',width:configuration.buttonWidth??280});
  configuration.onReady?.();
}
