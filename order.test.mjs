import assert from 'node:assert/strict';
import {test} from 'node:test';
import {moveById} from './src/order.ts';

const items=['a','b','c','d'].map(id=>({id}));
const ids=list=>list.map(item=>item.id).join('');

test('moveById moves an item up and down and keeps the others in order',()=>{
  assert.equal(ids(moveById(items,'d',0)),'dabc');
  assert.equal(ids(moveById(items,'a',3)),'bcda');
  assert.equal(ids(moveById(items,'b',2)),'acbd');
});

test('moveById clamps out-of-range targets',()=>{
  assert.equal(ids(moveById(items,'b',-5)),'bacd');
  assert.equal(ids(moveById(items,'b',99)),'acdb');
});

test('moveById returns the same array when nothing changes and never mutates its input',()=>{
  assert.equal(moveById(items,'b',1),items);
  assert.equal(moveById(items,'missing',0),items);
  moveById(items,'a',3);
  assert.equal(ids(items),'abcd');
});
