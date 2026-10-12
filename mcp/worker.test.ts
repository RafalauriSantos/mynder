import {applyD1Migrations} from 'cloudflare:test';
import {env} from 'cloudflare:workers';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {exportJWK,SignJWT} from 'jose';
import {beforeAll,describe,expect,it,vi} from 'vitest';
import {blank} from '../src/document.ts';
import {handleMcpRequest,type MynderMcpEnv} from './worker.ts';

const db=env.TEST_DB as unknown as D1Database;
const migrations=env.TEST_MIGRATIONS as Parameters<typeof applyD1Migrations>[1];
const issuer='https://identity.example.test';
const audience='mynder-mcp-oidc-client';
const jwksUrl='https://identity.example.test/.well-known/jwks.json';
const oauthIssuer='http://localhost:8787';
const resource=oauthIssuer+'/mcp';
const oidcDiscoveryUrl=issuer+'/.well-known/openid-configuration';
const oidcTokenUrl='https://identity.example.test/oauth/token';
const oidcAuthorizationUrl='https://identity.example.test/oauth/authorize';
const oauthCallbackUrl=oauthIssuer+'/callback';
const clientCallbackUrl='http://localhost:19876/oauth/callback';
const oauthKv=env.TEST_OAUTH_KV as unknown as KVNamespace;
const workerEnv:MynderMcpEnv={
  DB:db,
  OAUTH_KV:oauthKv,
  OAUTH_ISSUER:oauthIssuer,
  MCP_RESOURCE:resource,
  AUTH_ISSUER:issuer,
  AUTH_AUDIENCE:audience,
  AUTH_JWKS_URL:jwksUrl,
  OIDC_CLIENT_SECRET:'test-only-oidc-secret',
};
const context={waitUntil:()=>{},passThroughOnException:()=>{}} as unknown as ExecutionContext;
let privateKey:CryptoKey;
let publicJwk:Record<string,unknown>;
const oidcLogins=new Map<string,{nonce:string;challenge:string;subject:string}>();

beforeAll(async()=>{
  await applyD1Migrations(db,migrations);
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  privateKey=pair.privateKey;
  publicJwk={...await exportJWK(pair.publicKey),kid:'mcp-test-key',alg:'RS256',use:'sig'};
});

function setCookies(response:Response):string[]{
  const headers=response.headers as Headers&{getSetCookie?:()=>string[]};
  return headers.getSetCookie?.()??(headers.get('set-cookie')?[headers.get('set-cookie')!]:[]);
}

function cookiePair(header:string):string{return header.split(';',1)[0]}

function base64Url(bytes:Uint8Array):string{
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function sha256Base64Url(value:string):Promise<string>{
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
}

async function identityToken(subject:string,nonce:string){
  const now=Math.floor(Date.now()/1000);
  return new SignJWT({nonce})
    .setProtectedHeader({alg:'RS256',kid:'mcp-test-key'})
    .setIssuer(issuer).setAudience(audience).setSubject(subject).setIssuedAt(now).setExpirationTime(now+300)
    .sign(privateKey);
}

function installOidcMock(){
  vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=new URL(input instanceof Request?input.url:String(input));
    if(url.href===oidcDiscoveryUrl){
      return Response.json({issuer,authorization_endpoint:oidcAuthorizationUrl,token_endpoint:oidcTokenUrl,jwks_uri:jwksUrl,token_endpoint_auth_methods_supported:['client_secret_basic']});
    }
    if(url.href===jwksUrl)return Response.json({keys:[publicJwk]});
    if(url.href===oidcTokenUrl&&init?.method==='POST'){
      const params=new URLSearchParams(String(init.body));
      const login=oidcLogins.get(params.get('code')??'');
      const authorization=new Headers(init.headers).get('authorization');
      if(!login||!params.get('code_verifier')||await sha256Base64Url(params.get('code_verifier')!)!==login.challenge||params.get('redirect_uri')!==oauthCallbackUrl||authorization!=='Basic '+btoa(audience+':test-only-oidc-secret'))return Response.json({error:'invalid_grant'},{status:400});
      const token=await identityToken(login.subject,login.nonce);
      return Response.json({access_token:'unused-test-provider-token',token_type:'Bearer',expires_in:300,id_token:token});
    }
    return new Response('unexpected test fetch',{status:404});
  });
}

async function registerPublicClient():Promise<string>{
  const response=await handleMcpRequest(new Request(oauthIssuer+'/oauth/register',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({
      client_name:'Mynder integration test',
      redirect_uris:[clientCallbackUrl],
      grant_types:['authorization_code','refresh_token'],
      response_types:['code'],
      token_endpoint_auth_method:'none',
    }),
  }),workerEnv,context);
  expect(response.status).toBe(201);
  const body=await response.json() as {client_id?:string};
  expect(body.client_id).toBeTruthy();
  return body.client_id!;
}

