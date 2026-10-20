/** Class 3 traces from EC/JRC; capping adds rounded one-second samples per phase.
 * Class 3b remains the explicit base if a governor caps a 3b vehicle below 120.
 * Automatic choice uses the declared maximum BEFORE an optional governor.
 */
export function isWLTC(id){return ['wltc3','wltc3a','wltc-auto'].includes(id);}
export function wltcProfile(p,b){
 const automatic=p.missionCycle==='wltc-auto',declared=(p.wltcMaxSpeed??110/3.6)*3.6;
 const baseId=automatic?(declared<120?'wltc3a':'wltc3'):p.missionCycle;
 const source=b.componentBundle.cycleCatalog.find(q=>q.id===baseId);
 if(!source?.rows?.length)throw Error('Немає локальних даних WLTC.');
 const cap=p.wltcCap==='yes'?(p.wltcCapSpeed??110/3.6)*3.6:automatic||baseId==='wltc3a'?declared:Infinity;
 const base=source.rows.map(q=>({time_s:+q.time_s,speed_kmh:+q.speed_kmh,grade_ratio:p.grade})),rows=[{...base[0]}],phases=[];
 const limits=[0,589,1022,1477,1800];let shift=0;
 for(let k=0;k<4;k++){
  const a=limits[k],end=limits[k+1],part=base.filter(q=>q.time_s>=a&&q.time_s<=end),clipped=part.map(q=>({...q,speed_kmh:Math.min(cap,q.speed_kmh)}));
  const distance=z=>z.slice(1).reduce((s,q,j)=>s+(q.speed_kmh+z[j].speed_kmh)/7.2,0),original=distance(part),interim=distance(clipped);
  const extra=Number.isFinite(cap)?Math.round((original-interim)*3.6/cap):0;
  const last=extra?clipped.findLastIndex(q=>q.speed_kmh===cap):-1,start=rows.at(-1).time_s;
  for(let j=1;j<clipped.length;j++){
   rows.push({...clipped[j],time_s:clipped[j].time_s+shift});
   if(j===last)for(let n=0;n<extra;n++){shift++;rows.push({...clipped[j],time_s:clipped[j].time_s+shift});}
  }
  phases.push({phase:['Low','Medium','High','Extra-high'][k],start_s:start,end_s:rows.at(-1).time_s,max_kmh:Math.max(...clipped.map(q=>q.speed_kmh)),added_s:extra,base_distance_m:original,distance_m:interim+(Number.isFinite(cap)?extra*cap/3.6:0)});
 }
 const capped=phases.some(q=>q.added_s>0),className=baseId==='wltc3a'?'Class 3a':'Class 3b';
 return {rows,phases,baseId,className,automatic,capKmh:Number.isFinite(cap)?cap:null,capped,cityDuration:phases[1].end_s,duration:rows.at(-1).time_s,name:'WLTC '+className+(capped?' · межа '+cap.toFixed(1)+' км/год':''),cssMinimum:Math.min(100,cap),source:source.source,distanceErrorM:phases.reduce((s,q)=>s+q.distance_m-q.base_distance_m,0)};
}
