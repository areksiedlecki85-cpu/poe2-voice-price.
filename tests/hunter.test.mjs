import test from 'node:test';
import assert from 'node:assert/strict';
import {HUNTER_CONFIG,HUNTER_TYPES,assessListing} from '../market/hunter.mjs';

test('Market Hunter keeps requested defaults',()=>{
 assert.equal(HUNTER_CONFIG.league,'Forbidden Rites');
 assert.equal(HUNTER_CONFIG.minValue,50);
 assert.equal(HUNTER_CONFIG.maxValue,200);
 assert.equal(HUNTER_CONFIG.minDiscount,35);
 assert.equal(HUNTER_CONFIG.currency,'divine');
});
test('all supported unique item categories are configured',()=>{
 assert.equal(HUNTER_TYPES.length,9);
 assert.ok(HUNTER_TYPES.includes('UniqueWeapons'));
 assert.ok(HUNTER_TYPES.includes('UniqueJewels'));
 assert.ok(HUNTER_TYPES.includes('UniqueArmours'));
});
test('price exactly 35% below reference qualifies',()=>{
 const r=assessListing(65,100,12);
 assert.equal(r.status,'candidate');
 assert.equal(r.discountPercent,35);
 assert.equal(r.difference,35);
});
test('34% reduction does not qualify',()=>{
 const r=assessListing(66,100,12);
 assert.equal(r.status,'below-threshold');
 assert.equal(r.discountPercent,34);
});
test('few observations force uncertain even above threshold',()=>{
 const r=assessListing(60,100,3);
 assert.equal(r.status,'uncertain');
});
test('invalid or zero prices cannot be bargains',()=>{
 assert.equal(assessListing(-1,100,40).status,'invalid');
 assert.equal(assessListing(0,100,40).status,'invalid');
 assert.equal(assessListing(NaN,100,40).status,'invalid');
 assert.equal(assessListing(50,0,40).status,'invalid');
});
test('premium asking price is not mistakenly marked as discount',()=>{
 const r=assessListing(170,100,12);
 assert.equal(r.status,'below-threshold');
 assert.ok(r.discountPercent<0);
});