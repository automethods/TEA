import {esc,num} from './format.js';
import {bayServices} from './station-plan.js';

// DSTU B A.2.4-8:2009 table 7, 14a/b; DSTU B A.2.4-19:2008 table 3, 10.2/10.3.
export function serviceSymbol(kind){
 const fluid='<path d="M-4-1.8V1.8L-1 0Z M-1 0H2" fill="none"/>';
 if(kind==='W')return fluid+'<path d="M-1 0V-2M-2-2H0M2 0L3 1.2" fill="none"/>';
 if(kind==='A')return fluid+'<path d="M2-1.3V1.3" fill="none"/>';
 return '<path d="M-2.5 1.5A2.5 2.5 0 0 1 2.5 1.5Z" fill="currentColor"/><path d="M0-1V-3.5M-2-2.5H2'+(kind==='E3'?'M-1.2-1.2L-2.4-3M1.2-1.2L2.4-3':'')+'" fill="none"/>';
}
export const serviceIcon=kind=>`<svg class="utility-key" xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 10 10" aria-label="${kind}" role="img"><g stroke="currentColor" stroke-width=".45">${serviceSymbol(kind)}</g></svg>`;


// Model geometry is in metres. SVG units are centimetres; print dimensions
// preserve the selected scale. Only the view rotates, never the model inputs.
function drawing(w,h,title,{print=false,detail=false,margin:requestedMargin}={}){
 const margin=requestedMargin??(detail?1.25:3.8),maxW=560,maxH=455,scales=[20,25,50,100,200,500,1000];
 const fit=(a,b)=>scales.find(s=>(a+2*margin)*1000/s<=maxW&&(b+2*margin)*1000/s<=maxH)||1000;
 const normal=fit(w,h),turned=fit(h,w),rotate=turned<normal||(turned===normal&&h>w);
 const scale=rotate?turned:normal,W=rotate?h:w,H=rotate?w:h;
 const point=(x,y)=>rotate?[y*100,(w-x)*100]:[x*100,y*100];
 const ink='#252b2e',thin=print?scale*.025:2,thick=thin*2,font=print?scale*.35:23,radius=print?scale*.25:19;
 let body='';
 const line=(x,y,a,b,{weight=thin,dash='',stroke=ink}={})=>{const p=point(x,y),q=point(a,b);body+=`<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${stroke}" stroke-width="${weight}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;};
 const text=(x,y,label,{size=font,bold=false,angle=0}={})=>{const p=point(x,y);body+=`<text x="${p[0]}" y="${p[1]}" font-size="${size}" text-anchor="middle" dominant-baseline="central" fill="${ink}" ${bold?'font-weight="bold"':''} ${angle?`transform="rotate(${angle} ${p[0]} ${p[1]})"`:''}>${esc(label)}</text>`;};
 const box=(x,y,b,l,{fill='none',weight=thin,dash=''}={})=>{const pts=[[x,y],[x+b,y],[x+b,y+l],[x,y+l]].map(p=>point(...p).join(',')).join(' ');body+=`<polygon points="${pts}" fill="${fill}" stroke="${ink}" stroke-width="${weight}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;};
 const circle=(x,y,label)=>{const p=point(x,y);body+=`<circle cx="${p[0]}" cy="${p[1]}" r="${radius}" fill="white" stroke="${ink}" stroke-width="${thin}"/>`;text(x,y,label,{size:radius*1.25});};
 const dimension=(x,y,a,b,offset)=>{
  const vertical=x===a,dx=vertical?offset:0,dy=vertical?0:offset;
  const X=x+dx,Y=y+dy,A=a+dx,B=b+dy;
  const extra=Math.sign(offset)*.16;
  line(x,y,X+(vertical?extra:0),Y+(vertical?0:extra));line(a,b,A+(vertical?extra:0),B+(vertical?0:extra));line(X,Y,A,B);
  const tick=Math.max(.10,scale*.001);line(X-tick,Y-tick,X+tick,Y+tick);line(A-tick,B-tick,A+tick,B+tick);
  const p=point(X,Y),q=point(A,B),horizontal=Math.abs(p[1]-q[1])<1;
  const mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2;
  body+=`<text x="${mx-(horizontal?0:font*.65)}" y="${my-(horizontal?font*.45:0)}" font-size="${font}" fill="${ink}" text-anchor="middle" ${horizontal?'':`transform="rotate(-90 ${mx-font*.65} ${my})"`}>${num(Math.hypot(a-x,b-y)*1000,0)}</text>`;
 };
 const arrow=(x,y,a,b)=>{line(x,y,a,b);const len=Math.hypot(a-x,b-y),ux=(a-x)/len,uy=(b-y)/len,t=.22;line(a,b,a-t*ux+t*.45*uy,b-t*uy-t*.45*ux);line(a,b,a-t*ux-t*.45*uy,b-t*uy+t*.45*ux);};
 const path=(points,{dash='',weight=thin,stroke=ink}={})=>{body+=`<polyline points="${points.map(p=>point(...p).join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${weight}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;};
 const arc=(x,y,r,a,b)=>path(Array.from({length:17},(_,i)=>[x+r*Math.cos(a+(b-a)*i/16),y+r*Math.sin(a+(b-a)*i/16)]));
 const service=(x,y,kind)=>{const p=point(x,y),size=print?scale*.6:38;body+=`<svg x="${p[0]-size/2}" y="${p[1]-size/2}" width="${size}" height="${size}" viewBox="-5 -5 10 10" overflow="visible"><g stroke="${ink}" color="${ink}" stroke-width=".4">${serviceSymbol(kind)}</g></svg>`;};
 const equipment=(e,bay,map=(x,y)=>[x,y])=>{
  const shape=(x,y,w,l)=>{const p=map(x,y),q=map(x+w,y+l);box(Math.min(p[0],q[0]),Math.min(p[1],q[1]),Math.abs(q[0]-p[0]),Math.abs(q[1]-p[1]),{fill:'#d8dcde'});};
  const ln=(x,y,a,b)=>line(...map(x,y),...map(a,b),{dash:'10 7'});
  if(e.kind==='lift'){
   ln(e.x-e.w/2+.25,e.y,e.x+e.w/2-.25,e.y);
   for(const dx of [-e.w/2,e.w/2-.4])shape(e.x+dx,e.y-.3,.4,.6);
  }else if(e.kind==='columns'){
   const dx=e.x-(bay.vehicleX+bay.vehicle.width/2),dy=e.y-(bay.vehicleY+bay.vehicle.length/2);
   for(const xx of [bay.vehicleX-e.w+dx,bay.vehicleX+bay.vehicle.width+dx])for(const yy of [bay.vehicleY+.45+dy,bay.vehicleY+bay.vehicle.length-1.85+dy])shape(xx,yy,e.w,e.l);
  }else shape(e.x,e.y,e.w,e.l);
  const centered=['lift','columns'].includes(e.kind);circle(...map(centered?e.x:e.x+e.w/2,centered?e.y:e.y+e.l/2),e.pos);
 };
 const bay=(b,detail=false)=>{
  const map=(x,y)=>b.rotation===90?[b.x+b.l-y,b.y+x]:[b.x+x,b.y+y];
  const bx=(x,y,w,l,opts)=>{const p=map(x,y),q=map(x+w,y+l);box(Math.min(p[0],q[0]),Math.min(p[1],q[1]),Math.abs(q[0]-p[0]),Math.abs(q[1]-p[1]),opts);};
  const ln=(x,y,a,b,opts)=>line(...map(x,y),...map(a,b),opts);
  const v=b.vehicle;bx(0,0,b.w,b.l,{});bx(b.vehicleX,b.vehicleY,v.width,v.length,{fill:'#fff',dash:'13 8'});
  const front=b.vehicleY+(b.face==='top'?v.length-.8:.8);ln(b.vehicleX+.2,front,b.vehicleX+v.width-.2,front);
  for(const e of b.equipment)equipment(e,b,map);
  text(...map(b.vehicleX+v.width/2,b.vehicleY+v.length*.2),b.id+(detail?' · '+({general:'ТО/ПР',diagnostic:'Д',wheel:'Ш'}[b.zone]):''),{bold:true});
  const cx=b.vehicleX+v.width/2,fy=b.face==='top'?0:b.l;
  ln(cx-(v.width+.8)/2,fy,cx+(v.width+.8)/2,fy,{weight:thick+2,stroke:'white'});
  arrow(...map(cx,fy+(b.face==='top'?.15:-.15)),...map(cx,fy+(b.face==='top'?.95:-.95)));
  if(b.access==='through'){
   const ey=b.l-fy;ln(cx-(v.width+.8)/2,ey,cx+(v.width+.8)/2,ey,{weight:thick+2,stroke:'white'});
   arrow(...map(cx,ey+(b.face==='top'?-.95:.95)),...map(cx,ey+(b.face==='top'?-.15:.15)));
  }
  if(detail)text(...map(b.w/2,b.l-.55),b.access==='through'?'ПРОЇЗНИЙ':'ТУПИКОВИЙ');
  for(const q of bayServices(b))service(...map(q.x,q.y),q.kind);
  if(detail){
   dimension(0,0,b.w,0,-.9);dimension(0,0,0,b.l,-.9);
   // Dimension chains outside the envelope leave the equipment symbols visible.
   const X=b.vehicleX,Y=b.vehicleY;
   for(const [a,z] of [[0,X],[X,X+v.width],[X+v.width,b.w]])if(z-a>.05)dimension(a,b.l,z,b.l,.55);
   for(const [a,z] of [[0,Y],[Y,Y+v.length],[Y+v.length,b.l]])if(z-a>.05)dimension(b.w,a,b.w,z,.55);
  }
 };
 // Labels use sheet coordinates so the underlined area stays bottom-right
 // even when the drawing view rotates to fit A1 (DSTU 9243.7, 5.3.2).
 const roomMark=r=>{
  const corners=[[r.netX,r.netY],[r.netX+r.netW,r.netY+r.netL]].map(p=>point(...p));
  const left=Math.min(...corners.map(p=>p[0])),right=Math.max(...corners.map(p=>p[0])),top=Math.min(...corners.map(p=>p[1])),bottom=Math.max(...corners.map(p=>p[1]));
  const area=new Intl.NumberFormat('uk-UA',{minimumFractionDigits:1,maximumFractionDigits:1}).format(r.area),x=right-font*.55,y=bottom-font*.85;
  body+=`<g class="room-area" data-room="${r.id}" data-area="${r.area}"><text x="${(left+right)/2}" y="${(top+bottom)/2}" font-size="${font}" text-anchor="middle" fill="${ink}">${r.id}</text><text x="${x}" y="${y}" font-size="${font}" text-anchor="end" fill="${ink}">${area}</text><line x1="${x-area.length*font*.56}" y1="${y+font*.18}" x2="${x}" y2="${y+font*.18}" stroke="${ink}" stroke-width="${thin}"/></g>`;
 };
 const result=()=>({scale,rotated:rotate,html:`<svg class="station-svg ${print?'drawing-print':''}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}" viewBox="${-margin*100} ${-margin*100} ${(W+2*margin)*100} ${(H+2*margin)*100}" ${print?`width="${(W+2*margin)*1000/scale}mm" height="${(H+2*margin)*1000/scale}mm"`:''} font-family="Arial, sans-serif"><title>${esc(title)}</title>${body}</svg>`});
 return {line,text,box,circle,dimension,arrow,path,arc,service,equipment,bay,roomMark,result,thin,thick};
}
export function buildingDrawing(r,{print=false}={}){
 const l=r.layout,p=l.plan,t=p.wall,margin=Math.max(6,p.gateWidth/2+t+3),d=drawing(l.width,l.depth,'План корпусу: стіни, прорізи, рух ТЗ та інженерні підводи',{print,margin});
 const wall=(x,y,w,h)=>d.box(x,y,w,h,{fill:'#c9ced0',weight:d.thin});
 wall(-t,-t,l.width+2*t,t);wall(-t,l.depth,l.width+2*t,t);wall(-t,0,t,l.depth);wall(l.width,0,t,l.depth);
 d.box(l.width-l.aisle-l.border,0,l.aisle+l.border,l.auxY,{fill:'#f4f5f5',weight:0});
 for(const c of p.corridors)d.box(c.x,c.y,c.w,c.h,{fill:'#f4f5f5',weight:0});
 // Walls are separate from working-post boundaries.
 wall(0,l.auxY,l.width,p.partition);
 l.support.forEach((room,i)=>{if(i)wall(room.x-p.partition/2,l.auxY,p.partition,l.depth-l.auxY);});
 const blank=(x,y,w,h)=>d.box(x,y,w,h,{fill:'white',weight:0});
 for(const o of p.windows){
  const a=o.center-o.width/2,b=o.center+o.width/2;
  if(['top','bottom'].includes(o.wall)){
   const y=o.wall==='top'?-t:l.depth;blank(a,y-.01,o.width,t+.02);d.line(a,y,a,y+t);d.line(b,y,b,y+t);
   for(const f of [.2,.5,.8])d.line(a,y+t*f,b,y+t*f);d.text(o.center,o.wall==='top'?.45:l.depth+t+.45,o.id);
  }else{
   const x=o.wall==='left'?-t:l.width;blank(x-.01,a,t+.02,o.width);d.line(x,a,x+t,a);d.line(x,b,x+t,b);
   for(const f of [.2,.5,.8])d.line(x+t*f,a,x+t*f,b);d.text(o.wall==='left'?-t-.55:l.width+t+.55,o.center,o.id);
  }
 }
 for(const o of p.doors){
  if(o.wall==='horizontal'){
   blank(o.x,o.y-.01,o.width,p.partition+.02);d.line(o.x,o.y,o.x,o.y+o.width);d.arc(o.x,o.y,o.width,0,Math.PI/2);d.text(o.x+o.width/2,o.y+o.width+.35,o.id);
  }else{
   blank(-t-.01,o.y,t+.02,o.width);d.line(0,o.y,-o.width,o.y);d.arc(0,o.y,o.width,Math.PI/2,Math.PI);d.text(-o.width-.45,o.y+o.width/2,o.id);
  }
 }
 for(const g of p.gates){
  const half=g.width/2,a=g.center-half,b=g.center+half;
  if(g.wall==='top'){
   blank(a,-t-.01,g.width,t+.02);d.line(a,-t,a,0);d.line(b,-t,b,0);d.line(a,0,a,-half);d.line(b,0,b,-half);d.arc(a,0,half,-Math.PI/2,0);d.arc(b,0,half,Math.PI,1.5*Math.PI);d.text(g.center,-half-t-.45,g.id+' · '+g.direction,{bold:true});
  }else{
   blank(l.width-.01,a,t+.02,g.width);d.line(l.width,a,l.width+t,a);d.line(l.width,b,l.width+t,b);d.line(l.width,a,l.width+half,a);d.line(l.width,b,l.width+half,b);d.arc(l.width,a,half,0,Math.PI/2);d.arc(l.width,b,half,-Math.PI/2,0);d.text(l.width+half*.65,g.center,g.id+' · '+g.direction,{bold:true});
  }
 }
 for(const route of p.routes.filter(q=>!q.blocked)){
  const selected=route.bayId===p.selectedBay;d.path(route.enter,{dash:'18 9',weight:selected?d.thick:d.thin,stroke:selected?'#263f49':'#727b80'});
  const a=route.enter[2],b=route.enter[3];if(Math.hypot(b[0]-a[0],b[1]-a[1])>.1)d.arrow(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);
  if(selected||route.access==='through'){d.path(route.leave,{dash:'4 9',weight:selected?d.thick:d.thin});const q=route.leave.at(-2),end=route.leave.at(-1);d.arrow(...q,...end);}
 }
 // Shared overhead service route: its separate systems are identified by the terminals.
 const utilityRows=[];for(const b of l.bays){if(b.rotation!==0||b.access==='through')continue;const y=b.y+Math.min(.6,b.vehicleY*.5);const old=utilityRows.find(q=>Math.abs(q.y-y)<.01);if(old)old.x=Math.min(old.x,b.x+b.w/5);else utilityRows.push({y,x:b.x+b.w/5});}
 for(const b of l.bays.filter(b=>b.rotation===90||b.access==='through')){const points=p.services.filter(q=>q.bayId===b.id).map(q=>q.global);if(points.length)d.path([[l.width-.6,points[0][1]],...points],{dash:'20 6 3 6',stroke:'#68747a',weight:d.thin*.7});}
 for(const q of utilityRows)d.path([[l.width-.6,q.y],[q.x,q.y]],{dash:'20 6 3 6',stroke:'#68747a',weight:d.thin*.7});
 for(const b of l.bays)d.bay(b);
 const compressor=r.equipment.find(e=>e.id==='compressor');if(compressor)d.equipment(compressor,{});
 // Supply risers and a schematic overhead distribution spine; the installation
 // design must determine pipe/cable sizes, pressure losses and protection.
 const ux=l.width-.6;d.path([[ux,l.depth-.7],[ux,1]],{dash:'20 6 3 6'});d.text(ux-1,l.auxY+.55,'В / П / Е');
 d.service(ux-1.2,l.auxY+1,'W');d.service(ux-1.2,l.auxY+2,'E3');
 for(const room of l.support)d.roomMark(room);
 d.text(p.sx,Math.max(2,l.auxY-l.aisle/2),'005');
 d.dimension(-t,l.depth+t,l.width+t,l.depth+t,1.2);d.dimension(-t,-t,-t,l.depth+t,-1.2);
 d.dimension(l.width-l.aisle-l.border,l.auxY-1,l.width-l.border,l.auxY-1,-.6);
 return d.result();
}
export function postDrawing(r,index=0,{print=false}={}){
 const bay=r.layout.bays[Math.min(Math.max(0,index),r.layout.bays.length-1)];
 if(!bay)return {scale:1,html:'<p>Робочих постів не прийнято.</p>'};
 const d=drawing(bay.w,bay.l,'Оснащення робочого поста '+bay.id,{print,detail:true});d.bay({...bay,x:0,y:0,rotation:0},true);
 return {...d.result(),bay};
}
export function pathDrawing(){return `<svg class="station-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 135" role="img" aria-label="Послідовність проєктування"><title>Послідовність технологічного проєктування</title>${['Програма / парк','Праця за зонами','Пости й штат','Оснащення та план','Витрати / результат'].map((t,i)=>`<rect x="${i*200+4}" y="25" width="178" height="70" rx="8" fill="${i===3?'#245b69':'#e4eeed'}" stroke="#789b9e"/><text x="${i*200+93}" y="66" font-family="Arial" font-size="15" text-anchor="middle" fill="${i===3?'white':'#183b44'}">${t}</text>${i<4?`<path d="M${i*200+183} 60h16m-7-6 7 6-7 6" fill="none" stroke="#245b69" stroke-width="2"/>`:''}`).join('')}</svg>`;}
