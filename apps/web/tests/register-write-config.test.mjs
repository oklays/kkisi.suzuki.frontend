import assert from 'node:assert/strict';
import test from 'node:test';
import {validateRegisterWriteConfig} from '../src/infrastructure/db/prisma-register-write.ts';
test('register write configuration never falls back to checkout credentials',()=>{const env={POS_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_staging',DATABASE_URL:'mysql://reader:p@127.0.0.1:3306/kkisi_staging',DATABASE_URL_WRITE:'mysql://checkout:p@127.0.0.1:3306/kkisi_staging'};assert.throws(()=>validateRegisterWriteConfig(env),{code:'WRITE_NOT_CONFIGURED'});assert.match(validateRegisterWriteConfig({...env,DATABASE_URL_REGISTER_WRITE:'mysql://register:p@127.0.0.1:3306/kkisi_staging'}),/register/);});

test('register writer cannot reuse checkout writer identity',()=>{const env={POS_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_staging',DATABASE_URL:'mysql://reader:p@127.0.0.1:3306/kkisi_staging',DATABASE_URL_WRITE:'mysql://checkout:p@127.0.0.1:3306/kkisi_staging',DATABASE_URL_REGISTER_WRITE:'mysql://checkout:p@127.0.0.1:3306/kkisi_staging'};assert.throws(()=>validateRegisterWriteConfig(env),{code:'WRITE_NOT_CONFIGURED'});});
