/** Rint: I>0 discharge. Optional explicit SOC/T map; old constant-Voc/R default is preserved. */
import {batteryModelAt,thermalStep} from './battery-map.mjs';
function electrical(p,soc,T){
 const m=p.batteryModel;if(!m)return {ocvV:p.voltage,dischargeResistanceOhm:p.resistance,chargeResistanceOhm:p.resistance,maxDischargeA:p.dischargeA,maxChargeA:p.chargeA,capacityAh:p.batteryKWh*1000/p.voltage};
 const q=batteryModelAt(m,soc,T??m.thermal.initialK);return {...q,maxDischargeA:Math.min(q.maxDischargeA,p.dischargeA),maxChargeA:Math.min(q.maxChargeA,p.chargeA),capacityAh:m.capacityAh};
}
export function batteryLimits(p,soc,dt,temperatureK){
 if(!Number.isFinite(dt)||!(dt>0)||!Number.isFinite(soc)||soc<p.socMin-1e-10||soc>p.socMax+1e-10)throw Error('SOC/крок батареї поза межами.');
 const q=electrical(p,soc,temperatureK),V=q.ocvV,Rd=q.dischargeResistanceOhm,Rc=q.chargeResistanceOhm;
 if(V<p.voltageMin-1e-9||V>p.voltageMax+1e-9)throw Error('Напруга холостого ходу поза заданим вікном батареї; запуск/відновлення з такого стану не моделюється.');
 const maxDischargeSoc=Math.max(0,(soc-p.socMin)*q.capacityAh*3600/dt),maxChargeSoc=Math.max(0,(p.socMax-soc)*q.capacityAh*3600/dt);
 const maxStable=Rd===0?Infinity:V/(2*Rd);
 const voltageDischarge=Rd===0?(V>=p.voltageMin?Infinity:0):Math.max(0,(V-p.voltageMin)/Rd);
 const voltageCharge=Rc===0?(V<=p.voltageMax?Infinity:0):Math.max(0,(p.voltageMax-V)/Rc);
 const iMax=Math.min(q.maxDischargeA,maxDischargeSoc,maxStable,voltageDischarge),iMin=-Math.min(q.maxChargeA,maxChargeSoc,voltageCharge);
 return {minW:(V-Rc*iMin)*iMin,maxW:(V-Rd*iMax)*iMax,iMin,iMax,capacityAh:q.capacityAh,...q};
}
export function batteryStep(p,soc,requestedW,dt,temperatureK){
 if(!Number.isFinite(requestedW))throw Error('Нескінченна потужність батареї.');
 const limits=batteryLimits(p,soc,dt,temperatureK),W=Math.max(limits.minW,Math.min(limits.maxW,requestedW));
 const V=limits.ocvV,R=W>=0?limits.dischargeResistanceOhm:limits.chargeResistanceOhm,disc=Math.max(0,V*V-4*R*W);
 const current=2*W/(V+Math.sqrt(disc)),terminalV=V-R*current,heatW=current*current*R,next=soc-current*dt/(3600*limits.capacityAh);
 const thermal=p.batteryModel?thermalStep(p.batteryModel.thermal,temperatureK??p.batteryModel.thermal.initialK,heatW,dt):{};
 if(p.batteryModel&&(thermal.temperatureK<p.batteryModel.temperatureK[0]||thermal.temperatureK>p.batteryModel.temperatureK.at(-1)))throw Error('Температура вийшла за карту батареї: потрібні дані або інші режими/охолодження.');
 return {soc:Math.max(p.socMin,Math.min(p.socMax,next)),current,terminalV,terminalW:W,chemicalW:V*current,heatW,unservedW:requestedW-W,limited:Math.abs(W-requestedW)>1e-6,capacityAh:limits.capacityAh,ocvV:V,...thermal};
}
