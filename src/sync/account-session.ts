import {validate, type Document} from '../document.ts';
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
  private state:AccountLocalState;
  private generation=0;
  private activeSync:Promise<SyncResult>|null=null;

  private constructor(identity:SyncIdentity,api:SyncApiClient,state:AccountLocalState){
    this.identity=identity;
    this.api=api;
    this.state=state;
  }

  static async connect(token:string,fetcher:typeof fetch=fetch):Promise<AccountConnectResult>{
    if(typeof token!=='string'||!token.trim())throw new AccountSessionError('invalid');
    const api=new SyncApiClient(async()=>token,fetcher);
    const identity=validateSyncIdentity(await api.session());
    const loaded=await loadAccountState(identity);
    if(loaded.blocked)throw new AccountSessionError('blocked');
    const session=new AccountSyncSession(identity,api,loaded.state);
    try{return{session,syncResult:await session.sync()}}
    catch(syncError){return{session,syncError}}
  }

  get documents():Document[]{return this.state.docs.map(validate)}

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
};

type GoogleIdentityApi={
  accounts:{id:{initialize:(config:{client_id:string;callback:(response:{credential?:string})=>void;auto_select?:boolean})=>void;renderButton:(element:HTMLElement,options:{theme:string;size:string;shape:string;text:string;logo_alignment:string;width:number})=>void}};
};

declare global {interface Window {google?:GoogleIdentityApi}}

const GIS_SCRIPT_ID='mynder-google-identity-services';
let googleApiPromise:Promise<GoogleIdentityApi>|null=null;

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

export async function mountGoogleSignIn(element:HTMLElement,configuration:GoogleIdConfiguration):Promise<void>{
  if(!configuration.clientId.trim())throw new Error('O login Google ainda não foi configurado.');
  const api=await loadGoogleIdentityApi();
  api.accounts.id.initialize({
    client_id:configuration.clientId,
    auto_select:false,
    callback:response=>{
      if(typeof response.credential!=='string'||!response.credential){configuration.onError('O Google não retornou uma credencial válida.');return}
      configuration.callback(response.credential);
    },
  });
  api.accounts.id.renderButton(element,{theme:'outline',size:'large',shape:'rectangular',text:'continue_with',logo_alignment:'left',width:280});
}
