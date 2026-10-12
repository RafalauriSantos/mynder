import {exportJWK, SignJWT} from 'jose';
import {beforeAll, describe, expect, it} from 'vitest';
import {AuthVerificationError, verifyIdentityToken} from './identity.ts';

const issuer='https://identity.example.test';
const audience='mynder-api-test';
const jwksUrl='https://identity.example.test/.well-known/jwks.json';
let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;

beforeAll(async()=>{
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  privateKey=pair.privateKey;
  publicJwk={...await exportJWK(pair.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
});

const config={issuer,audience,jwksUrl};
const fetchJwks: typeof fetch=async()=>Response.json({keys:[publicJwk]});

async function token(claims:{iss?:string;aud?:string;sub?:string;exp?:number;ownerId?:string}={}){
  const now=Math.floor(Date.now()/1000);
  const jwt=new SignJWT({ownerId:'untrusted',...(claims.ownerId===undefined?{}:{ownerId:claims.ownerId})})
    .setProtectedHeader({alg:'RS256',kid:'test-key'})
    .setIssuer(claims.iss??issuer)
    .setAudience(claims.aud??audience)
    .setIssuedAt(now)
    .setExpirationTime(claims.exp??now+300);
  if(claims.sub!==undefined)jwt.setSubject(claims.sub);
  else jwt.setSubject('verified-user');
  return jwt.sign(privateKey);
}

async function rejectsAs(tokenValue:string,code:string){
  await expect(verifyIdentityToken(tokenValue,config,fetchJwks)).rejects.toMatchObject({code});
}

describe('provider-neutral OIDC identity verification',()=>{
  it('returns only issuer and subject from a correctly signed token',async()=>{
    const verified=await verifyIdentityToken(await token({ownerId:'spoofed-owner'}),config,fetchJwks);
    expect(verified).toEqual({issuer,subject:'verified-user'});
    expect('ownerId' in verified).toBe(false);
  });

  it('rejects tokens with the wrong issuer or audience',async()=>{
    await rejectsAs(await token({iss:'https://attacker.example.test'}),'invalid_token');
    await rejectsAs(await token({aud:'another-app'}),'invalid_token');
  });

  it('rejects expired, unsigned, missing-subject and oversized tokens',async()=>{
    const expired=await token({exp:1});
    await rejectsAs(expired,'invalid_token');
    const valid=await token();
    const parts=valid.split('.');
    parts[2]=`${parts[2].startsWith('A')?'B':'A'}${parts[2].slice(1)}`;
    await rejectsAs(parts.join('.'),'invalid_token');
    const noSubject=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer).setAudience(audience).setExpirationTime('5m').sign(privateKey);
    await rejectsAs(noSubject,'invalid_token');
    await rejectsAs('x'.repeat(9_000),'invalid_token');
  });

  it('fails closed when provider configuration is missing or unsafe',async()=>{
    await expect(verifyIdentityToken('token',{issuer,audience,jwksUrl:''},fetchJwks)).rejects.toMatchObject({code:'configuration'});
    await expect(verifyIdentityToken('token',{issuer,audience,jwksUrl:'http://identity.example.test/keys'},fetchJwks)).rejects.toMatchObject({code:'configuration'});
  });

  it('distinguishes an unavailable trusted JWKS endpoint from an invalid token',async()=>{
    const unavailable: typeof fetch=async()=>new Response('unavailable',{status:503});
    await expect(verifyIdentityToken(await token(),config,unavailable)).rejects.toBeInstanceOf(AuthVerificationError);
    await expect(verifyIdentityToken(await token(),config,unavailable)).rejects.toMatchObject({code:'unavailable'});
  });
});
