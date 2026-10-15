import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {SyncRepositoryError} from '../server/maps/repository.ts';
import type {SyncMap,SyncIdentity} from '../src/sync/contracts.ts';
import type {SyncMapService} from '../server/maps/service.ts';
import {blank,importMarkdown,regenerateMarkdown,type Document} from '../src/document.ts';
import {
  addBranch,addNode,deleteNode,duplicateDocument,linkNodes,moveNode,organizeDocument,outline,
  renameDocument,renameNode,setCollapsed,setColor,unlinkNodes,
} from '../src/edit.ts';

type Guard=(action:()=>Promise<ReturnType<typeof outlineResult>|{isError:true;content:{type:'text';text:string}[]}>)=>Promise<unknown>;

const mapId=z.string().min(1).max(255).describe('ID do mapa (veja mynder_list_maps).');
const nodeId=z.string().min(1).max(255).describe('ID do nó: o valor entre colchetes em mynder_get_outline.');
const nodeText=z.string().min(1).max(2000);
const markdownText=z.string().min(1).max(100_000);
const rwAnnotations={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false};

function outlineResult(document:Document,revision:number,prefix=''){
  return{content:[{type:'text' as const,text:(prefix?prefix+'\n\n':'')+outline(document)+'\n\n(revisão '+revision+')'}]};
}

/** Lê, edita e grava com a revisão esperada; relê e repete se outra gravação passar na frente. */
async function mutate(service:SyncMapService,identity:SyncIdentity,id:string,edit:(document:Document)=>Document):Promise<SyncMap>{
  for(let attempt=0;attempt<3;attempt++){
    const current=await service.get(identity,id);
    if(!current||current.deletedAt!==undefined)throw new SyncRepositoryError('not_found');
    try{return await service.update(identity,id,current.revision,{...edit(current.document),id})}
    catch(error){if(!(error instanceof SyncRepositoryError&&error.code==='conflict'))throw error}
  }
  throw new SyncRepositoryError('conflict');
}

