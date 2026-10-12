import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {blank} from '../document.ts';
import {accountStorageKey,loadAccountState,saveAccountState} from './local-store.ts';

const identityA={issuer:'https://login.example.test',subject:'rafael@example.test'};
const identityB={issuer:'https://login.example.test',subject:'other@example.test'};
let data;

beforeEach(()=>{
  data=new Map();
  globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
});

test('account caches are partitioned by a one-way identity key without touching anonymous JSON',async()=>{
  const document=blank('Privado');
  data.set('rascunho-v2','anonymous-data');
  await saveAccountState(identityA,{version:1,docs:[document],baselines:{},dismissed:[]});
  assert.deepEqual((await loadAccountState(identityA)).state.docs,[document]);
  assert.deepEqual((await loadAccountState(identityB)).state.docs,[]);
  const key=await accountStorageKey(identityA);
  assert.match(key,/^mynder-account-v1:[a-f0-9]{64}$/);
  assert.equal(key.includes(identityA.subject),false);
  assert.equal(data.get('rascunho-v2'),'anonymous-data');
});

test('a damaged account cache recovers its backup and marks writes blocked',async()=>{
  const document=blank('Primeira versão');
  const key=await accountStorageKey(identityA);
  await saveAccountState(identityA,{version:1,docs:[document],baselines:{},dismissed:[]});
  await saveAccountState(identityA,{version:1,docs:[{...document,title:'Segunda versão'}],baselines:{},dismissed:[]});
  data.set(key,'damaged');
  const recovered=await loadAccountState(identityA);
  assert.equal(recovered.blocked,true);
  assert.equal(recovered.state.docs[0].title,'Primeira versão');
  assert.equal(data.get(key),'damaged');
});

test('account identity rejects client ownership fields',async()=>{
  await assert.rejects(accountStorageKey({...identityA,ownerId:'forged'}),{code:'invalid'});
});
