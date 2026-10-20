import baseCatalogue from './locale-en.js';
import extraShort from './locale-extra-short-en.js';
import extraLong from './locale-extra-long-en.js';
const catalogue={...baseCatalogue,...extraShort,...extraLong};
// Citation links split paragraphs into text nodes. Keep their translated fragments aligned.
for(const [source,target] of Object.entries({...catalogue})){
 const ua=source.split(/\[[A-Z][^\]]*\]/g),en=target.split(/\[[A-Z][^\]]*\]/g);
 if(ua.length===en.length&&ua.length>1)for(let i=0;i<ua.length;i++)if(ua[i].trim())catalogue[ua[i].trim()]=en[i].trim();
}
for(const [source,target] of Object.entries({...catalogue})){
 const a=source.replace(/^[\s.,;:…—·]+/,'').replace(/[\s.,;:…—·]+$/,''),b=target.replace(/^[\s.,;:…—·]+/,'').replace(/[\s.,;:…—·]+$/,'');
 if(a.length>2&&!Object.hasOwn(catalogue,a))catalogue[a]=b;
}
const originalText=new WeakMap(),originalAttributes=new WeakMap();
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const matcher=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+Object.keys(catalogue).sort((a,b)=>b.length-a.length).map(escape).join('|')+')(?![\\p{L}\\p{N}_])','gu');
let selected='uk';
export function language(){return selected;}
export function translate(text){
 if(selected!=='en')return text;
 const trimmed=text.trim();
 if(Object.hasOwn(catalogue,trimmed))return text.replace(trimmed,catalogue[trimmed]);
 return text.replace(matcher,key=>catalogue[key]);
}
const skip='script,style,textarea,input,[data-user-text],.math-symbol,sub,sup';
function remember(node,value,records){
 const record=records.get(node);
 return !record||value!==record.output?{source:value,output:value}:record;
}
export function localize(root=document){
 const doc=root.ownerDocument||root;
 const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(node.parentElement?.closest(skip))continue;
  const record=remember(node,node.textContent,originalText);
  record.output=translate(record.source);node.textContent=record.output;originalText.set(node,record);
 }
 for(const node of root.querySelectorAll('[title],[aria-label],[placeholder],a[href]')){
  if(node.closest('[data-user-text]'))continue;
  let records=originalAttributes.get(node);if(!records){records=new Map();originalAttributes.set(node,records);}
  for(const key of ['title','aria-label','placeholder']){
   if(!node.hasAttribute(key))continue;
   const current=node.getAttribute(key),record=records.get(key);
   const source=!record||current!==record.output?current:record.source;
   const output=translate(source);node.setAttribute(key,output);records.set(key,{source,output});
  }
  if(node.matches('a[href^="docs/"]')){
   const record=records.get('href');const source=record?.source||node.getAttribute('href');
   const output=selected==='en'?source.replace(/_UA\.(md|html|pdf)$/, '_EN.$1').replace(/(?<!_EN)\.md$/,'_EN.md'):source;
   node.setAttribute('href',output);records.set('href',{source,output});
  }
 }
 if(root===document){document.documentElement.lang=selected;document.documentElement.dataset.language=selected;}
}
export function setLanguage(value){if(['en','uk'].includes(value))selected=value;}
export function localizeDocument(html){
 if(selected!=='en'||typeof DOMParser==='undefined')return html;
 const document=new DOMParser().parseFromString(html,'text/html');
 localize(document);document.documentElement.lang='en';
 return '<!doctype html>'+document.documentElement.outerHTML;
}
