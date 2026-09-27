export type Point = { x: number; y: number };
export type Topic = { id: string; text: string; parentId?: string; position: Point; collapsed: boolean; color: string };
export type Link = { id: string; source: string; target: string };
export type Drawing = { id: string; kind: 'pen' | 'highlight' | 'rectangle' | 'ellipse' | 'arrow' | 'text'; points: Point[]; color: string; text?: string };
export type Document = { version: 2; id: string; title: string; topics: Topic[]; links: Link[]; drawings: Drawing[]; viewport: { x: number; y: number; zoom: number }; markdown: string; updatedAt: number };
export const colors = ['#6a70ce', '#258d85', '#c17e30', '#ae629b', '#4e8ab8'];
export const id = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function blank(title = 'Nova ideia'): Document {
 return {version:2,id:id(),title,topics:[{id:id(),text:title,position:{x:0,y:0},collapsed:false,color:colors[0]}],links:[],drawings:[],viewport:{x:100,y:180,zoom:1},markdown:'',updatedAt:Date.now()};
}
export function descendants(doc: Document, root: string): Set<string> {
 const result = new Set<string>([root]); let changed = true;
 while(changed){changed=false;for(const node of doc.topics)if(node.parentId&&result.has(node.parentId)&&!result.has(node.id)){result.add(node.id);changed=true}}
 return result;
}
export function visibleTopics(doc: Document): Topic[] {
 const hidden = new Set<string>();
 for(const node of doc.topics)if(node.collapsed)for(const child of descendants(doc,node.id))if(child!==node.id)hidden.add(child);
 return doc.topics.filter(node=>!hidden.has(node.id));
}
export function reparent(doc: Document, child: string, parent?: string): Document {
 if(!doc.topics.some(n=>n.id===child)|| (parent&&(!doc.topics.some(n=>n.id===parent)||descendants(doc,child).has(parent))))throw new Error('Essa mudança criaria uma hierarquia inválida.');
 return {...doc,topics:doc.topics.map(n=>n.id===child?{...n,parentId:parent}:n)};
}
export function removeBranch(doc: Document, root: string): Document {
 const removed=descendants(doc,root);
 return {...doc,topics:doc.topics.filter(n=>!removed.has(n.id)),links:doc.links.filter(e=>!removed.has(e.source)&&!removed.has(e.target))};
}
export function organize(doc: Document): Document {
 const positions=new Map<string,Point>();let cursor=0;
 const rowHeight=Math.max(100,...doc.topics.map(n=>Math.min(300,Math.max(65,n.text.split('\n').reduce((lines,line)=>lines+Math.max(1,Math.ceil(line.length/20)),0)*21+40))))+40;
 function visit(node:Topic,depth:number):number {
  const children=doc.topics.filter(n=>n.parentId===node.id);const ys=children.map(n=>visit(n,depth+1));
  const y=ys.length?(ys[0]+ys[ys.length-1])/2:cursor++*rowHeight;
  positions.set(node.id,{x:depth*310,y});return y;
 }
 doc.topics.filter(n=>!n.parentId).forEach(n=>{visit(n,0);cursor++});
 return {...doc,topics:doc.topics.map(n=>({...n,position:positions.get(n.id)??n.position}))};
}
export function importMarkdown(text:string):Document {
 const doc=blank();doc.topics=[];doc.markdown=text;
 const headings:{level:number;node:Topic}[]=[];let lists:{indent:number;node:Topic}[]=[];let branch=0;
 for(const line of text.split(/\r?\n/)){
  if(!line.trim())continue;
  const h=line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);const li=line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.+)$/);
  let parent:Topic|undefined;let label:string;
  if(h){while(headings.length&&headings[headings.length-1].level>=h[1].length)headings.pop();parent=headings.at(-1)?.node;label=h[2];lists=[]}
  else if(li){const indent=li[1].replace(/\t/g,'    ').length;while(lists.length&&lists[lists.length-1].indent>=indent)lists.pop();parent=lists.at(-1)?.node??headings.at(-1)?.node;label=li[2]}
  else{parent=headings.at(-1)?.node;label=line.trim();lists=[]}
  const node:Topic={id:id(),text:label,parentId:parent?.id,position:{x:0,y:0},collapsed:false,color:parent?.parentId?parent.color:colors[branch++%colors.length]};doc.topics.push(node);
  if(h)headings.push({level:h[1].length,node});if(li)lists.push({indent:li[1].replace(/\t/g,'    ').length,node});
 }
 if(!doc.topics.length)throw new Error('Escreva pelo menos uma ideia.');
 const roots=doc.topics.filter(n=>!n.parentId);
 if(roots.length>1){const root:Topic={id:id(),text:'Minhas ideias',position:{x:0,y:0},collapsed:false,color:colors[0]};roots.forEach(n=>n.parentId=root.id);doc.topics.unshift(root)}
 doc.title=doc.topics[0].text;return organize(doc);
}
export function validate(value:unknown):Document {
 const d=value as Document;const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);const point=(p:Point)=>p&&finite(p.x)&&finite(p.y);
 if(!d||d.version!==2||typeof d.id!=='string'||typeof d.title!=='string'||typeof d.markdown!=='string'||!Array.isArray(d.topics)||!Array.isArray(d.links)||!Array.isArray(d.drawings)||!d.viewport||!point(d.viewport)||!finite(d.viewport.zoom)||d.viewport.zoom<=0)throw new Error('Documento inválido ou versão não suportada.');
 const ids=new Set<string>();
 for(const n of d.topics){if(!n||typeof n.id!=='string'||ids.has(n.id)||typeof n.text!=='string'||typeof n.color!=='string'||typeof n.collapsed!=='boolean'||!point(n.position))throw new Error('Nó inválido.');ids.add(n.id)}
 for(const n of d.topics){const seen=new Set([n.id]);let p=n.parentId;while(p){if(!ids.has(p)||seen.has(p))throw new Error('Hierarquia inválida.');seen.add(p);p=d.topics.find(x=>x.id===p)?.parentId}}
 for(const e of d.links){if(!e||typeof e.id!=='string'||ids.has(e.id)||!ids.has(e.source)||!ids.has(e.target)||e.source===e.target)throw new Error('Conexão inválida.');ids.add(e.id)}
 for(const s of d.drawings){if(!s||typeof s.id!=='string'||ids.has(s.id)||!['pen','highlight','rectangle','ellipse','arrow','text'].includes(s.kind)||typeof s.color!=='string'||!Array.isArray(s.points)||!s.points.length||!s.points.every(point)||(s.text!==undefined&&typeof s.text!=='string'))throw new Error('Desenho inválido.');ids.add(s.id)}
 return d;
}
