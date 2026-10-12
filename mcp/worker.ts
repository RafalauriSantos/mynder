import {
  AuthorizationError,
  CimdFetchError,
  OAuthAuthorizationServer,
  OAuthResourceServer,
  authorizationErrorRedirect,
} from '@cloudflare/workers-oauth-provider';
import {createMcpHandler} from '@modelcontextprotocol/server';
import {AuthVerificationError,verifyIdentityToken} from '../server/auth/identity.ts';
import {SyncMapService} from '../server/maps/service.ts';
import {validateSyncIdentity,type SyncIdentity} from '../src/sync/contracts.ts';
import {createMynderMcpServer} from './tools.ts';

type OAuthUserProps={identity:SyncIdentity};

export type MynderMcpEnv={
  DB:D1Database;
  OAUTH_KV:KVNamespace;
  OAUTH_ISSUER?:string;
  MCP_RESOURCE?:string;
  AUTH_ISSUER?:string;
  AUTH_AUDIENCE?:string;
  AUTH_JWKS_URL?:string;
  OIDC_CLIENT_SECRET?:string;
};

type OidcMetadata={
  issuer:string;
  authorization_endpoint:string;
  token_endpoint:string;
  token_endpoint_auth_methods_supported?:string[];
};

function response(status:number,message:string):Response{
  return new Response(message,{status,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8','x-content-type-options':'nosniff'}});
}

function endpoints(env:MynderMcpEnv){
  if(!env.OAUTH_ISSUER||!env.MCP_RESOURCE)throw new Error('OAuth endpoints are not configured.');
  const issuer=new URL(env.OAUTH_ISSUER);
  const resource=new URL(env.MCP_RESOURCE);
  const loopback=(url:URL)=>url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]';
  const secure=(url:URL)=>url.protocol==='https:'||url.protocol==='http:'&&loopback(url);
  if(!secure(issuer)||issuer.username||issuer.password||issuer.search||issuer.hash||issuer.pathname!=='/'&&issuer.pathname!=='')throw new Error('Invalid OAuth issuer configuration.');
  if(!secure(resource)||resource.username||resource.password||resource.search||resource.hash||resource.pathname!=='/mcp'||resource.origin!==issuer.origin)throw new Error('Invalid MCP resource configuration.');
  return{issuer:issuer.origin,resource:resource.href};
}

function makeAuthorizationServer(env:MynderMcpEnv){
  const config=endpoints(env);
  return new OAuthAuthorizationServer<MynderMcpEnv>({
    issuer:config.issuer,
    resources:[config.resource],
    scopesSupported:['mynder:read','mynder:write','offline_access'],
    clientRegistrationEndpoint:'/oauth/register',
    clientIdMetadataDocumentEnabled:false,
  });
}

function escapeHtml(value:string):string{
  return value.replace(/[&<>"']/g,char=>'&#'+char.charCodeAt(0)+';');
}

function consentPage(details:Awaited<ReturnType<ReturnType<OAuthAuthorizationServer<MynderMcpEnv>['getOAuthApi']>['describeConsent']>>,handle:string):string{
  const name=escapeHtml(details.clientName);
  const publisher=details.clientDomain
    ?'Publicado por <strong>'+escapeHtml(details.clientDomain)+'</strong>.'
    :'O nome deste aplicativo não foi verificado.';
  const scopes=details.scope.map(scope=>'<label><input type="checkbox" name="scope" value="'+escapeHtml(scope)+'" checked> '+escapeHtml(scope)+'</label>').join('<br>');
  const localhostWarning=details.redirectIsLoopback
    ?'<p><strong>O acesso será enviado para um aplicativo neste computador. Continue apenas se você iniciou esta conexão.</strong></p>'
    :'';
  return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorizar '+name+' — Mynder</title><main><h1>Permitir acesso ao Mynder?</h1><p><strong>'+name+'</strong>. '+publisher+'</p><p>O código de acesso será enviado para <strong>'+escapeHtml(details.redirectHost)+'</strong>.</p>'+localhostWarning+'<form method="post" action="/authorize"><input type="hidden" name="handle" value="'+escapeHtml(handle)+'">'+scopes+'<p><button name="decision" value="approve">Permitir</button> <button name="decision" value="deny">Negar</button></p></form></main></html>';
}

function oauthHelpers(server:OAuthAuthorizationServer<MynderMcpEnv>,env:MynderMcpEnv){
  return server.getOAuthApi(env);
}

function handleAuthorizationError(error:unknown):Response{
  if(error instanceof AuthorizationError){
    if(error.redirectTo)return Response.redirect(error.redirectTo,302);
    return response(400,'Não foi possível validar a solicitação de autorização. Volte ao cliente MCP e tente novamente.');
  }
  if(error instanceof CimdFetchError)return response(400,'Não foi possível verificar os dados deste cliente MCP.');
  return response(503,'A autorização está temporariamente indisponível. Tente novamente mais tarde.');
}

function discoveryUrl(issuer:string):URL{
  const url=new URL(issuer);
  url.pathname=url.pathname.replace(/\/+$/,'')+'/.well-known/openid-configuration';
  url.search='';
  url.hash='';
  return url;
}

function httpsEndpoint(value:unknown):string{
  if(typeof value!=='string')throw new Error('Invalid OIDC endpoint.');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw new Error('Invalid OIDC endpoint.');
  return url.href;
}

async function readJsonResponse(response:Response):Promise<Record<string,unknown>>{
  if(!response.ok)throw new Error('OIDC endpoint unavailable.');
  const text=await response.text();
  if(new TextEncoder().encode(text).byteLength>65_536)throw new Error('OIDC response too large.');
  const value=JSON.parse(text) as unknown;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid OIDC response.');
  return value as Record<string,unknown>;
}

async function getOidcMetadata(env:MynderMcpEnv):Promise<OidcMetadata>{
  if(!env.AUTH_ISSUER||!env.AUTH_AUDIENCE||!env.AUTH_JWKS_URL||!env.OIDC_CLIENT_SECRET)throw new Error('OIDC login is not configured.');
  const issuerUrl=new URL(env.AUTH_ISSUER);
  if(issuerUrl.protocol!=='https:'||issuerUrl.username||issuerUrl.password||issuerUrl.search||issuerUrl.hash)throw new Error('Invalid OIDC issuer.');
  const discovery=await readJsonResponse(await fetch(discoveryUrl(issuerUrl.href),{headers:{accept:'application/json'},signal:AbortSignal.timeout(5_000)}));
  if(discovery.issuer!==env.AUTH_ISSUER)throw new Error('OIDC issuer mismatch.');
  return{
    issuer:env.AUTH_ISSUER,
    authorization_endpoint:httpsEndpoint(discovery.authorization_endpoint),
    token_endpoint:httpsEndpoint(discovery.token_endpoint),
    ...(Array.isArray(discovery.token_endpoint_auth_methods_supported)?{token_endpoint_auth_methods_supported:discovery.token_endpoint_auth_methods_supported.filter((v):v is string=>typeof v==='string')}:{})
  };
}

function randomBase64Url(length=32):string{
  const bytes=crypto.getRandomValues(new Uint8Array(length));
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function codeChallenge(verifier:string):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
  let binary='';
  for(const byte of new Uint8Array(digest))binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function stableUserId(identity:SyncIdentity):Promise<string>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity.issuer+'\u0000'+identity.subject));
  let binary='';
  for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function callbackUrl(issuer:string):string{return new URL('/callback',issuer).href;}

async function startUpstreamSignIn(request:Request,form:FormData,env:MynderMcpEnv,oauth:ReturnType<typeof oauthHelpers>,handle:string):Promise<Response>{
  const decision=form.get('decision');
  if(decision==='deny'){
    const denied=await oauth.denyConsent(request,typeof form.get('handle')==='string'?String(form.get('handle')):handle);
    denied.headers.set('cache-control','no-store');
    return new Response(null,{status:302,headers:denied.headers});
  }
  if(decision!=='approve')return response(400,'Escolha permitir ou negar o acesso.');

  const oidc=await getOidcMetadata(env);
  const acceptedScopes=form.getAll('scope').filter((value):value is string=>typeof value==='string');
  const approved=await oauth.approveConsent(request,handle,{scope:acceptedScopes});
  const verifier=randomBase64Url(48);
  const nonce=randomBase64Url();
  const upstream=await oauth.beginUpstream(approved.request,{data:{verifier,nonce},headers:approved.headers});
  const authorization=new URL(oidc.authorization_endpoint);
  authorization.searchParams.set('client_id',env.AUTH_AUDIENCE!);
  authorization.searchParams.set('response_type','code');
  authorization.searchParams.set('redirect_uri',callbackUrl(env.OAUTH_ISSUER!));
  authorization.searchParams.set('scope','openid email profile');
  authorization.searchParams.set('state',upstream.state);
  authorization.searchParams.set('nonce',nonce);
  authorization.searchParams.set('code_challenge',await codeChallenge(verifier));
  authorization.searchParams.set('code_challenge_method','S256');
  upstream.headers.set('location',authorization.href);
  upstream.headers.set('cache-control','no-store');
  return new Response(null,{status:302,headers:upstream.headers});
}

async function exchangeOidcCode(code:string,verifier:string,env:MynderMcpEnv,metadata:OidcMetadata):Promise<string>{
  const clientId=env.AUTH_AUDIENCE!;
  const secret=env.OIDC_CLIENT_SECRET!;
  const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:callbackUrl(env.OAUTH_ISSUER!),code_verifier:verifier});
  const authMethods=metadata.token_endpoint_auth_methods_supported;
  const headers=new Headers({'accept':'application/json','content-type':'application/x-www-form-urlencoded'});
  if(!authMethods||authMethods.includes('client_secret_basic')){
    headers.set('authorization','Basic '+btoa(clientId+':'+secret));
  }else if(authMethods.includes('client_secret_post')){
    body.set('client_id',clientId);
    body.set('client_secret',secret);
  }else throw new Error('The OIDC provider requires an unsupported token authentication method.');
  const tokens=await readJsonResponse(await fetch(metadata.token_endpoint,{method:'POST',headers,body,signal:AbortSignal.timeout(5_000)}));
  if(typeof tokens.id_token!=='string')throw new Error('OIDC response did not contain an ID token.');
  return tokens.id_token;
}

