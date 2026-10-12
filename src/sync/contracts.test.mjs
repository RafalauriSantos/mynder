import assert from 'node:assert/strict';
import {test} from 'node:test';
import {blank} from '../document.ts';
import {createSyncPayload, makeSyncError, validateSyncIdentity, validateSyncRevision} from './contracts.ts';

test('sync payload measures serialized UTF-8 bytes and preserves the document',()=>{
  const document=blank('Mapa 🌱');
  const payload=createSyncPayload(document);

  assert.equal(payload.json,JSON.stringify(document));
  assert.deepEqual(payload.document,document);
  assert.equal(payload.bytes,new TextEncoder().encode(payload.json).byteLength);
  assert.ok(payload.bytes>payload.json.length);
});

test('sync payload rejects client-supplied ownership fields',()=>{
  const document=blank('Privado');

  assert.throws(()=>createSyncPayload({...document,ownerId:'conta-falsa'}),error=>error.code==='invalid');
  assert.throws(()=>createSyncPayload({...document,topics:[{...document.topics[0],owner_id:'conta-falsa'}]}),error=>error.code==='invalid');
});

test('identity contract uses only a non-empty issuer and subject',()=>{
  assert.deepEqual(validateSyncIdentity({issuer:'https://identity.example',subject:'user-1'}),{issuer:'https://identity.example',subject:'user-1'});
  for(const value of [{issuer:' ',subject:'user-1'},{issuer:'https://identity.example',subject:''},{issuer:'https://identity.example',subject:'user-1',ownerId:'forged'}]){
    assert.throws(()=>validateSyncIdentity(value));
  }
});

test('sync payload accepts a valid document exactly at its byte limit and rejects one byte over',()=>{
  const document=blank('Mapa');
  document.markdown='é'.repeat(40_000);
  const exactBytes=new TextEncoder().encode(JSON.stringify(document)).byteLength;

  assert.equal(createSyncPayload(document,exactBytes).bytes,exactBytes);
  assert.throws(()=>createSyncPayload(document,exactBytes-1),error=>error.code==='too_large'&&error.actualBytes===exactBytes&&error.limitBytes===exactBytes-1);
});

test('synthetic small, medium and large map payloads report UTF-8 byte sizes',()=>{
  const fixture=(topicCount,linkCount,drawingCount,pointsPerDrawing)=>{
    const document=blank(`Fixture ${topicCount}`);
    document.topics=Array.from({length:topicCount},(_,index)=>({id:`topic-${index}`,text:`Ideia ${index} 🌱`,position:{x:index*10,y:index*5},collapsed:false,color:'#536c58'}));
    document.links=Array.from({length:linkCount},(_,index)=>({id:`link-${index}`,source:`topic-${index%topicCount}`,target:`topic-${(index+1)%topicCount}`}));
    document.drawings=Array.from({length:drawingCount},(_,index)=>({id:`drawing-${index}`,kind:'pen',color:'#333333',points:Array.from({length:pointsPerDrawing},(_,point)=>({x:point,y:index+point}))}));
    return createSyncPayload(document);
  };
  const sizes={
    small:fixture(1,0,0,0).bytes,
    medium:fixture(40,20,5,50).bytes,
    large:fixture(200,250,100,200).bytes,
  };

  assert.ok(sizes.small<sizes.medium&&sizes.medium<sizes.large);
  assert.ok(sizes.large<1_900_000);
  console.log(JSON.stringify({syncFixtureBytes:sizes}));
});

test('revision contract requires a non-empty map ID and a positive safe integer',()=>{
  assert.deepEqual(validateSyncRevision({mapId:'map-1',revision:1}),{mapId:'map-1',revision:1});
  for(const value of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'1',null]){
    assert.throws(()=>validateSyncRevision({mapId:'map-1',revision:value}));
  }
  assert.throws(()=>validateSyncRevision({mapId:'',revision:1}));
});

test('sync errors serialize only safe structured fields',()=>{
  const error=makeSyncError('unavailable');
  const serialized=JSON.stringify(error);

  assert.deepEqual(JSON.parse(serialized),error);
  assert.equal(error.code,'unavailable');
  assert.equal(error.retryable,true);
  assert.equal('cause' in error,false);
  assert.equal('ownerId' in error,false);
  assert.equal('token' in error,false);
});
