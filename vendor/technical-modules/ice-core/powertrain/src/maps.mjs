/** Map boundary is explicit. Missing cells never become zero; extrapolation is rejected. */
export function increasing(a,label) {
 if(!Array.isArray(a)||a.length<2||a.length>2000||a.some((x,i)=>!Number.isFinite(x)||(i&&x<=a[i-1])))throw Error(label+': потрібна строго зростаюча вісь.');
}
export function validateMap(m) {
 if(!m||m.format!=='powertrain-grid/1'||!['fuel_g_s','loss_w'].includes(m.quantity))throw Error('Очікується powertrain-grid/1: fuel_g_s або loss_w.');
 if(typeof m.id!=='string'||!m.id.trim()||typeof m.source!=='string'||!m.source.trim())throw Error('Потрібні ID і джерело карти.');
 increasing(m.rpm,'rpm');increasing(m.torqueNm,'torqueNm');
 if(m.rpm[0]<0||m.rpm.length*m.torqueNm.length>250000)throw Error('Неприпустимий розмір/вісь карти.');
 if(!Array.isArray(m.values)||m.values.length!==m.rpm.length||m.values.some(row=>!Array.isArray(row)||row.length!==m.torqueNm.length||row.some(v=>v!==null&&(!Number.isFinite(v)||v<0))))throw Error('Некоректна матриця; рядки = rpm, стовпці = момент.');
 if(m.validityMask!==undefined&&(!Array.isArray(m.validityMask)||m.validityMask.length!==m.rpm.length||m.validityMask.some(r=>!Array.isArray(r)||r.length!==m.torqueNm.length||r.some(v=>typeof v!=='boolean'))))throw Error('Некоректна маска наявності даних.');
 if(m.operatingEnvelope){const e=m.operatingEnvelope;increasing(e.rpm,'envelope rpm');if(e.rpm[0]<0)throw Error('Від’ємна частота огинаючої.');for(const k of ['maxTorqueNm',...(m.quantity==='loss_w'?['minTorqueNm']:[])])if(!Array.isArray(e[k])||e[k].length!==e.rpm.length||e[k].some(v=>!Number.isFinite(v)))throw Error('Некоректна огинаюча '+k);if(e.maxTorqueNm.some(v=>v<0)||e.minTorqueNm?.some((v,i)=>v>0||v>e.maxTorqueNm[i]))throw Error('Неприпустимі знаки огинаючої.');}
 if(m.quantity==='loss_w'&&(typeof m.componentId!=='string'||!m.componentId.trim()))throw Error('Для loss_w обов’язковий componentId: карта має належати обраному мотору.');
 if(m.quantity==='loss_w'&&!['motor-only','motor+inverter'].includes(m.boundary))throw Error('Для електрокарти потрібна межа motor-only або motor+inverter. EDU/BISG потребують окремого адаптера передачі.');
 if(m.quantity==='fuel_g_s'&&(!Number.isFinite(m.lhvJkg)||!(m.lhvJkg>0)||!(m.fuelDensityKgL>0&&m.fuelDensityKgL<2)||!Array.isArray(m.maxTorqueNm)||m.maxTorqueNm.length!==m.rpm.length||m.maxTorqueNm.some(x=>(x===null&&!m.operatingEnvelope)||(x!==null&&(!Number.isFinite(x)||x<0)))))throw Error('Паливна карта потребує LHV та огинаючої maxTorqueNm.');
 if(m.quantity==='fuel_g_s')for(let i=0;i<m.rpm.length;i++)for(let j=0;j<m.torqueNm.length;j++){const v=m.values[i][j],power=m.rpm[i]*Math.PI/30*m.torqueNm[j];if(v!==null&&m.validityMask?.[i]?.[j]!==false&&operatingDomain(m,m.rpm[i],m.torqueNm[j]).ok&&power>0&&v*m.lhvJkg/1000<power-1e-6)throw Error('Паливна карта порушує енергетичну межу η ≤ 1.');}
 return m;
}
export function bracket(a,x) {
 if(!Number.isFinite(x)||x<a[0]||x>a.at(-1))return null;
 let lo=0,hi=a.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(a[mid]<=x)lo=mid;else hi=mid;}
 return [lo,hi,(x-a[lo])/(a[hi]-a[lo])];
}
export function linear(a,b,x){const q=bracket(a,x);return q?b[q[0]]*(1-q[2])+b[q[1]]*q[2]:null;}
export function operatingDomain(m,rpm,torque){
 if(!Number.isFinite(rpm)||!Number.isFinite(torque))return {ok:false,reason:'nonfinite-map-query'};
 const e=m.operatingEnvelope;if(!e)return {ok:true};const max=linear(e.rpm,e.maxTorqueNm,rpm),min=e.minTorqueNm?linear(e.rpm,e.minTorqueNm,rpm):null;
 if(max===null)return {ok:false,reason:'outside-source-envelope-speed'};
 if(torque>max+1e-8||(min!==null&&torque<min-1e-8))return {ok:false,reason:'outside-source-envelope-torque'};return {ok:true};
}
export function lookup(m,rpm,torque){
 const domain=operatingDomain(m,rpm,torque);if(!domain.ok)return domain;
 const x=bracket(m.rpm,rpm),y=bracket(m.torqueNm,torque);if(!x||!y)return {ok:false,reason:'outside-map'};
 let value=0;for(const [i,wx] of [[x[0],1-x[2]],[x[1],x[2]]])for(const [j,wy] of [[y[0],1-y[2]],[y[1],y[2]]]){const w=wx*wy;if(w<=1e-14)continue;const v=m.values[i][j];if(v===null||m.validityMask?.[i]?.[j]===false)return {ok:false,reason:'missing-cell'};value+=w*v;}
 return {ok:true,value,evidence:m.evidence??'user-table-unverified',interpolated:!m.rpm.includes(rpm)||!m.torqueNm.includes(torque)};
}
export function parseCSV(text){
 if(typeof text!=='string'||text.length>10_000_000)throw Error('Неприпустимий CSV.');
 text=text.replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
 else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('Незакриті лапки CSV.');if(cell||row.length){row.push(cell);rows.push(row);}if(rows.length<2)throw Error('Порожній CSV.');
 const headers=rows.shift().map(x=>x.trim());if(new Set(headers).size!==headers.length)throw Error('Дублікати заголовків CSV.');
 return rows.map(r=>{if(r.length!==headers.length)throw Error('Нерівна кількість стовпців CSV.');return Object.fromEntries(headers.map((h,i)=>[h,r[i].trim()]));});
}
