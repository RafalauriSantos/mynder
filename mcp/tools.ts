import {acceptedContent, inputRequired, McpServer} from '@modelcontextprotocol/server';
import {createBackup} from '../src/backup.ts';
import {SyncMapService} from '../server/maps/service.ts';
import {SyncContractError,type SyncIdentity,type SyncMap} from '../src/sync/contracts.ts';
import {SyncRepositoryError} from '../server/maps/repository.ts';
import {z} from 'zod';
import {registerNodeTools} from './node-tools.ts';

const formatSchema=z.enum(['markdown','json']).default('markdown');
const documentSchema=z.record(z.string(),z.unknown());

function textResult(value:unknown){return{content:[{type:'text' as const,text:JSON.stringify(value)}]}}
function toolError(message:string){return{isError:true,content:[{type:'text' as const,text:message}]}}
function describeMap(map:SyncMap){return{document:map.document,revision:map.revision,updatedAt:map.updatedAt,...(map.deletedAt===undefined?{}:{deletedAt:map.deletedAt})}}
async function guarded<T>(action:()=>Promise<T>):Promise<T|ReturnType<typeof toolError>>{
  try{return await action()}
  catch(error){
    if(error instanceof SyncContractError)return toolError(error.message);
    if(error instanceof SyncRepositoryError){
      if(error.code==='conflict')return toolError('O mapa mudou em outro dispositivo. Leia a revisão atual e reconcilie antes de tentar novamente.');
      if(error.code==='not_found')return toolError('Mapa não encontrado nesta conta. Confira o ID ou liste seus mapas.');
      return toolError('Já existe um mapa com esse ID nesta conta.');
    }
    return toolError('Não foi possível concluir a operação agora. Tente novamente; nenhum dado de outra conta será exposto.');
  }
}

