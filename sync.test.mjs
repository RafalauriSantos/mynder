import assert from 'node:assert/strict';
import {test} from 'node:test';
import {importMarkdown} from './src/document.ts';
import {mergeRemote} from './src/sync.ts';
const doc=(md,updatedAt)=>({...importMarkdown(md),updatedAt});
test('mergeRemote adds maps that only exist in the cloud and records versions',()=>{const r=doc('# Nuvem',10);const out=mergeRemote([],[{document:r,version:3}],{});assert.equal(out.added,1);assert.equal(out.docs.length,1);assert.equal(out.versions[r.id],3)});
test('mergeRemote replaces an older local map but keeps a local copy',()=>{const local=doc('# Local',10);const remote={...local,title:'Remota',updatedAt:20};const out=mergeRemote([local],[{document:remote,version:2}],{});assert.equal(out.replaced,1);assert.equal(out.docs.length,2);assert.equal(out.docs[0].title,'Remota');assert.match(out.docs[1].title,/antes da nuvem/);assert.notEqual(out.docs[1].id,local.id)});
test('mergeRemote keeps a newer local map',()=>{const local=doc('# Local',50);const remote={...local,title:'Velha',updatedAt:20};const out=mergeRemote([local],[{document:remote,version:2}],{});assert.equal(out.keptLocal,1);assert.equal(out.docs.length,1);assert.equal(out.docs[0].title,local.title);assert.equal(out.versions[local.id],2)});
test('mergeRemote ignores identical maps and never mutates its inputs',()=>{const local=doc('# Igual',10);const copy=structuredClone(local);const out=mergeRemote([local],[{document:{...local,updatedAt:99},version:1}],{});assert.equal(out.docs.length,1);assert.equal(out.added+out.replaced+out.keptLocal,0);assert.deepEqual(local,copy)});
