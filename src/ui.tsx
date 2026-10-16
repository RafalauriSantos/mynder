import {useEffect,useRef,useState,type ReactNode} from 'react';

/** Botão de ícone que abre um painel flutuante; fecha com Esc ou clique fora. */
export function Popover({label,icon,className='',children}:{label:string;icon:ReactNode;className?:string;children:(close:()=>void)=>ReactNode}){
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open)return;
    const down=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    document.addEventListener('pointerdown',down);
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('keydown',key)};
  },[open]);
  return <div className="popover" ref={root}>
    <button type="button" className={`icon-btn ${className}`.trim()} aria-label={label} title={label} aria-haspopup="true" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{icon}</button>
    {open&&<div className="popover-panel">{children(()=>setOpen(false))}</div>}
  </div>;
}