export function createMynderMcpServer(service:SyncMapService,identity:SyncIdentity,scopes:readonly string[]=['mynder:read','mynder:write']):McpServer{
  const server=new McpServer({name:'mynder-mcp-server',version:'0.1.0'});
  const canWrite=scopes.includes('mynder:write');

  server.registerTool('mynder_list_maps',{
    title:'List Mynder maps',
    description:'List maps owned by the authenticated Mynder account. Results are paginated; deleted tombstones are excluded unless requested. Supports compact markdown or complete JSON output.',
    inputSchema:{include_deleted:z.boolean().default(false).describe('Include recoverable deleted maps.'),limit:z.number().int().min(1).max(50).default(20).describe('Maximum maps in this page (1-50).'),offset:z.number().int().min(0).max(100_000).default(0).describe('Number of maps to skip.'),response_format:formatSchema.describe('markdown for a concise human view, or json for complete records.')},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({include_deleted,limit,offset,response_format})=>{
    return guarded(async()=>{
      const all=await service.list(identity);
      const maps=all.filter(map=>include_deleted||map.deletedAt===undefined);
      const items=maps.slice(offset,offset+limit).map(describeMap);
      const result={total_count:maps.length,count:items.length,offset,has_more:offset+items.length<maps.length,...(offset+items.length<maps.length?{next_offset:offset+items.length}:{}),maps:items};
      const text=response_format==='json'?JSON.stringify(result):items.length?items.map(map=>'- '+map.document.title+' ('+map.document.id+') — revisão '+map.revision).join('\n'):'Nenhum mapa nesta página.';
      return{content:[{type:'text',text}]};
    });
  });

  server.registerTool('mynder_get_map',{
    title:'Get a Mynder map',
    description:'Read one map owned by the authenticated Mynder account. A map belonging to a different account is never returned.',
    inputSchema:{map_id:z.string().min(1).max(255).describe('Stable ID of the map.')},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({map_id})=>{
    return guarded(async()=>{
      const map=await service.get(identity,map_id);
      return map?textResult(describeMap(map)):toolError('Mapa não encontrado nesta conta. Confira o ID ou liste seus mapas.');
    });
  });

  if(canWrite)server.registerTool('mynder_create_map',{
    title:'Create a Mynder map',
    description:'Create a map in the authenticated Mynder account. The document must be a valid Mynder v2 document; ownership fields are rejected and the owner is derived from the verified token.',
    inputSchema:{document:documentSchema.describe('Complete Mynder v2 document to create.')},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({document})=>{
    return guarded(async()=>{
      const map=await service.create(identity,document);
      return textResult(describeMap(map));
    });
  });

  if(canWrite)server.registerTool('mynder_update_map',{
    title:'Update a Mynder map',
    description:'Replace a map only when expected_revision matches the current remote revision. On conflict, read the current map and reconcile instead of overwriting it.',
    inputSchema:{map_id:z.string().min(1).max(255),expected_revision:z.number().int().min(1),document:documentSchema},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({map_id,expected_revision,document})=>{
    return guarded(async()=>{
      const map=await service.update(identity,map_id,expected_revision,document);
      return textResult(describeMap(map));
    });
  });

  if(canWrite)server.registerTool('mynder_delete_map',{
    title:'Delete a Mynder map',
    description:'Recoverably delete a map using its current revision. The tool first asks the MCP client to collect explicit human confirmation; without an accepted confirmation, no deletion occurs.',
    inputSchema:{map_id:z.string().min(1).max(255),expected_revision:z.number().int().min(1)},
    annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false},
  },async({map_id,expected_revision},context)=>{
    return guarded(async()=>{
      const confirmation=acceptedContent(context.mcpReq.inputResponses,'confirm_delete',z.object({confirm:z.literal(true)}));
      if(!confirmation){
        return inputRequired({inputRequests:{confirm_delete:inputRequired.elicit({message:'Apagar o mapa "'+map_id+'" na revisão '+expected_revision+'? A exclusão é recuperável, mas remove o mapa da lista ativa.',requestedSchema:{type:'object',properties:{confirm:{type:'boolean',title:'Confirmo apagar este mapa'}},required:['confirm']}})}});
      }
      if(!confirmation.confirm)return textResult({deleted:false,reason:'cancelled'});
      const map=await service.delete(identity,map_id,expected_revision);
      return textResult(describeMap(map));
    });
  });

  if(canWrite)server.registerTool('mynder_restore_map',{
    title:'Restore a Mynder map',
    description:'Restore a recoverably deleted map only when expected_revision matches the current tombstone revision.',
    inputSchema:{map_id:z.string().min(1).max(255),expected_revision:z.number().int().min(1)},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({map_id,expected_revision})=>{
    return guarded(async()=>{
      const map=await service.restore(identity,map_id,expected_revision);
      return textResult(describeMap(map));
    });
  });

  server.registerTool('mynder_export_backup',{
    title:'Export Mynder backup page',
    description:'Export an active-map page in the Mynder backup JSON format. Increase offset and combine returned document arrays to export a larger account; a single unusually large map may exceed max_bytes but never exceeds the sync contract limit.',
    inputSchema:{offset:z.number().int().min(0).max(100_000).default(0),max_bytes:z.number().int().min(10_000).max(1_900_000).default(300_000)},
    annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async({offset,max_bytes})=>{
    return guarded(async()=>{
      const active=(await service.list(identity)).filter(map=>map.deletedAt===undefined);
      const documents=[] as SyncMap['document'][];
      let bytes=2;
      for(const map of active.slice(offset)){
        const next=new TextEncoder().encode(JSON.stringify(map.document)).byteLength+1;
        if(documents.length&&bytes+next>max_bytes)break;
        documents.push(map.document);
        bytes+=next;
        if(bytes>=max_bytes)break;
      }
      const nextOffset=offset+documents.length;
      const backup=createBackup(documents);
      return textResult({backup,count:documents.length,total_count:active.length,offset,has_more:nextOffset<active.length,...(nextOffset<active.length?{next_offset:nextOffset}:{}),utf8_bytes:new TextEncoder().encode(JSON.stringify(backup)).byteLength});
    });
  });

  registerNodeTools(server,service,identity,canWrite,guarded as never);

  return server;
}
