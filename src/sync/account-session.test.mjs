import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {blank} from '../document.ts';
import {AccountSyncSession,forgetGoogleSignIn,hasGoogleSignInHint,mountGoogleSignIn,rememberGoogleSignIn,requestSilentGoogleCredential} from './account-session.ts';

const identity={issuer:'https://accounts.google.com',subject:'google-user-123'};
let data;

beforeEach(()=>{
  data=new Map();
  globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
});

test('Google button reports when it is ready for a credential',async()=>{
  const previousWindow=globalThis.window;
  const events=[];
  globalThis.window={google:{accounts:{id:{
    initialize:()=>events.push('initialized'),
    renderButton:()=>events.push('rendered'),
  }}}};
  try{
    await mountGoogleSignIn({}, {clientId:'test-client',callback:()=>{},onError:()=>{},onReady:()=>events.push('ready')});
    assert.deepEqual(events,['initialized','rendered','ready']);
  }finally{
    globalThis.window=previousWindow;
  }
});

test('repeated Google button mounts initialize once and deliver the credential to the latest callback',async()=>{
  const previousWindow=globalThis.window;
  const events=[];
  let googleCallback;
  globalThis.window={google:{accounts:{id:{
    initialize:config=>{events.push('initialized');googleCallback=config.callback},
    renderButton:()=>events.push('rendered'),
  }}}};
  try{
    const first=mountGoogleSignIn({}, {clientId:'remount-client',callback:()=>events.push('old callback'),onError:()=>{}});
    const second=mountGoogleSignIn({}, {clientId:'remount-client',callback:()=>events.push('latest callback'),onError:()=>{}});
    await Promise.all([first,second]);
    googleCallback({credential:'redacted-test-token'});
    assert.deepEqual(events,['initialized','rendered','rendered','latest callback']);
  }finally{
    globalThis.window=previousWindow;
  }
});

function api(remote=[]){
  const stored=[...remote];
  const requests=[];
  const fetcher=async(url,init={})=>{
    requests.push({url,init});
    if(url==='/api/session')return Response.json({identity});
    if(url==='/api/maps'&&(!init.method||init.method==='GET'))return Response.json(stored);
    if(url==='/api/maps'&&init.method==='POST'){
      const document=JSON.parse(init.body).document;
      const result={document,revision:1,updatedAt:Date.now()};stored.push(result);
      return Response.json(result,{status:201});
    }
    throw new Error(`Unexpected API request ${init.method??'GET'} ${url}`);
  };
  return{fetcher,requests,stored};
}

test('connect verifies account identity, loads remote maps, and never persists the bearer token',async()=>{
  const remoteDocument=blank('Da nuvem');
  const server=api([{document:remoteDocument,revision:1,updatedAt:Date.now()}]);
  const token='short-lived-google-id-token';
  const connected=await AccountSyncSession.connect(token,server.fetcher);
  assert.deepEqual(connected.session.identity,identity);
  assert.deepEqual(connected.session.documents,[remoteDocument]);
  assert.equal(server.requests.every(request=>request.init.headers.authorization===`Bearer ${token}`),true);
  assert.equal([...data.values()].some(value=>value.includes(token)),false);
  assert.equal([...data.keys()].some(key=>key.includes(identity.subject)),false);
});

test('first login creates a starter map for an empty account',async()=>{
  const server=api();
  const {session,syncError}=await AccountSyncSession.connect('memory-token',server.fetcher);
  assert.equal(syncError,undefined);
  assert.equal(session.documents.length,1);
  assert.equal(session.documents[0].title,'Nova ideia');
  assert.equal(session.documents[0].topics.length,0);
  assert.deepEqual(server.stored.map(item=>item.document),session.documents);
});

test('confirmed anonymous import creates new account copies and preserves the anonymous JSON',async()=>{
  const anonymous=blank('Meu mapa local');
  const rawAnonymous=JSON.stringify([anonymous]);
  data.set('rascunho-v2',rawAnonymous);
  const server=api();
  const {session}=await AccountSyncSession.connect('memory-token',server.fetcher);
  const starter=session.documents[0];
  const imported=await session.importAnonymousDocuments([anonymous]);
  assert.equal(imported.copies.length,1);
  assert.notEqual(imported.copies[0].id,anonymous.id);
  assert.equal(imported.copies[0].title,'Meu mapa local (importado)');
  assert.deepEqual(session.documents,[starter,imported.copies[0]]);
  assert.equal(data.get('rascunho-v2'),rawAnonymous);
  assert.deepEqual(server.stored.map(item=>item.document),[starter,...imported.copies]);
  const creates=server.requests.filter(request=>request.init.method==='POST');
  assert.equal(creates.every(create=>!('ownerId' in JSON.parse(create.init.body))&&!('ownerId' in JSON.parse(create.init.body).document)),true);
});

test('refreshToken swaps the bearer used by later requests for the same account',async()=>{
  const server=api();
  const {session}=await AccountSyncSession.connect('first-token',server.fetcher);
  await session.refreshToken('second-token');
  server.requests.length=0;
  await session.sync();
  assert.equal(server.requests.length>0,true);
  assert.equal(server.requests.every(request=>request.init.headers.authorization==='Bearer second-token'),true);
});

test('refreshToken refuses a credential from a different Google account and keeps the old one',async()=>{
  const server=api();
  const fetcher=async(url,init={})=>url==='/api/session'&&init.headers.authorization==='Bearer other-account-token'
    ?Response.json({identity:{issuer:identity.issuer,subject:'someone-else'}})
    :server.fetcher(url,init);
  const {session}=await AccountSyncSession.connect('first-token',fetcher);
  await assert.rejects(session.refreshToken('other-account-token'),{code:'invalid'});
  server.requests.length=0;
  await session.sync();
  assert.equal(server.requests.every(request=>request.init.headers.authorization==='Bearer first-token'),true);
});

test('silent Google sign-in prompts without a click, initializes once and uses the latest callback',async()=>{
  const previousWindow=globalThis.window;
  const events=[];
  let googleCallback;
  globalThis.window={google:{accounts:{id:{
    initialize:config=>{events.push(`initialized auto_select=${config.auto_select}`);googleCallback=config.callback},
    renderButton:()=>events.push('rendered'),
    prompt:()=>events.push('prompted'),
  }}}};
  try{
    await requestSilentGoogleCredential({clientId:'silent-client',callback:()=>events.push('first'),onError:()=>{}});
    await requestSilentGoogleCredential({clientId:'silent-client',callback:()=>events.push('second'),onError:()=>{}});
    googleCallback({credential:'redacted-test-token'});
    assert.deepEqual(events,['initialized auto_select=true','prompted','prompted','second']);
  }finally{
    globalThis.window=previousWindow;
  }
});

test('the sign-in hint is a flag only, and signing out clears it and disables auto select',()=>{
  const previousWindow=globalThis.window;
  const events=[];
  globalThis.window={google:{accounts:{id:{disableAutoSelect:()=>events.push('disabled')}}}};
  try{
    assert.equal(hasGoogleSignInHint(),false);
    rememberGoogleSignIn();
    assert.equal(hasGoogleSignInHint(),true);
    assert.equal([...data.values()].every(value=>value==='1'),true);
    forgetGoogleSignIn();
    assert.equal(hasGoogleSignInHint(),false);
    assert.deepEqual(events,['disabled']);
  }finally{
    globalThis.window=previousWindow;
  }
});