async function authorizeClient(clientId:string,subject:string,scopes:string[]):Promise<string>{
  const verifier='test-verifier-'+subject+'-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const challenge=await sha256Base64Url(verifier);
  const state='client-state-'+subject;
  const authorization=new URL(oauthIssuer+'/authorize');
  authorization.searchParams.set('client_id',clientId);
  authorization.searchParams.set('response_type','code');
  authorization.searchParams.set('redirect_uri',clientCallbackUrl);
  authorization.searchParams.set('scope',scopes.join(' '));
  authorization.searchParams.set('state',state);
  authorization.searchParams.set('code_challenge',challenge);
  authorization.searchParams.set('code_challenge_method','S256');
  authorization.searchParams.set('resource',resource);

  const consent=await handleMcpRequest(new Request(authorization),workerEnv,context);
  expect(consent.status).toBe(200);
  expect(consent.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  const html=await consent.text();
  const handle=html.match(/name="handle" value="([^"]+)"/)?.[1];
  expect(handle).toBeTruthy();
  const consentCookie=setCookies(consent).find(value=>value.includes('__Host-oauth-consent-'));
  expect(consentCookie).toBeTruthy();

  const consentForm=new URLSearchParams({handle:handle!,decision:'approve'});
  scopes.forEach(scope=>consentForm.append('scope',scope));
  const upstreamResponse=await handleMcpRequest(new Request(oauthIssuer+'/authorize',{
    method:'POST',headers:{cookie:cookiePair(consentCookie!),'content-type':'application/x-www-form-urlencoded'},
    body:consentForm,
  }),workerEnv,context);
  if(upstreamResponse.status===400)throw new Error('Consent form was rejected before upstream sign-in.');
  expect(upstreamResponse.status).toBe(302);
  const upstreamUrl=new URL(upstreamResponse.headers.get('location')!);
  expect(upstreamUrl.origin).toBe('https://identity.example.test');
  expect(upstreamUrl.pathname).toBe('/oauth/authorize');
  const nonce=upstreamUrl.searchParams.get('nonce')!;
  const upstreamChallenge=upstreamUrl.searchParams.get('code_challenge')!;
  expect(upstreamUrl.searchParams.get('code_challenge_method')).toBe('S256');
  const externalCode='oidc-code-'+subject;
  oidcLogins.set(externalCode,{nonce,challenge:upstreamChallenge,subject});

  const upstreamCookie=setCookies(upstreamResponse).find(value=>value.includes('__Host-oauth-upstream-'));
  expect(upstreamCookie).toBeTruthy();
  const callback=await handleMcpRequest(new Request(oauthCallbackUrl+'?code='+encodeURIComponent(externalCode)+'&state='+encodeURIComponent(upstreamUrl.searchParams.get('state')!),{
    headers:{cookie:cookiePair(upstreamCookie!)},
  }),workerEnv,context);
  expect(callback.status).toBe(302);
  const clientRedirect=new URL(callback.headers.get('location')!);
  expect(clientRedirect.origin+clientRedirect.pathname).toBe(clientCallbackUrl);
  expect(clientRedirect.searchParams.get('state')).toBe(state);
  const authorizationCode=clientRedirect.searchParams.get('code');
  expect(authorizationCode).toBeTruthy();

  const tokenResponse=await handleMcpRequest(new Request(oauthIssuer+'/oauth/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'authorization_code',code:authorizationCode!,redirect_uri:clientCallbackUrl,client_id:clientId,code_verifier:verifier,resource}),
  }),workerEnv,context);
  expect(tokenResponse.status).toBe(200);
  const tokens=await tokenResponse.json() as {access_token?:string;token_type?:string;scope?:string};
  expect(tokens.access_token).toBeTruthy();
  expect(tokens.token_type?.toLowerCase()).toBe('bearer');
  expect(tokens.scope?.split(' ')).toEqual(expect.arrayContaining(scopes));
  return tokens.access_token!;
}

function makeClient(accessToken:string){
  const transport=new StreamableHTTPClientTransport(new URL(resource),{
    requestInit:{headers:{authorization:'Bearer '+accessToken}},
    fetch:async(input,init)=>handleMcpRequest(new Request(input,init),workerEnv,context),
  });
  return{client:new Client({name:'mynder-test-client',version:'1.0.0'}),transport};
}

