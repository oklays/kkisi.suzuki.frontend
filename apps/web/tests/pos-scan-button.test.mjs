import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

test('Scan processes an entered barcode; an empty Scan focuses the scanner input', () => {
  const require=createRequire(import.meta.url);let focused=0,scanned=0;
  const code=ts.transpileModule(readFileSync(new URL('../src/components/pos/ProductCatalog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const fixtureModule={exports:{}};
  runInNewContext(code,{module:fixtureModule,exports:fixtureModule.exports,require:id=>id==='react'?{useRef:()=>({current:{focus:()=>focused++}})}:id==='./preview'?{}:require(id)});
  for(const query of ['','899-SYNTHETIC']){
    const tree=fixtureModule.exports.ProductSearch({query,onQuery:()=>{},onScan:()=>scanned++});
    const button=tree.props.children.find(child=>child?.props?.className==='pos-scan');button.props.onClick();
  }
  assert.equal(focused,1);assert.equal(scanned,1);
});
test('register close remains disabled while a payment is awaiting confirmation', () => {
  const require=createRequire(import.meta.url);
  const code=ts.transpileModule(readFileSync(new URL('../src/components/pos/RegisterControls.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const fixtureModule={exports:{}};
  runInNewContext(code,{module:fixtureModule,exports:fixtureModule.exports,require:id=>id==='react'?{useState:value=>[value,()=>{}],useRef:()=>({current:null})}:id==='./RegisterRecap'?{RegisterRecap:()=>null}:require(id)});
  const session={registerOpeningAvailable:true,register:{open:{noref:'SYNTHETIC'},multiple:false},ownedRegisters:[{id:1,noref:'SYNTHETIC'}]};
  const tree=fixtureModule.exports.RegisterControls({session,locked:true});
  const children=tree.props.children.flat().filter(Boolean);
  const close=children.find(child=>child.type==='button'&&child.props.children?.[1]==='Tutup Toko');
  assert.ok(close);assert.equal(close.props.disabled,true);
});
