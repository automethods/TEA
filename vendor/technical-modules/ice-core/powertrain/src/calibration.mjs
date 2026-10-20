/** Time-weighted, nonnegative affine fuel fit. Whole-trip holdout, never random row leakage. */
export function fitWillans(rows){
 const clean=[],rejected=[];
 for(let i=0;i<rows.length;i++){const r=rows[i];
  if(typeof r.group_id!=='string'||!r.group_id.trim()||![r.power_kw,r.fuel_g_s,r.dt_s].every(Number.isFinite)||r.power_kw<1||r.fuel_g_s<=0||r.dt_s<=0||r.dt_s>60){rejected.push(i);continue;}clean.push(r);}
 const groups=[...new Set(clean.map(r=>r.group_id))].sort();if(groups.length<5||clean.length<20)throw Error('Потрібно ≥5 незалежних груп і ≥20 коректних точок P≥1 кВт.');
 const holdout=new Set(groups.filter((_,i)=>i%5===4)),train=clean.filter(r=>!holdout.has(r.group_id)),test=clean.filter(r=>holdout.has(r.group_id));
 let sw=0,sx=0,sy=0,sxx=0,sxy=0;
 for(const r of train){const w=r.dt_s,x=r.power_kw,y=r.fuel_g_s;sw+=w;sx+=w*x;sy+=w*y;sxx+=w*x*x;sxy+=w*x*y;}
 const determinant=sw*sxx-sx*sx;if(determinant<=1e-10*sw*sxx)throw Error('Недостатня варіація потужності для двопараметричного fit.');
 const candidates=[[Math.max(0,sy/sw),0],[0,Math.max(0,sxy/sxx)]];
 const b0=(sy*sxx-sx*sxy)/determinant,b1=(sw*sxy-sx*sy)/determinant;if(b0>=0&&b1>=0)candidates.push([b0,b1]);
 const error=c=>train.reduce((s,r)=>s+r.dt_s*(c[0]+c[1]*r.power_kw-r.fuel_g_s)**2,0);
 const coefficients=candidates.sort((a,b)=>error(a)-error(b))[0];
 const metrics=rr=>{let ae=0,se=0,actual=0,predicted=0,seconds=0;for(const r of rr){const y=coefficients[0]+coefficients[1]*r.power_kw,d=y-r.fuel_g_s;ae+=r.dt_s*Math.abs(d);se+=r.dt_s*d*d;actual+=r.dt_s*r.fuel_g_s;predicted+=r.dt_s*y;seconds+=r.dt_s;}
  return {rows:rr.length,groups:new Set(rr.map(r=>r.group_id)).size,seconds,mae_g_s:ae/seconds,rmse_g_s:Math.sqrt(se/seconds),fuel_error_pct:100*(predicted/actual-1),actualFuelG:actual,predictedFuelG:predicted};};
 return {model:'fuel_g_s = intercept + slope * power_kw',interceptGs:coefficients[0],slopeGsPerKW:coefficients[1],
  train:metrics(train),holdout:metrics(test),holdoutGroups:[...holdout],trainGroups:groups.filter(g=>!holdout.has(g)),rejectedRows:rejected,
  referenceSignalStatus:'supplied-reference-not-assumed-independent',
  powerCoverageKW:{train:train.reduce((a,r)=>[Math.min(a[0],r.power_kw),Math.max(a[1],r.power_kw)],[Infinity,-Infinity]),holdout:test.reduce((a,r)=>[Math.min(a[0],r.power_kw),Math.max(a[1],r.power_kw)],[Infinity,-Infinity])},
  scope:'Engine fuel only; load >=1 kW. Regression intercept is NOT measured idle. No vehicle-chain validation.'};
}

/** This validates evidence syntax only; source independence remains a source claim. */
export function validateCalibrationEvidence(x){
 if(!x||x.format!=='powertrain-calibration-evidence/1')throw Error('Потрібен powertrain-calibration-evidence/1.');
 if(typeof x.owner!=='string'||!x.owner.trim()||typeof x.acquisition!=='string'||!x.acquisition.trim())throw Error('Задайте власника й спосіб отримання сигналів.');
 for(const key of ['powerSignal','fuelReference'])if(!x[key]||typeof x[key].class!=='string'||!x[key].class.trim())throw Error('Потрібен клас походження '+key+'.');
 if(!['unknown','not-demonstrated','independently-measured'].includes(x.referenceIndependence))throw Error('Невідомий статус незалежності еталона.');
 if(x.referenceIndependence==='independently-measured'&&(typeof x.independenceEvidence!=='string'||!x.independenceEvidence.trim()))throw Error('Вкажіть незалежний вимірювач/протокол; сам напис measured не є підтвердженням.');
 return structuredClone(x);
}
