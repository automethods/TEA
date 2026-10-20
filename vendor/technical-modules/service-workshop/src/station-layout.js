// Finite comparison of independent 90° posts; not a swept-path optimiser.
// Literature motivates through posts for large vehicles. The length threshold,
// clearances and ranking are explicit project assumptions, not DSTU minima.
import {EQUIPMENT} from './station-data.js';
const round=x=>Math.ceil((x-1e-9)*10)/10;
export const ACCESS_LABELS={reverse:'Тупикові',mixed:'За довжиною ТЗ',through:'Проїзні'};
export const postTypeLabel=b=>b.access==='through'?'Проїзний · виїзд переднім ходом':'Тупиковий · виїзд заднім ходом';

function arrange(source,d,policy,columns,paired,requiredHeight){
 const border=d.walkway,aisle=Math.max(d.apron,...source.map(b=>b.vehicle.length+2)),bays=source.map(b=>({...b}));
 for(const b of bays){
  b.access=policy==='through'||(policy==='mixed'&&b.vehicle.length>=d.throughLength)?'through':'reverse';
  b.sideStrip=0;
  if(b.access==='through'){
   const id=b.zone==='general'?'bench':b.zone==='wheel'?(b.group==='heavy'?'tyreHeavy':'tyreLight'):'diagnostic';
   b.sideStrip=EQUIPMENT[id].w+.4;b.w=round(b.w+b.sideStrip);b.l=round(b.vehicle.length+2*d.end);
  }
  b.vehicleX=b.sideStrip+(b.w-b.sideStrip-b.vehicle.width)/2;b.vehicleY=d.end;
 }
 const rows=[],corridors=[];let y=border,maxRowWidth=d.minPostWidth;
 const split=a=>Array.from({length:Math.ceil(a.length/columns)},(_,i)=>a.slice(i*columns,(i+1)*columns));
 const corridor=top=>{if(!corridors.some(c=>Math.abs(c.y-top)<.01))corridors.push({y:top,h:aisle});};
 const place=(row,top,face,entryY,exitY)=>{
  const length=Math.max(...row.map(b=>b.l));let x=border;
  for(const b of row){b.x=x;b.y=top+(face==='bottom'?length-b.l:0);b.face=face;b.approachY=entryY;b.departureY=exitY??entryY;x+=b.w;}
  maxRowWidth=Math.max(maxRowWidth,x-border);rows.push({y:top,length,bays:row.map(b=>b.id),access:row[0].access});return length;
 };
 const dead=split(bays.filter(b=>b.access==='reverse'));
 for(let i=0;i<dead.length;i++){
  const top=dead[i],length=Math.max(...top.map(b=>b.l)),cy=y+length;
  place(top,y,'bottom',cy+aisle/2);corridor(cy);y=cy+aisle;
  if(paired&&dead[i+1]){const lower=dead[++i];y+=place(lower,y,'top',cy+aisle/2);}
 }
 const through=split(bays.filter(b=>b.access==='through'));
 for(const row of through){
  // Reuse a preceding clear cross-aisle, never drive through another post.
  const shared=corridors.find(c=>Math.abs(c.y+c.h-y)<.01);
  const entry=shared??{y,h:aisle};corridor(entry.y);if(!shared)y+=aisle;
  const length=place(row,y,'top',entry.y+aisle/2,y+Math.max(...row.map(b=>b.l))+aisle/2);
  y+=length;corridor(y);y+=aisle;
 }
 const width=round(maxRowWidth+aisle+2*border),auxY=round(y+border),depth=round(auxY+d.auxDepth+border),height=requiredHeight;
 const productionWidth=width-aisle-border;
 for(const c of corridors)Object.assign(c,{x:border,w:productionWidth-border});
 const support=[{label:'Приймання / адміністратор',x:0,w:productionWidth*.28},{label:'Склад / агрегатні роботи',x:productionWidth*.28,w:productionWidth*.44},{label:'Побутове приміщення',x:productionWidth*.72,w:productionWidth*.28},{label:'Технічне приміщення',x:productionWidth,w:width-productionWidth}].map((r,i,a)=>{
  const left=i?d.partition/2:0,right=i<a.length-1?d.partition/2:0;
  return {...r,id:String(i+1).padStart(3,'0'),y:auxY,l:depth-auxY,netX:r.x+left,netY:auxY+d.partition,netW:r.w-left-right,netL:depth-auxY-d.partition,area:(r.w-left-right)*(depth-auxY-d.partition)};
 });
 const roomArea=support.reduce((n,r)=>n+r.area,0),productionArea=width*auxY,partitionArea=width*depth-productionArea-roomArea;
 const fits=d.mode!=='existing'||(width+2*d.wall<=d.existingWidth&&depth+2*d.wall<=d.existingDepth&&height<=d.existingHeight);
 const reverse=bays.filter(b=>b.access==='reverse').length,longReverse=bays.filter(b=>b.access==='reverse'&&b.vehicle.length>=d.throughLength).length;
 return {width,depth,height,aisle,border,auxY,support,bays,corridors,rows,columns,paired,maxW:Math.max(0,...bays.map(b=>b.w)),maxL:Math.max(0,...bays.map(b=>b.l)),productionArea,roomArea,partitionArea,
  candidate:{id:`${policy}-${columns}-${paired?'double':'row'}`,policy,columns,paired,width,depth,area:width*depth,reverse,through:bays.length-reverse,longReverse,fits}};
}
const compare=(a,b)=>Number(b.candidate.fits)-Number(a.candidate.fits)||a.candidate.longReverse-b.candidate.longReverse||a.candidate.area-b.candidate.area||a.width+a.depth-b.width-b.depth||a.candidate.reverse-b.candidate.reverse;
export function selectStationLayout(source,d,requiredHeight=Math.max(0,...source.map(b=>b.height))){
 const policies=d.postAccess==='auto'?['reverse','mixed','through']:[d.postAccess],all=[];
 const maxColumns=Math.min(12,Math.max(1,source.length));
 for(const policy of policies)for(const columns of d.layoutMode==='auto'?Array.from({length:maxColumns},(_,i)=>i+1):[Math.min(d.columns,Math.max(1,source.length))])for(const paired of d.layoutMode==='auto'?[false,true]:[d.layoutStyle==='double'])all.push(arrange(source,d,policy,columns,paired,requiredHeight));
 all.sort(compare);const chosen=all[0];
 // Show the best representative of each type; retain every evaluated candidate
 // in the result so selection is reproducible and independently testable.
 const candidates=all.map(x=>x.candidate),alternatives=policies.map(policy=>all.find(x=>x.candidate.policy===policy).candidate);
 chosen.selection={...chosen.candidate,mode:d.layoutMode,constrained:d.mode==='existing',threshold:d.throughLength,evaluated:all.length,candidates,alternatives,manualCoordinates:Object.keys(d.bayOverrides).length>0};
 return chosen;
}