async function finishUpstreamSignIn(request:Request,env:MynderMcpEnv,oauth:ReturnType<typeof oauthHelpers>):Promise<Response>{
  try{
    const transaction=await oauth.finishUpstream<{verifier:string;nonce:string}>(request);
    const url=new URL(request.url);
    if(url.searchParams.has('error')){
      transaction.headers.set('location',authorizationErrorRedirect(transaction.request,'access_denied'));
      transaction.headers.set('cache-control','no-store');
      return new Response(null,{status:302,headers:transaction.headers});
    }
    const code=url.searchParams.get('code');
    if(!code||code.length>4_096||!transaction.data?.verifier||!transaction.data?.nonce)return response(400,'Resposta de login inválida. Reinicie a conexão MCP.');
    const metadata=await getOidcMetadata(env);
    const idToken=await exchangeOidcCode(code,transaction.data.verifier,env,metadata);
    const identity=await verifyIdentityToken(idToken,{issuer:env.AUTH_ISSUER,audience:env.AUTH_AUDIENCE,jwksUrl:env.AUTH_JWKS_URL,nonce:transaction.data.nonce,requireVerifiedEmail:true});
    const userId=await stableUserId(identity);
    const completed=await oauth.completeAuthorization({request:transaction.request,userId,metadata:{},scope:transaction.request.scope,props:{identity}});
    transaction.headers.set('location',completed.redirectTo);
    transaction.headers.set('cache-control','no-store');
    return new Response(null,{status:302,headers:transaction.headers});
  }catch(error){
    if(error instanceof AuthorizationError)return handleAuthorizationError(error);
    if(error instanceof AuthVerificationError&&error.code==='invalid_token')return response(401,'O provedor de login retornou uma sessão inválida.');
    return response(503,'Não foi possível concluir o login agora. Tente novamente mais tarde.');
  }
}

