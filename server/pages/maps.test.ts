import {applyD1Migrations} from 'cloudflare:test';
import {env} from 'cloudflare:workers';
import {SignJWT, exportJWK} from 'jose';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import {blank} from '../../src/document.ts';
import type {SyncIdentity} from '../../src/sync/contracts.ts';
import {onRequest as authenticateRequest} from '../../functions/_middleware.ts';
import {onRequestGet as getSession} from '../../functions/api/session.ts';
import {onRequestGet as listMaps, onRequestPost as createMap} from '../../functions/api/maps.ts';
import {onRequestDelete, onRequestGet as getMap, onRequestPut} from '../../functions/api/maps/[id].ts';

const db=env.TEST_DB as unknown as D1Database;
const migrations=env.TEST_MIGRATIONS as Parameters<typeof applyD1Migrations>[1];
const identityA:SyncIdentity={issuer:'https://api-test.example',subject:'api-user-a'};
const identityB:SyncIdentity={issuer:'https://api-test.example',subject:'api-user-b'};
const issuer='https://end-to-end.example.test';
const audience='mynder-api-test';
const jwksUrl='https://end-to-end.example.test/keys';
let privateKey:CryptoKey;
let publicJwk:Record<string,unknown>;

beforeAll(async()=>{
  await applyD1Migrations(db,migrations);
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  privateKey=pair.privateKey;
  publicJwk={...await exportJWK(pair.publicKey),kid:'end-to-end-test-key',alg:'RS256',use:'sig'};
});

function context(request:Request,identity:SyncIdentity,params:Record<string,string>={}){
  return {request,env:{DB:db},params,data:{syncIdentity:identity},next:async()=>new Response()} as never;
}

function jsonRequest(url:string,method:string,value:unknown,extraHeaders:Record<string,string>={}){
  return new Request(url,{method,headers:{'content-type':'application/json',...extraHeaders},body:JSON.stringify(value)});
}

describe('authenticated Pages map API handlers',()=>{
  it('exposes only the verified stable identity needed to partition the local account cache',async()=>{
    const response=await getSession(context(new Request('https://mynder.test/api/session'),identityA));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({identity:identityA});
  });

  it('rejects owner IDs in request envelopes without writing a map',async()=>{
    const document=blank('Não atribuir proprietário do cliente');
    const response=await createMap(context(jsonRequest('https://mynder.test/api/maps','POST',{document,ownerId:'forged'}),identityA));
    expect(response.status).toBe(400);
    expect((await response.json() as {error:{code:string}}).error.code).toBe('invalid');
    expect(await listMaps(context(new Request('https://mynder.test/api/maps'),identityA)).then(result=>result.json())).toEqual([]);
  });

  it('fails closed when a route receives no verified identity',async()=>{
    const missingIdentity={request:new Request('https://mynder.test/api/maps'),env:{DB:db},params:{},data:{},next:async()=>new Response()} as never;
    const response=await listMaps(missingIdentity);
    expect(response.status).toBe(401);
    expect((await response.json() as {error:{code:string}}).error.code).toBe('unauthenticated');
  });

  it('creates and lists maps only for the identity supplied by server middleware',async()=>{
    const documentA=blank('Privado A');
    const createdA=await createMap(context(jsonRequest('https://mynder.test/api/maps','POST',{document:documentA}),identityA));
    expect(createdA.status).toBe(201);
    const recordA=await createdA.json() as {document:{id:string};revision:number;ownerId?:string};
    expect(recordA.revision).toBe(1);
    expect('ownerId' in recordA).toBe(false);

    const documentB={...documentA,title:'Privado B'};
    const createdB=await createMap(context(jsonRequest('https://mynder.test/api/maps','POST',{document:documentB}),identityB));
    expect(createdB.status).toBe(201);
    expect((await listMaps(context(new Request('https://mynder.test/api/maps'),identityB)).then(response=>response.json()) as Array<{document:{title:string}}>).map(map=>map.document.title)).toEqual(['Privado B']);
    expect((await listMaps(context(new Request('https://mynder.test/api/maps'),identityA)).then(response=>response.json()) as Array<{document:{title:string}}>).map(map=>map.document.title)).toContain('Privado A');
  });

  it('connects signed-token middleware to the owner-scoped D1 route end to end',async()=>{
    const now=Math.floor(Date.now()/1000);
    const token=await new SignJWT({ownerId:'forged-owner'})
      .setProtectedHeader({alg:'RS256',kid:'end-to-end-test-key'})
      .setIssuer(issuer).setAudience(audience).setSubject('end-to-end-user').setIssuedAt(now).setExpirationTime(now+300).sign(privateKey);
    const request=new Request('https://mynder.test/api/maps',{headers:{authorization:`Bearer ${token}`}});
    const data:Record<string,unknown>={};
    const apiContext={request,env:{DB:db},params:{},data,next:async()=>new Response()} as never;
    const middlewareContext={
      request,
      env:{DB:db,AUTH_ISSUER:issuer,AUTH_AUDIENCE:audience,AUTH_JWKS_URL:jwksUrl},
      params:{},data,next:async()=>listMaps(apiContext),
    } as never;
    vi.stubGlobal('fetch',async()=>Response.json({keys:[publicJwk]}));
    try{
      const response=await authenticateRequest(middlewareContext);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
      expect((apiContext as unknown as {data:{syncIdentity:SyncIdentity}}).data.syncIdentity).toEqual({issuer,subject:'end-to-end-user'});
    }finally{
      vi.unstubAllGlobals();
    }
  });

  it('handles reads, conditional updates, stale revisions and tombstones',async()=>{
    const document=blank('Condicional');
    await createMap(context(jsonRequest('https://mynder.test/api/maps','POST',{document}),identityA));
    const path=`https://mynder.test/api/maps/${document.id}`;
    const read=await getMap(context(new Request(path),identityA,{id:document.id}));
    expect(read.status).toBe(200);

    const updatedDocument={...document,title:'Revisão dois'};
    const updated=await onRequestPut(context(jsonRequest(path,'PUT',{expectedRevision:1,document:updatedDocument}),identityA,{id:document.id}));
    expect(updated.status).toBe(200);
    expect((await updated.json() as {revision:number}).revision).toBe(2);
    const stale=await onRequestPut(context(jsonRequest(path,'PUT',{expectedRevision:1,document:{...updatedDocument,title:'Perderia dados'}}),identityA,{id:document.id}));
    expect(stale.status).toBe(409);

    const deleted=await onRequestDelete(context(jsonRequest(path,'DELETE',{expectedRevision:2}),identityA,{id:document.id}));
    expect(deleted.status).toBe(200);
    expect((await deleted.json() as {revision:number;deletedAt:number}).revision).toBe(3);
    expect((await getMap(context(new Request(path),identityB,{id:document.id}))).status).toBe(404);
  });

  it('rejects oversized request bodies before parsing JSON',async()=>{
    const request=new Request('https://mynder.test/api/maps',{method:'POST',headers:{'content-type':'application/json','content-length':'2000000'},body:'{}'});
    const response=await createMap(context(request,identityA));
    expect(response.status).toBe(413);
  });
});
