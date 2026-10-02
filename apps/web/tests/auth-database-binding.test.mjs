import assert from 'node:assert/strict';
import test from 'node:test';
import {PrismaSessionStore} from '../src/infrastructure/auth/prisma-session-store.ts';
import {PrismaThrottleStore} from '../src/infrastructure/auth/prisma-throttle-store.ts';
test('auth adapters use their dedicated connection database instead of a hardcoded staging schema',async()=>{
 const queries=[];const db={$queryRaw:async query=>{queries.push(Array.isArray(query)?query.join(''):query.strings.join(''));return[];}};
 await new PrismaSessionStore(db,()=>{}).find(Buffer.alloc(32));
 await new PrismaThrottleStore(db,()=>{}).activeLocks([{kind:'user',keyHash:Buffer.alloc(32)}],new Date());
 assert.equal(queries.length,2);
 for(const sql of queries)assert.doesNotMatch(sql,/kkisi_auth_staging\./,'the auth DSN owns the schema binding');
});
