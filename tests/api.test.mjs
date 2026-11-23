import test from 'node:test';
import assert from 'node:assert/strict';
import { collection, dayKey, shiftDay, graphRequest, slotsFor, outageRanges, statusInfo } from '../src/api.js';
test('Kyiv calendar boundaries and DST', () => {
 assert.equal(dayKey(new Date('2026-11-22T23:30:00Z')), '2026-11-23');
 assert.equal(shiftDay('2026-03-29', 1), '2026-03-30');
});
test('graph encodes exact address and every supply group', () => {
 const {params, headers} = graphRequest({city:{id:100},street:{id:200},building:{buildingName:'1-А'}}, ['2.2','4.1'], '2026-11-23');
 assert.equal(params.get('time'), '1002001-А');
 assert.deepEqual(params.getAll('group[]'), ['2.2','4.1']);
 assert.equal(Buffer.from(headers['X-debug-key'], 'base64').toString(), '100/200/1-А');
 assert.equal(params.get('before'), '2026-11-25T00:00:00+00:00');
});
test('missing slots remain unknown; outage ranges merge and end at midnight', () => {
 const slots = slotsFor({dataJson:{'2.2':{times:{'22:30':'1','23:00':1,'23:30':'1','12:00':'10'}}}}, '2.2');
 assert.equal(slots.length, 48);
 assert.equal(slots[0].code,'?');
 assert.equal(statusInfo(slots[0].code)[0], 'unknown');
 assert.deepEqual(outageRanges(slots), [{start:'12:00',end:'12:30',code:'10'},{start:'22:30',end:'24:00',code:'1'}]);
 assert.equal(slotsFor({},'2.2'), null);
});

test('supports JSON and JSON-LD lists and rejects unknown shapes', () => {
 assert.deepEqual(collection([{id:100}]), [{id:100}]);
 assert.deepEqual(collection({'hydra:member':[]}), []);
 assert.throws(() => collection({error:'unavailable'}));
});