function textOf(result:{content?:Array<{type:string;text?:string}>}){
  return result.content?.find(item=>item.type==='text')?.text??'';
}

describe('OAuth 2.1 Mynder MCP Worker',()=>{
  it('publishes discovery, fails closed, runs OIDC+PKCE authorization, and isolates tools by identity and scope',async()=>{
    installOidcMock();
    try{
      const missing=await handleMcpRequest(new Request(resource),workerEnv,context);
      expect(missing.status).toBe(401);
      expect(missing.headers.get('www-authenticate')).toContain('resource_metadata=');
      const upstreamToken=await identityToken('oauth-user-unexchanged','unrelated-nonce');
      const upstreamRejected=await handleMcpRequest(new Request(resource,{method:'POST',headers:{authorization:'Bearer '+upstreamToken}}),workerEnv,context);
      expect(upstreamRejected.status).toBe(401);
      const wrongRoute=await handleMcpRequest(new Request(oauthIssuer+'/not-found'),workerEnv,context);
      expect(wrongRoute.status).toBe(404);
      const authorizationMetadata=await handleMcpRequest(new Request(oauthIssuer+'/.well-known/oauth-authorization-server'),workerEnv,context);
      expect(authorizationMetadata.status).toBe(200);
      expect(await authorizationMetadata.json()).toMatchObject({issuer:oauthIssuer});
      const resourceMetadata=await handleMcpRequest(new Request(oauthIssuer+'/.well-known/oauth-protected-resource/mcp'),workerEnv,context);
      expect(resourceMetadata.status).toBe(200);
      expect(await resourceMetadata.json()).toMatchObject({resource,authorization_servers:[oauthIssuer]});

      const clientId=await registerPublicClient();
      const tokenA=await authorizeClient(clientId,'oauth-user-a',['mynder:read','mynder:write']);
      const tokenB=await authorizeClient(clientId,'oauth-user-b',['mynder:read']);
      const a=makeClient(tokenA);
      const b=makeClient(tokenB);
      try{
        await a.client.connect(a.transport);
        await b.client.connect(b.transport);
        const {tools:toolsA}=await a.client.listTools();
        expect(toolsA.map(tool=>tool.name)).toEqual([
          'mynder_list_maps','mynder_get_map','mynder_create_map','mynder_update_map',
          'mynder_delete_map','mynder_restore_map','mynder_export_backup',
        ]);
        const {tools:toolsB}=await b.client.listTools();
        expect(toolsB.map(tool=>tool.name)).toEqual(['mynder_list_maps','mynder_get_map','mynder_export_backup']);

        const document=blank('Mapa MCP privado');
        const created=await a.client.callTool({name:'mynder_create_map',arguments:{document}});
        expect(created.isError).not.toBe(true);
        const listing=await a.client.callTool({name:'mynder_list_maps',arguments:{response_format:'json'}});
        expect(textOf(listing)).toContain('Mapa MCP privado');
        const staleUpdate=await a.client.callTool({name:'mynder_update_map',arguments:{map_id:document.id,expected_revision:99,document}});
        expect(staleUpdate.isError).toBe(true);
        expect(textOf(staleUpdate)).toContain('mudou em outro dispositivo');
        try{await a.client.callTool({name:'mynder_delete_map',arguments:{map_id:document.id,expected_revision:1}})}catch{/* unsupported elicitation fails closed */}
        const afterUnconfirmedDelete=await a.client.callTool({name:'mynder_get_map',arguments:{map_id:document.id}});
        expect(afterUnconfirmedDelete.isError).not.toBe(true);
        const otherListing=await b.client.callTool({name:'mynder_list_maps',arguments:{response_format:'json'}});
        expect(textOf(otherListing)).not.toContain('Mapa MCP privado');
        const crossRead=await b.client.callTool({name:'mynder_get_map',arguments:{map_id:document.id}});
        expect(crossRead.isError).toBe(true);
        await expect(b.client.callTool({name:'mynder_create_map',arguments:{document:blank('Não autorizado')}})).rejects.toThrow('Tool mynder_create_map not found');
        const forged=await a.client.callTool({name:'mynder_create_map',arguments:{document:{...blank(),ownerId:'forged'}}});
        expect(forged.isError).toBe(true);
        const backup=await a.client.callTool({name:'mynder_export_backup',arguments:{}});
        expect(JSON.parse(textOf(backup))).toMatchObject({total_count:1,has_more:false});
      }finally{
        await Promise.allSettled([a.client.close(),b.client.close(),a.transport.close(),b.transport.close()]);
      }
    }finally{
      vi.unstubAllGlobals();
    }
  });
});
