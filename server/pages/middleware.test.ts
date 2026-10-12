import {SignJWT, exportJWK} from 'jose';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import {onRequest} from '../../functions/_middleware.ts';

const issuer='https://middleware.example.test';
const audience='mynder-api-test';
const jwksUrl='https://middleware.example.test/keys';
let privateKey:CryptoKey;
let publicJwk:Record<string,unknown>;

beforeAll(async()=>{
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  privateKey=pair.privateKey;
  publicJwk={...await exportJWK(pair.publicKey),kid:'middleware-test-key',alg:'RS256',use:'sig'};
});

async function signedToken(){
  const now=Math.floor(Date.now()/1000);
  return new SignJWT({ownerId:'untrusted-owner',email_verified:true}).setProtectedHeader({alg:'RS256',kid:'middleware-test-key'}).setIssuer(issuer).setAudience(audience).setSubject('verified-subject').setIssuedAt(now).setExpirationTime(now+300).sign(privateKey);
}

describe('Pages auth middleware',()=>{
  it('leaves static app routes public while allowing the Functions asset fallback',async()=>{
    let continued=false;
    const context={request:new Request('https://mynder.test/'),env:{},params:{},data:{},next:async()=>{continued=true;return new Response('static app')}} as never;
    const response=await onRequest(context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('static app');
    expect(continued).toBe(true);
  });

  it('denies API requests without a bearer token before reaching route handlers',async()=>{
    let continued=false;
    const context={request:new Request('https://mynder.test/api/maps'),env:{},params:{},data:{},next:async()=>{continued=true;return new Response('should not run')}} as never;
    const response=await onRequest(context);
    expect(response.status).toBe(401);
    expect(continued).toBe(false);
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
  });

  it('derives identity from a verified token and overwrites any preloaded client identity',async()=>{
    const token=await signedToken();
    vi.stubGlobal('fetch',async()=>Response.json({keys:[publicJwk]}));
    const context={
      request:new Request('https://mynder.test/api/maps',{headers:{authorization:`Bearer ${token}`}}),
      env:{AUTH_ISSUER:issuer,AUTH_AUDIENCE:audience,AUTH_JWKS_URL:jwksUrl},
      params:{},data:{syncIdentity:{issuer:'https://evil.example',subject:'attacker'}},
      next:async()=>new Response(JSON.stringify(context.data.syncIdentity)),
    } as never;
    const response=await onRequest(context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({issuer,subject:'verified-subject'});
    vi.unstubAllGlobals();
  });

  it('returns a recoverable unavailable response when authentication is not configured',async()=>{
    const context={request:new Request('https://mynder.test/api/maps',{headers:{authorization:'Bearer token'}}),env:{},params:{},data:{},next:async()=>new Response()} as never;
    const response=await onRequest(context);
    expect(response.status).toBe(503);
    expect((await response.json() as {error:{code:string}}).error.code).toBe('unavailable');
  });
});
