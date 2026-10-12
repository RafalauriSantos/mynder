import assert from 'node:assert/strict';
import {test} from 'node:test';
import {blank} from '../document.ts';
import {SyncApiClient} from './client.ts';

test('API client injects short-lived bearer credentials and never supplies an owner ID',async()=>{
  const document=blank('Privado');
  let captured;
  const client=new SyncApiClient(async()=>'memory-only-token',async(url,init)=>{
    captured={url,init};
    return Response.json({document,revision:1,updatedAt:Date.now()},{status:201});
  },'https://mynder.test');
  const created=await client.create(document);
  assert.equal(created.document.id,document.id);
  assert.equal(captured.url,'https://mynder.test/api/maps');
  assert.equal(captured.init.headers.authorization,'Bearer memory-only-token');
  assert.equal(captured.init.headers['content-type'],'application/json');
  assert.equal('ownerId'in JSON.parse(captured.init.body),false);
  assert.equal('ownerId'in JSON.parse(captured.init.body).document,false);
});

test('missing in-memory token fails before network access',async()=>{
  let called=false;
  const client=new SyncApiClient(async()=>null,async()=>{called=true;return Response.json({})});
  await assert.rejects(client.list(),{code:'unauthenticated',status:401});
  assert.equal(called,false);
});

test('API conflict errors remain typed and local payload validation happens before fetch',async()=>{
  let calls=0;
  const client=new SyncApiClient(async()=>'token',async()=>{calls++;return Response.json({error:{code:'conflict'}},{status:409})});
  const document=blank();
  await assert.rejects(client.update(document.id,1,document),{code:'conflict',status:409});
  await assert.rejects(client.create({...document,ownerId:'forged'}),{code:'invalid'});
  assert.equal(calls,1);
});
