import test from 'node:test';
import assert from 'node:assert/strict';
import {createSmtpDeliveryProvider} from '../src/infrastructure/public-savings/smtp-provider.ts';
const config={enabled:true,deliveryAuthorized:true,host:'smtp.example.invalid',port:587,tlsMode:'STARTTLS',auth:{user:'synthetic-user',pass:'synthetic-password'},from:'koperasi@example.invalid',timeoutMs:500};
const otp={id:'challenge-123',kind:'OTP',destination:'member@example.invalid',code:'123456',expiresAt:Date.now()+60000};
test('SMTP activation and TLS configuration are fail closed before any transport',()=>{
 for(const patch of [{enabled:false},{deliveryAuthorized:false},{host:'https://bad.invalid'},{port:0},{tlsMode:'PLAINTEXT'},{auth:undefined},{from:'sender@example.invalid\r\nBcc:x@evil.invalid'},{timeoutMs:Infinity},{host:'127.0.0.1'}])assert.throws(()=>createSmtpDeliveryProvider({...config,...patch}),/DELIVERY_CONFIGURATION_INVALID/);
 assert.throws(()=>createSmtpDeliveryProvider(),/DELIVERY_CONFIGURATION_INVALID/);
});
test('SMTP messages use verified TLS, bounded timeouts and stable Message-ID without caller attachments',async()=>{
 const transports=[],messages=[];
 const provider=createSmtpDeliveryProvider(config,options=>{transports.push(options);return {async sendMail(message){messages.push(message);return {accepted:[message.to],rejected:[]};},close(){}};});
 await provider.deliver({...otp,attachments:[{path:'/private/secret'}]});await provider.deliver(otp);
 assert.equal(messages[0].messageId,messages[1].messageId);assert.match(messages[0].messageId,/^<public-savings\.[a-f0-9]{64}@example\.invalid>$/);
 assert.equal(messages[0].to,otp.destination);assert.match(messages[0].text,/123456/);assert.equal(messages[0].attachments,undefined);
 assert.equal(transports[0].requireTLS,true);assert.equal(transports[0].tls.rejectUnauthorized,true);assert.equal(transports[0].logger,false);assert.equal(transports[0].debug,false);
 for(const field of ['connectionTimeout','greetingTimeout','socketTimeout','dnsTimeout'])assert.equal(transports[0][field],500);
 assert.equal(transports[0].disableFileAccess,true);assert.equal(transports[0].disableUrlAccess,true);
});
test('SMTP rejects malformed or expired deliveries before transport and strips provider errors',async()=>{
 let calls=0;const provider=createSmtpDeliveryProvider(config,()=>{calls++;return {sendMail:async()=>{throw Error('password synthetic-password OTP 123456');},close(){}};});
 for(const patch of [{destination:'a@example.invalid,b@evil.invalid'},{destination:'name <a@example.invalid>'},{code:'12'},{expiresAt:1},{id:'bad\r\nid'},{kind:'OTHER'}])await assert.rejects(()=>provider.deliver({...otp,...patch}),/DELIVERY_MESSAGE_INVALID/);
 assert.equal(calls,0);await assert.rejects(()=>provider.deliver(otp),error=>error.message==='DELIVERY_UNAVAILABLE'&&!error.cause);
});
test('SMTP rejected recipient and timeout are safe failures without automatic retry',async()=>{
 let calls=0,closed=0;
 const provider=createSmtpDeliveryProvider({...config,timeoutMs:20},()=>({sendMail:async()=>{calls++;return await new Promise(()=>{});},close(){closed++;}}));
 await assert.rejects(()=>provider.deliver(otp),/DELIVERY_TIMEOUT/);assert.equal(calls,1);assert.equal(closed,1);
 await assert.rejects(()=>createSmtpDeliveryProvider(config,()=>({sendMail:async()=>({accepted:[],rejected:[otp.destination]}),close(){}})).deliver(otp),/DELIVERY_UNAVAILABLE/);
});
test('actual Nodemailer SMTP wire works against an isolated loopback capture only',async()=>{
 const {createServer}=await import('node:net');const sockets=new Set(),messages=[];
 const server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.write('220 local-test ESMTP\r\n');let buffer='',data=false,lines=[];
 socket.on('data',chunk=>{buffer+=chunk.toString();while(buffer.includes('\r\n')){const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
 if(data){if(line==='.'){messages.push(lines.join('\r\n'));data=false;lines=[];socket.write('250 accepted synthetic\r\n');}else lines.push(line);continue;}
 if(/^EHLO|^HELO/.test(line))socket.write('250 local-test\r\n');else if(/^MAIL FROM:|^RCPT TO:/.test(line))socket.write('250 ok\r\n');else if(line==='DATA'){data=true;socket.write('354 end with dot\r\n');}else if(line==='QUIT'){socket.end('221 bye\r\n');}else socket.write('250 ok\r\n');
 }});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const provider=createSmtpDeliveryProvider({enabled:true,deliveryAuthorized:true,host:'127.0.0.1',port:server.address().port,from:'capture@example.invalid',allowLocalPlaintextForTests:true,timeoutMs:1000});
 await provider.deliver(otp);await provider.deliver({id:'confirmation-1',kind:'SUBMISSION_CONFIRMATION',destination:'member@example.invalid',reference:'APP-123'});
 assert.equal(messages.length,2);assert.match(messages[0],/123456/);assert.match(messages[1],/APP-123/);assert.match(messages[1].replace(/\r\n[ \t]+/g,' '),/Message-ID: <public-savings\.[a-f0-9]{64}@example\.invalid>/i);
 }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
});
