// Explicit local-only preview. No Next server, environment-file loading, business API or DB client.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const web = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);

export function allowedPreviewRequest({method,host,origin,path}, authority) {
  if (host !== authority || (origin && origin !== `http://${authority}`)) return 403;
  if (!['GET','HEAD'].includes(method)) return 405;
  return ['/','/prototype.js','/prototype.css'].includes(path) ? 200 : 404;
}
export async function startPrototypeServer({port=3478}={}) {
  if (!Number.isInteger(port) || port<0 || port>65535) throw new Error('Invalid local preview port');
  let build;
  try {({build}=require(process.env.PROTOTYPE_ESBUILD_MODULE || 'esbuild'));}
  catch {throw new Error('Preview needs esbuild in a temporary tools directory. See src/prototypes/public-savings/README.md.');}
  const bundle=await build({entryPoints:[`${web}src/prototypes/public-savings/preview.tsx`],bundle:true,write:false,outfile:'prototype.js',absWorkingDir:web,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
  const assets=new Map(bundle.outputFiles.map(file=>[file.path.endsWith('.css')?'/prototype.css':'/prototype.js',file.contents]));
  const html=Buffer.from('<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Simulasi Simpanan Sukarela · KKISI</title><link rel="stylesheet" href="/prototype.css"></head><body><div id="prototype-root"></div><script src="/prototype.js" defer></script></body></html>');
  const server=createServer((req,res)=>{
    const authority=`127.0.0.1:${server.address().port}`;
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    const status=allowedPreviewRequest({method:req.method,host:req.headers.host,origin:req.headers.origin,path},authority);
    res.writeHead(status,{'Content-Type':path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; font-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"});
    res.end(req.method==='HEAD'?'':status===200?(path==='/'?html:assets.get(path)):'Local prototype only');
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const preview=await startPrototypeServer();
  console.log(`SYNTHETIC-ONLY local preview: ${preview.url}`);
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal,async()=>{await preview.close();process.exit(0);});
}
