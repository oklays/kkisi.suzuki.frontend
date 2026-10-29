/** Local capture worker. External providers and production credentials are deliberately unavailable here. */
import {setTimeout} from 'node:timers/promises';
import {dispatch,maintenance,queueEscalations} from './operations.mjs';
import {loadConfig} from './staging.mjs';
await loadConfig();
const abort=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>abort.abort());
do{
 try{
  await maintenance({apply:true});await queueEscalations();
  const result=await dispatch();console.log(JSON.stringify({feature:'public-savings-worker',scope:'LOCAL_SYNTHETIC',counts:result.counts}));
 }catch{console.error(JSON.stringify({feature:'public-savings-worker',code:'LOCAL_WORKER_CYCLE_FAILED'}));if(process.argv.includes('--once'))process.exitCode=1;}
 if(process.argv.includes('--once')||abort.signal.aborted)break;
 try{await setTimeout(30000,undefined,{signal:abort.signal});}catch{break;}
}while(!abort.signal.aborted);
