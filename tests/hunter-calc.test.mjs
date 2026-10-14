import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDivine,evaluateAuction} from '../public/hunter-calc.mjs';

test('parses Polish decimal commas and plain numbers',()=>{
 assert.equal(parseDivine('65,5'),65.5);
 assert.equal(parseDivine('60'),60);
 assert.equal(parseDivine('0'),null);
 assert.equal(parseDivine(''),null);
 assert.equal(parseDivine('xyz'),null);
});
test('compares an arbitrary user-entered item without catalog selection',()=>{
 const v=evaluateAuction({name:"Sylvan's Effigy",ask:'60',reference:'100'});
 assert.equal(v.ok,true);
 assert.equal(v.discountPercent,40);
 assert.equal(v.status,'review');
 assert.equal(v.difference,40);
});
test('exactly 35 percent discount passes',()=>{
 const v=evaluateAuction({name:'Rare helmet',ask:'65',reference:'100',listingCount:10});
 assert.equal(v.status,'candidate');
 assert.equal(v.discountPercent,35);
});
test('below threshold is rejected',()=>{
 const v=evaluateAuction({name:'Rare helmet',ask:'66',reference:'100',listingCount:10});
 assert.equal(v.status,'below-threshold');
});
test('manual input and incomplete form are validated',()=>{
 assert.equal(evaluateAuction({name:'',ask:'60',reference:'100'}).ok,false);
 assert.equal(evaluateAuction({name:'Item',ask:'',reference:'100'}).ok,false);
 assert.equal(evaluateAuction({name:'Item',ask:'60',reference:''}).ok,false);
});