/** Ferramentas de edição por nó: a IA lê a árvore com IDs e altera partes do mapa sem reenviar o documento inteiro. */
export function registerNodeTools(server:McpServer,service:SyncMapService,identity:SyncIdentity,canWrite:boolean,guarded:Guard):void{
  server.registerTool('mynder_get_outline',{
    title:'Outline of a Mynder map',
    description:'Show a map as a compact indented tree with the ID of every node and free link. Call this before editing nodes: the IDs are required by the node tools.',
    inputSchema:{map_id:mapId},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },({map_id})=>guarded(async()=>{
    const map=await service.get(identity,map_id);
    if(!map||map.deletedAt!==undefined)throw new SyncRepositoryError('not_found');
    return outlineResult(map.document,map.revision);
  }) as never);

  server.registerTool('mynder_get_markdown',{
    title:'Markdown of a Mynder map',
    description:'Export a map as Markdown (headings and lists).',
    inputSchema:{map_id:mapId},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },({map_id})=>guarded(async()=>{
    const map=await service.get(identity,map_id);
    if(!map||map.deletedAt!==undefined)throw new SyncRepositoryError('not_found');
    return{content:[{type:'text' as const,text:map.document.markdown}]};
  }) as never);

  if(!canWrite)return;

  const edit=(name:string,title:string,description:string,shape:z.ZodRawShape,apply:(document:Document,args:any)=>Document,note?:string)=>
    server.registerTool(name,{title,description,inputSchema:{map_id:mapId,...shape},annotations:rwAnnotations},((args:{map_id:string})=>guarded(async()=>{
      const map=await mutate(service,identity,args.map_id,document=>apply(document,args));
      return outlineResult(map.document,map.revision,note);
    })) as never);

  server.registerTool('mynder_create_map_from_markdown',{
    title:'Create a Mynder map from Markdown',
    description:'Create a map whose hierarchy comes from Markdown headings (#) and lists (-). Without markdown, creates a map with a single central node named by title.',
    inputSchema:{title:z.string().min(1).max(200).optional(),markdown:markdownText.optional()},
    annotations:{...rwAnnotations,idempotentHint:false},
  },(({title,markdown}:{title?:string;markdown?:string})=>guarded(async()=>{
    const base=markdown?importMarkdown(markdown):blank(title);
    const map=await service.create(identity,title&&markdown?renameDocument(base,title):base);
    return outlineResult(map.document,map.revision,'Mapa criado.');
  })) as never);

  edit('mynder_set_markdown','Rewrite structure from Markdown','Rewrite the whole structure from Markdown, preserving nodes with the same path and text (IDs, positions and links). The fastest way to reorganize many nodes.',{markdown:markdownText},(document,{markdown})=>regenerateMarkdown(document,markdown));
  edit('mynder_add_node','Add a node','Add one node under parent_id, or as a new root when parent_id is omitted. The new ID appears in the returned tree.',{text:nodeText,parent_id:nodeId.optional()},(document,{text,parent_id})=>addNode(document,text,parent_id).doc);
  edit('mynder_add_branch','Add a branch from Markdown','Add many nodes at once from a Markdown subtree, under parent_id or as new roots. Re-lays out the map.',{markdown:markdownText,parent_id:nodeId.optional()},(document,{markdown,parent_id})=>addBranch(document,markdown,parent_id).doc);
  edit('mynder_rename_node','Rename a node','Change the text of a node.',{node_id:nodeId,text:nodeText},(document,{node_id,text})=>renameNode(document,node_id,text));
  edit('mynder_move_node','Move a node','Change the parent of a node together with its children. Omit new_parent_id to make it a root. Cycles are rejected.',{node_id:nodeId,new_parent_id:nodeId.optional()},(document,{node_id,new_parent_id})=>moveNode(document,node_id,new_parent_id));
  edit('mynder_delete_node','Delete a node and its branch','Delete a node, all its descendants and the free links attached to them. The last remaining tree cannot be deleted.',{node_id:nodeId},(document,{node_id})=>deleteNode(document,node_id));
  edit('mynder_set_collapsed','Collapse or expand a branch','Collapse or expand a branch.',{node_id:nodeId,collapsed:z.boolean()},(document,{node_id,collapsed})=>setCollapsed(document,node_id,collapsed));
  edit('mynder_set_color','Set a node color','Set the color of a node as #RRGGBB.',{node_id:nodeId,color:z.string().regex(/^#[0-9a-fA-F]{6}$/)},(document,{node_id,color})=>setColor(document,node_id,color));
  edit('mynder_link_nodes','Link two nodes','Create a free link between two nodes, independent of the hierarchy.',{source_id:nodeId,target_id:nodeId},(document,{source_id,target_id})=>linkNodes(document,source_id,target_id).doc);
  edit('mynder_unlink_nodes','Remove a free link','Remove a free link by the ID shown in mynder_get_outline.',{link_id:z.string().min(1).max(255)},(document,{link_id})=>unlinkNodes(document,link_id));
  edit('mynder_rename_map','Rename a map','Change the title of a map.',{title:z.string().min(1).max(200)},(document,{title})=>renameDocument(document,title));
  edit('mynder_organize_map','Re-layout a map','Recompute the position of every node into a clean layout. Overwrites manual positions.',{},document=>organizeDocument(document));

  server.registerTool('mynder_duplicate_map',{
    title:'Duplicate a map',
    description:'Copy a map into a new map with a new ID.',
    inputSchema:{map_id:mapId,title:z.string().min(1).max(200).optional()},
    annotations:rwAnnotations,
  },(({map_id,title}:{map_id:string;title?:string})=>guarded(async()=>{
    const source=await service.get(identity,map_id);
    if(!source||source.deletedAt!==undefined)throw new SyncRepositoryError('not_found');
    const map=await service.create(identity,duplicateDocument(source.document,title));
    return outlineResult(map.document,map.revision,'Mapa duplicado.');
  })) as never);
}
