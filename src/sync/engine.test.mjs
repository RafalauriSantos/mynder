import assert from 'node:assert/strict';
import {test} from 'node:test';
import {blank} from '../document.ts';
import {SyncApiError} from './client.ts';
import {syncAccount} from './engine.ts';

class FakeApi{
  constructor(maps=[]){this.maps=new Map(maps.map(map=>[map.document.id,structuredClone(map)]))}
  async list(){return [...this.maps.values()].map(map=>structuredClone(map))}
  async create(document){
    if(this.maps.has(document.id)){
      const current=this.maps.get(document.id);
      if(JSON.stringify(current.document)===JSON.stringify(document))return structuredClone(current);
      throw new SyncApiError('conflict',409);
    }
    const map={document:structuredClone(document),revision:1,updatedAt:Date.now()};this.maps.set(document.id,map);return structuredClone(map);
  }
  async update(id,revision,document){
    const current=this.maps.get(id);
    if(!current||current.revision!==revision||current.deletedAt)throw new SyncApiError('conflict',409);
    const map={document:structuredClone(document),revision:revision+1,updatedAt:Date.now()};this.maps.set(id,map);return structuredClone(map);
  }
  async delete(id,revision){
    const current=this.maps.get(id);
    if(!current||current.revision!==revision||current.deletedAt)throw new SyncApiError('conflict',409);
    const map={...current,revision:revision+1,updatedAt:Date.now(),deletedAt:Date.now()};this.maps.set(id,map);return structuredClone(map);
  }
}

const state=(docs=[],baselines={},dismissed=[])=>({version:1,docs,baselines,dismissed});
const known=(document,revision=1)=>({revision,snapshot:JSON.stringify(document)});

test('sync creates local-only maps and imports remote-only maps with baselines',async()=>{
  const local=blank('Só local');
  const remote=blank('Só nuvem');
  const api=new FakeApi([{document:remote,revision:3,updatedAt:10}]);
  const result=await syncAccount(api,state([local]));
  assert.deepEqual(new Set(result.state.docs.map(doc=>doc.id)),new Set([local.id,remote.id]));
  assert.equal(api.maps.get(local.id).revision,1);
  assert.equal(result.state.baselines[remote.id].revision,3);
  assert.deepEqual(result.conflicts,[]);
});

test('sync pulls a remote-only change and pushes a local-only change conditionally',async()=>{
  const pulled=blank('Original');
  const remotePull={...pulled,title:'Atualizado em outro dispositivo'};
  const pushed=blank('Original local');
  const localPush={...pushed,title:'Alterado neste dispositivo'};
  const api=new FakeApi([
    {document:remotePull,revision:2,updatedAt:20},
    {document:pushed,revision:1,updatedAt:10},
  ]);
  const result=await syncAccount(api,state([pulled,localPush],{
    [pulled.id]:known(pulled,1),
    [pushed.id]:known(pushed,1),
  }));
  assert.equal(result.state.docs.find(doc=>doc.id===pulled.id).title,remotePull.title);
  assert.equal(api.maps.get(pushed.id).document.title,localPush.title);
  assert.equal(result.state.baselines[pulled.id].revision,2);
  assert.equal(result.state.baselines[pushed.id].revision,2);
  assert.deepEqual(result.conflicts,[]);
});

test('sync preserves divergent edits and reports a conflict without overwriting either copy',async()=>{
  const original=blank('Base');
  const local={...original,title:'Edição local'};
  const remote={...original,title:'Edição remota'};
  const api=new FakeApi([{document:remote,revision:2,updatedAt:20}]);
  const result=await syncAccount(api,state([local],{[original.id]:known(original,1)}));
  assert.equal(api.maps.get(original.id).document.title,remote.title);
  assert.equal(result.state.docs[0].title,local.title);
  assert.equal(result.conflicts[0].reason,'changed_on_both_devices');
});

test('local deletion becomes a tombstone and remains dismissed on later syncs',async()=>{
  const document=blank('Apagar');
  const api=new FakeApi([{document,revision:4,updatedAt:10}]);
  const result=await syncAccount(api,state([],{[document.id]:known(document,4)}));
  assert.equal(api.maps.get(document.id).revision,5);
  assert.ok(api.maps.get(document.id).deletedAt);
  assert.deepEqual(result.state.dismissed,[document.id]);
  const second=await syncAccount(api,result.state);
  assert.deepEqual(second.state.docs,[]);
  assert.deepEqual(second.conflicts,[]);
});

test('successful remote writes checkpoint locally before the next operation',async()=>{
  const first=blank('Primeiro');
  const second=blank('Segundo');
  const api=new FakeApi();
  const checkpoints=[];
  await syncAccount(api,state([first,second]),async value=>checkpoints.push(value.docs.length));
  assert.ok(checkpoints.length>=3);
  assert.ok(checkpoints.every(count=>count>=0&&count<=2));
});

test('sync keeps the local map order and appends maps that only exist in the cloud',async()=>{
  const first=blank('Primeiro');
  const second=blank('Segundo');
  const cloudOnly=blank('Só nuvem');
  const api=new FakeApi([
    {document:second,revision:1,updatedAt:1},
    {document:first,revision:1,updatedAt:2},
    {document:cloudOnly,revision:1,updatedAt:3},
  ]);
  const baselines={[second.id]:known(second),[first.id]:known(first)};
  const result=await syncAccount(api,state([second,first],baselines));
  assert.deepEqual(result.state.docs.map(doc=>doc.title),['Segundo','Primeiro','Só nuvem']);
});
