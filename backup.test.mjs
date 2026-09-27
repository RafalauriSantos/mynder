import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createBackup,createImportedCopies,parseImport} from './src/backup.ts';
import {blank,importMarkdown} from './src/document.ts';

test('complete backup preserves every map and its canvas data',()=>{
  const first=importMarkdown('# Planejamento\n## Etapa\n- Detalhe');
  const second=blank('Rascunho');
  second.drawings=[{id:'stroke',kind:'pen',points:[{x:1,y:2},{x:3,y:4}],color:'#123456'}];
  second.links=[{id:'link',source:second.topics[0].id,target:second.topics[0].id+'-other'}];
  second.topics.push({id:second.topics[0].id+'-other',text:'Ligação',parentId:second.topics[0].id,position:{x:30,y:40},collapsed:false,color:'#654321'});

  const backup=createBackup([first,second]);
  const restored=parseImport(JSON.stringify(backup));

  assert.deepEqual(restored,JSON.parse(JSON.stringify([first,second])));
});

test('existing single-map JSON remains importable',()=>{
  const document=blank('Mapa legado');
  assert.deepEqual(parseImport(JSON.stringify(document)),[document]);
});

test('imported maps get new document IDs and keep all map content',()=>{
  const original=importMarkdown('# Original\n## Ramo');
  original.links=[{id:'link',source:original.topics[0].id,target:original.topics[1].id}];
  original.drawings=[{id:'stroke',kind:'pen',points:[{x:1,y:2}],color:'#123456'}];

  const [copy]=createImportedCopies([original]);

  assert.notEqual(copy.id,original.id);
  assert.equal(copy.title,'Original (importado)');
  assert.deepEqual(copy.topics,original.topics);
  assert.deepEqual(copy.links,original.links);
  assert.deepEqual(copy.drawings,original.drawings);
});

test('backup rejects unsupported versions, invalid maps and duplicate map IDs',()=>{
  const document=blank();
  assert.throws(()=>parseImport(JSON.stringify({format:'mynder-backup',version:2,documents:[document]})),/versão/);
  assert.throws(()=>createBackup([document,document]),/duplicados/);
  assert.throws(()=>parseImport(JSON.stringify({format:'mynder-backup',version:1,documents:[{...document,version:99}]})),/versão/);
});