async function handleAuthorization(request:Request,env:MynderMcpEnv,server:OAuthAuthorizationServer<MynderMcpEnv>):Promise<Response>{
  const oauth=oauthHelpers(server,env);
  try{
    if(request.method==='GET'){
      const parsed=await oauth.parseAuthRequest(request);
      const description=await oauth.describeConsent(parsed);
      const consent=await oauth.beginConsent(parsed);
      consent.headers.set('content-type','text/html; charset=utf-8');
      consent.headers.set('cache-control','no-store');
      consent.headers.set('content-security-policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'");
      consent.headers.set('x-content-type-options','nosniff');
      return new Response(consentPage(description,consent.handle),{headers:consent.headers});
    }
    if(request.method==='POST'){
      const form=await request.formData();
      const handle=form.get('handle');
      if(typeof handle!=='string'||!handle)return response(400,'Solicitação de consentimento inválida. Reinicie a conexão MCP.');
      return startUpstreamSignIn(request,form,env,oauth,handle);
    }
    return new Response('Method not allowed',{status:405,headers:{allow:'GET, POST','cache-control':'no-store'}});
  }catch(error){return handleAuthorizationError(error)}
}

function makeResourceServer(env:MynderMcpEnv,authorizationServer:OAuthAuthorizationServer<MynderMcpEnv>){
  const config=endpoints(env);
  return new OAuthResourceServer<MynderMcpEnv,OAuthUserProps>({
    resourceMetadata:{resource:config.resource,authorization_servers:[config.issuer]},
    requiredScopes:['mynder:read'],
    validateToken:()=> (resource,token)=>authorizationServer.validateToken(resource,token,env),
    handler:{fetch:async(request,_env,context)=>{
      if(new URL(request.url).pathname!=='/mcp')return new Response('Not found',{status:404});
      let identity:SyncIdentity;
      try{identity=validateSyncIdentity(context.props?.identity)}
      catch{return response(401,'O token não contém uma identidade Mynder válida.');}
      const scopes=context.auth.scope;
      const service=new SyncMapService(env.DB);
      const handler=createMcpHandler(()=>createMynderMcpServer(service,identity,scopes),{legacy:'stateless'});
      return handler.fetch(request);
    }},
  });
}

export async function handleMcpRequest(request:Request,env:MynderMcpEnv,ctx:ExecutionContext):Promise<Response>{
  const pathname=new URL(request.url).pathname;
  try{
    const server=makeAuthorizationServer(env);
    if(pathname==='/authorize')return handleAuthorization(request,env,server);
    const oauth=oauthHelpers(server,env);
    if(pathname==='/callback')return finishUpstreamSignIn(request,env,oauth);
    const resourceServer=makeResourceServer(env,server);
    if(pathname==='/mcp'||pathname.startsWith('/.well-known/oauth-protected-resource'))return resourceServer.fetch(request,env,ctx);
    return server.fetch(request,env,ctx);
  }catch{
    return response(503,'O acesso MCP ainda não está configurado para este ambiente.');
  }
}

export default{
  fetch(request:Request,env:MynderMcpEnv,ctx:ExecutionContext){return handleMcpRequest(request,env,ctx)}
} satisfies ExportedHandler<MynderMcpEnv>;
