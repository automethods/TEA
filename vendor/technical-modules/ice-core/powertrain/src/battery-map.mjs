/** Optional pack-level Rint(SOC,T) + one lumped thermal state. No aging/entropic heat/RC polarization.
 * Model constants must come from an explicit caller-supplied document, never guessed from capacity.
 */
import {increasing,bracket} from './maps.mjs';
export function validateBatteryModel(m){
 if(!m||m.format!=='battery-soc-temperature/1'||m.boundary!=='pack-terminals'||typeof m.id!=='string'||!m.id||typeof m.source!=='string'||!m.source||!['measured','manufacturer-table','assumed-example'].includes(m.evidence))throw Error('Потрібна карта батареї з ID, джерелом, доказовістю і межею pack-terminals.');
 increasing(m.soc,'SOC');increasing(m.temperatureK,'T');if(m.soc[0]<0||m.soc.at(-1)>1||m.temperatureK[0]<=0||m.soc.length*m.temperatureK.length>20000)throw Error('Межі/розмір карти батареї.');
 if(!(Number.isFinite(m.capacityAh)&&m.capacityAh>0&&Number.isFinite(m.nominalVoltageV)&&m.nominalVoltageV>0))throw Error('Потрібна окрема номінальна ємність Ah і напруга.');
 for(const k of ['ocvV','dischargeResistanceOhm','chargeResistanceOhm','maxDischargeA','maxChargeA']){
  const a=m[k];if(!Array.isArray(a)||a.length!==m.temperatureK.length||a.some(r=>!Array.isArray(r)||r.length!==m.soc.length||r.some(v=>!Number.isFinite(v)||v<0||(k==='ocvV'&&v===0))))throw Error('Карта '+k+': рядки T, стовпці SOC, без пропусків.');
 }
 const t=m.thermal;if(!t||![t.capacityJK,t.conductanceWK,t.ambientK,t.initialK].every(Number.isFinite)||t.capacityJK<=0||t.conductanceWK<0||t.ambientK<=0||t.initialK<m.temperatureK[0]||t.initialK>m.temperatureK.at(-1))throw Error('Потрібні явні параметри теплової моделі.');
 return m;
}
export function batteryModelAt(m,soc,temperatureK){
 const x=bracket(m.soc,soc),y=bracket(m.temperatureK,temperatureK);if(!x||!y)throw Error('Стан поза підтвердженою SOC/T картою батареї; екстраполяцію не виконано.');
 const sample=a=>{let v=0;for(const [i,wy]of [[y[0],1-y[2]],[y[1],y[2]]])for(const [j,wx]of [[x[0],1-x[2]],[x[1],x[2]]])v+=a[i][j]*wy*wx;return v;};
 return Object.fromEntries(['ocvV','dischargeResistanceOhm','chargeResistanceOhm','maxDischargeA','maxChargeA'].map(k=>[k,sample(m[k])]));
}
export function thermalStep(thermal,temperatureK,heatW,dt){
 if(![temperatureK,heatW,dt].every(Number.isFinite)||dt<=0||heatW<0)throw Error('Неприпустимий тепловий крок.');
 const C=thermal.capacityJK,U=thermal.conductanceWK,Ta=thermal.ambientK;
 const next=U===0?temperatureK+heatW*dt/C:Ta+heatW/U+(temperatureK-Ta-heatW/U)*Math.exp(-U*dt/C);
 const storedJ=C*(next-temperatureK),coolingJ=heatW*dt-storedJ;
 return {temperatureK:next,storedJ,coolingJ,thermalResidualJ:heatW*dt-storedJ-coolingJ};
}
