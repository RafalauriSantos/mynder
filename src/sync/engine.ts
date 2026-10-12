import {createSyncPayload, type SyncMap} from './contracts.ts';
import {SyncApiClient, SyncApiError} from './client.ts';
import type {AccountLocalState, SyncBaseline} from './local-store.ts';

export type SyncConflict=Readonly<{mapId:string;reason:'changed_on_both_devices'|'deleted_remotely'|'missing_remotely'|'delete_race'}>;
export type SyncResult=Readonly<{state:AccountLocalState;conflicts:SyncConflict[]}>;

function snapshot(document:unknown):string{return createSyncPayload(document).json}
function baseline(map:SyncMap):SyncBaseline{return{revision:map.revision,snapshot:snapshot(map.document)}}
function cloneState(state:AccountLocalState):AccountLocalState{return JSON.parse(JSON.stringify(state)) as AccountLocalState}
function same(left:unknown,right:unknown):boolean{return snapshot(left)===snapshot(right)}

/** Reconciles one account without overwriting an edit made on either device. */
export async function syncAccount(
  api:SyncApiClient,
  initial:AccountLocalState,
  onProgress:(state:AccountLocalState)=>Promise<void>=async()=>{},
):Promise<SyncResult>{
  const state=cloneState(initial);
  const docs=new Map(state.docs.map(document=>[document.id,document]));
  const baselines:Record<string,SyncBaseline>={...state.baselines};
  const dismissed=new Set(state.dismissed);
  const conflicts:SyncConflict[]=[];
  const checkpoint=async()=>{
    state.docs=[...docs.values()];
    state.baselines={...baselines};
    state.dismissed=[...dismissed];
    await onProgress(cloneState(state));
  };

  const remoteMaps=await api.list();
  const remote=new Map(remoteMaps.map(map=>[map.document.id,map]));

  // A removed local map is a delete request only when this device still owns the last seen revision.
  for(const [mapId,known]of Object.entries(baselines)){
    if(docs.has(mapId))continue;
    const server=remote.get(mapId);
    if(!server){conflicts.push({mapId,reason:'missing_remotely'});docs.set(mapId,JSON.parse(known.snapshot));continue}
    if(server.deletedAt!==undefined){dismissed.add(mapId);delete baselines[mapId];continue}
    if(server.revision!==known.revision){conflicts.push({mapId,reason:'delete_race'});docs.set(mapId,JSON.parse(known.snapshot));continue}
    try{
      const deleted=await api.delete(mapId,known.revision);
      baselines[mapId]=baseline(deleted);
      dismissed.add(mapId);
      delete baselines[mapId];
      await checkpoint();
    }catch(error){
      if(error instanceof SyncApiError&&error.code==='conflict'){
        conflicts.push({mapId,reason:'delete_race'});
        docs.set(mapId,JSON.parse(known.snapshot));
      }else throw error;
    }
  }

  for(const [mapId,local]of [...docs]){
    if(dismissed.has(mapId))continue;
    const server=remote.get(mapId);
    const known=baselines[mapId];
    if(!server){
      if(known){conflicts.push({mapId,reason:'missing_remotely'});continue}
      const created=await api.create(local);
      baselines[mapId]=baseline(created);
      await checkpoint();
      continue;
    }
    if(server.deletedAt!==undefined){
      if(known&&same(local,JSON.parse(known.snapshot))){docs.delete(mapId);dismissed.add(mapId);delete baselines[mapId];await checkpoint()}
      else conflicts.push({mapId,reason:'deleted_remotely'});
      continue;
    }
    if(!known){
      if(same(local,server.document)){baselines[mapId]=baseline(server);await checkpoint()}
      else conflicts.push({mapId,reason:'changed_on_both_devices'});
      continue;
    }
    const localChanged=!same(local,JSON.parse(known.snapshot));
    const remoteChanged=server.revision!==known.revision;
    if(same(local,server.document)){
      if(remoteChanged){baselines[mapId]=baseline(server);await checkpoint()}
      continue;
    }
    if(localChanged&&remoteChanged){conflicts.push({mapId,reason:'changed_on_both_devices'});continue}
    if(localChanged){
      try{
        const updated=await api.update(mapId,server.revision,local);
        baselines[mapId]=baseline(updated);
        await checkpoint();
      }catch(error){
        if(error instanceof SyncApiError&&error.code==='conflict')conflicts.push({mapId,reason:'changed_on_both_devices'});
        else throw error;
      }
      continue;
    }
    docs.set(mapId,server.document);
    baselines[mapId]=baseline(server);
    await checkpoint();
  }

  for(const [mapId,server]of remote){
    if(dismissed.has(mapId)||docs.has(mapId)||baselines[mapId])continue;
    if(server.deletedAt!==undefined){dismissed.add(mapId);continue}
    docs.set(mapId,server.document);
    baselines[mapId]=baseline(server);
    await checkpoint();
  }

  await checkpoint();
  return{state,conflicts};
}
