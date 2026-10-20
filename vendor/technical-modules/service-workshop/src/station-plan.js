// Architectural envelope and schematic circulation, in metres. Circulation is
// checked against post rectangles, not against a vehicle swept-path model.
export const PLAN_DEFAULTS={layoutMode:'auto',postAccess:'auto',throughLength:8,minPostWidth:9,wall:.3,partition:.12,gateWidth:4,gateHeight:4.5,doorWidth:1,windowWidth:1.8,windowHeight:1.5,windowSill:1.2,windowPitch:6};
export const bayPoint=(b,x,y)=>b.rotation===90?[b.x+b.l-y,b.y+x]:[b.x+x,b.y+y];
export const bayRect=b=>({x:b.x,y:b.y,w:b.rotation===90?b.l:b.w,h:b.rotation===90?b.w:b.l});
const intersects=(a,b,r)=>{
 const e=.015;
 if(Math.abs(a[0]-b[0])<e)return a[0]>r.x+e&&a[0]<r.x+r.w-e&&Math.max(a[1],b[1])>r.y+e&&Math.min(a[1],b[1])<r.y+r.h-e;
 if(Math.abs(a[1]-b[1])<e)return a[1]>r.y+e&&a[1]<r.y+r.h-e&&Math.max(a[0],b[0])>r.x+e&&Math.min(a[0],b[0])<r.x+r.w-e;
 return true;
};
export function bayServices(b){
 const kinds=b.zone==='diagnostic'?['E1']:['W','A','E1','E3'];
 if(b.access==='through')return kinds.map((kind,i)=>({id:b.id+'-'+kind,kind,bayId:b.id,x:.35,y:.6+i*.9}));
 return kinds.map((kind,i)=>({id:b.id+'-'+kind,kind,bayId:b.id,x:b.w*(i+1)/(kinds.length+1),y:Math.min(.6,b.vehicleY*.5)}));
}
export function buildStationPlan(l,d){
 const p={...PLAN_DEFAULTS,...Object.fromEntries(Object.keys(PLAN_DEFAULTS).map(k=>[k,d[k]]))},warnings=[];
 const sx=l.width-l.border-l.aisle/2,productionWidth=l.width-l.aisle-l.border;
 const exitY=Math.max(p.gateWidth/2+.5,Math.min(l.auxY-p.gateWidth/2-.5,l.auxY-l.aisle/2-l.border));
 const gates=[{id:'ВР1',wall:'top',center:sx,width:p.gateWidth,height:p.gateHeight,direction:'В’ЇЗД'},{id:'ВР2',wall:'right',center:exitY,width:p.gateWidth,height:p.gateHeight,direction:'ВИЇЗД'}];
 if(p.gateWidth>l.aisle-.4)warnings.push('Ширина воріт перевищує доступну ширину бічного проїзду.');
 if(p.gateWidth<Math.max(...l.bays.map(b=>b.vehicle.width))+.6)warnings.push('Ворота: недостатній запас за шириною для розрахункового ТЗ (прийнято 0,3 м з кожного боку).');
 if(p.gateHeight<Math.max(...l.bays.map(b=>b.vehicle.height))+.3)warnings.push('Ворота: недостатній запас за висотою для розрахункового ТЗ (прийнято 0,3 м).');
 if(p.gateHeight>l.height)warnings.push('Висота воріт більша за вільну висоту корпусу.');
 const rooms=l.support;
 const doors=rooms.map((r,i)=>({id:'Д'+(i+1),wall:'horizontal',x:r.x+r.w/2-p.doorWidth/2,y:r.y,width:p.doorWidth,room:String(i+1).padStart(3,'0')}));
 doors.push({id:'Д5',wall:'vertical',x:0,y:rooms[0].y+rooms[0].l/2-p.doorWidth/2,width:p.doorWidth,external:true});
 const windows=[];
 const addWindows=(wall,length,blocked=[])=>{
  const n=Math.max(1,Math.floor(length/p.windowPitch)),spacing=length/n;
  for(let i=0;i<n;i++){const center=(i+.5)*spacing;
   if(center-p.windowWidth/2<.5||center+p.windowWidth/2>length-.5||blocked.some(([a,b])=>center+p.windowWidth/2>a-.6&&center-p.windowWidth/2<b+.6))continue;
   windows.push({id:'ВК'+(windows.length+1),wall,center,width:p.windowWidth,height:p.windowHeight,sill:p.windowSill});
  }
 };
 addWindows('top',l.width,[[sx-p.gateWidth/2,sx+p.gateWidth/2]]);
 addWindows('right',l.depth,[[exitY-p.gateWidth/2,exitY+p.gateWidth/2]]);
 addWindows('bottom',l.width);
 const pedestrian=doors.at(-1);addWindows('left',l.depth,[[pedestrian.y,pedestrian.y+pedestrian.width]]);
 if(p.windowSill+p.windowHeight>l.height)warnings.push('Верх вікна перевищує вільну висоту корпусу.');
 const corridors=l.corridors??[],routes=[];
 l.bays.forEach(b=>{
  const cx=b.vehicleX+b.vehicle.width/2,fy=b.face==='bottom'?b.l:0,normal=b.face==='bottom'?1:-1;
  const front=bayPoint(b,cx,fy),centre=bayPoint(b,cx,b.vehicleY+b.vehicle.length/2);
  const manual=Boolean(d.bayOverrides[b.id]);
  const approach=manual?bayPoint(b,cx,fy+normal*l.aisle/2):[front[0],b.approachY];
  const back=bayPoint(b,cx,b.access==='through'?b.l-fy:fy);
  const departure=b.access==='through'?(manual?bayPoint(b,cx,b.l-fy-normal*l.aisle/2):[back[0],b.departureY]):approach;
  const enter=[[sx,-p.wall-1],[sx,approach[1]],approach,front,centre];
  const leave=[centre,back,departure,[sx,departure[1]],[sx,exitY],[l.width+p.wall+1,exitY]];
  const inside=[...enter.slice(1),...leave.slice(0,-1)].every(([x,y])=>x>=0&&x<=l.width&&y>=0&&y<l.auxY);
  const collision=points=>points.slice(1).some((q,j)=>l.bays.some(other=>other.id!==b.id&&intersects(points[j],q,bayRect(other))));
  const blocked=!inside||collision(enter.slice(1))||collision(leave.slice(0,-1));
  if(blocked)warnings.push(b.id+': немає вільного схематичного маршруту в’їзду / виїзду; змініть координати або орієнтацію.');
  routes.push({bayId:b.id,access:b.access,enter,leave,blocked,reverse:b.access!=='through'});
 });
 return {...p,outerWidth:l.width+2*p.wall,outerDepth:l.depth+2*p.wall,sx,exitY,productionWidth,gates,doors,windows,corridors,routes,services:l.bays.flatMap(b=>bayServices(b).map(q=>({...q,global:bayPoint(b,q.x,q.y)}))),selectedBay:l.bays[Math.min(d.selectedBay,l.bays.length-1)]?.id,warnings};
}
