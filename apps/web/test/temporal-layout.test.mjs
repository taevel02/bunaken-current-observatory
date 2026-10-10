import test from 'node:test';
import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('temporal fields constrain native intrinsic sizing without clipping controls',async()=>{
 const styles=await readFile(new URL('../src/ui/form-styles.ts',import.meta.url),'utf8');
 const fields=await readFile(new URL('../src/ui/dive-time-fields.tsx',import.meta.url),'utf8');
 for(const type of ['date','time','datetime-local']){
  assert.ok(styles.includes(`[&_input[type=${type}]]:max-w-full`),`${type} must bound native width`);
  assert.ok(styles.includes(`[&_input[type=${type}]]:appearance-none`),`${type} must not use intrinsic native box sizing`);
 }
 assert.ok(styles.includes('[&_[type=date]::-webkit-date-and-time-value]:min-w-0'));
 assert.ok(fields.includes('grid-cols-1 min-[400px]:grid-cols-2'));
 assert.equal((fields.match(/<label className="grid min-w-0 gap-2"/g)||[]).length,3);
 assert.ok(!fields.includes('overflow-hidden'));
});
