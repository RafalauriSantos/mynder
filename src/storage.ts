import { blank, id, importMarkdown, validate, type Document } from './document.ts';
const KEY='rascunho-v2';const BACKUP='rascunho-v2-backup';
export function decode(raw:string):Document[]{const data=JSON.parse(raw);if(!Array.isArray(data))throw new Error('Lista de documentos inválida.');const docs=data.map(validate);if(new Set(docs.map(d=>d.id)).size!==docs.length)throw new Error('Documentos duplicados.');return docs}
export function load():{docs:Document[];message:string;blocked:boolean}{
 try{
  const raw=localStorage.getItem(KEY);if(raw){try{return{docs:decode(raw),message:'',blocked:false}}catch{const backup=localStorage.getItem(BACKUP);if(backup)return{docs:decode(backup),message:'Cópia anterior recuperada. Exporte um backup antes de continuar.',blocked:true};throw new Error('Os dados salvos não puderam ser lidos. O original foi preservado.')}}
  const old=localStorage.getItem('rascunho-documents-v1');if(!old)return{docs:[blank()],message:'',blocked:false};
  const legacy=JSON.parse(old);if(!Array.isArray(legacy))throw new Error('Dados antigos inválidos.');
  const docs=legacy.map((item:any)=>{if(typeof item.markdown!=='string')throw new Error('Documento antigo inválido.');if(!Array.isArray(item.nodes)||!item.nodes.length)return importMarkdown(item.markdown);const d=blank(typeof item.title==='string'?item.title:'Ideia importada');d.markdown=item.markdown;d.topics=item.nodes.map((n:any)=>({id:n.id,text:n.text,position:{x:n.x,y:n.y},collapsed:false,color:typeof n.color==='string'?n.color:'#6a70ce'}));d.links=(item.edges??[]).map((e:any)=>({id:e.id??id(),source:e.from,target:e.to}));return validate(d)});
  return{docs,message:'Documentos antigos copiados. Conexões do canvas preservadas como ligações livres; o original permanece guardado.',blocked:false};
 }catch(e){return{docs:[],message:e instanceof Error?e.message:'Não foi possível abrir os dados.',blocked:true}}
}
export function save(docs:Document[]){docs.forEach(validate);const raw=JSON.stringify(docs);const previous=localStorage.getItem(KEY);if(previous){decode(previous);localStorage.setItem(BACKUP,previous)}localStorage.setItem(KEY,raw)}
