import {useEffect,useRef} from 'react';
import {mountGoogleSignIn} from './account-session.ts';

const clientId=(import.meta.env.VITE_GOOGLE_CLIENT_ID??'').trim();

export function GoogleSignInButton({onCredential,onError,onReady,disabled=false}:{onCredential:(credential:string)=>void;onError:(message:string)=>void;onReady?:()=>void;disabled?:boolean}){
  const element=useRef<HTMLDivElement>(null);
  const callbacks=useRef({onCredential,onError,onReady});
  callbacks.current={onCredential,onError,onReady};
  useEffect(()=>{
    const target=element.current;
    if(!target||!clientId||disabled)return;
    let active=true;
    void mountGoogleSignIn(target,{clientId,callback:credential=>{if(active)callbacks.current.onCredential(credential)},onError:message=>{if(active)callbacks.current.onError(message)},onReady:()=>{if(active)callbacks.current.onReady?.()}})
      .catch(error=>{if(active)callbacks.current.onError(error instanceof Error?error.message:'Não foi possível abrir o login Google.')});
    return()=>{active=false;target.replaceChildren()};
  },[disabled]);

  if(!clientId)return <span className="auth-note">Login Google ainda não configurado.</span>;
  return <div ref={element} className="google-sign-in" aria-label="Entrar com Google"/>;
}
