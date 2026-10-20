import {VERSION} from './schema.mjs';
/** Additional bounded engineering screens. No hidden material, pump or magnetic-design defaults.
 * A passing scalar check is NOT a completed strength, durability or compliance assessment.
 */
import {fingerprint} from './graph.mjs';
import {increasing,linear} from '../../powertrain/src/maps.mjs';
const positive=(o,keys)=>{for(const k of keys)if(!Number.isFinite(o?.[k])||o[k]<=0)throw Error('Потрібне додатне число '+k);};
const nonnegative=(o,keys)=>{for(const k of keys)if(!Number.isFinite(o?.[k])||o[k]<0)throw Error('Потрібне невід’ємне число '+k);};
const provenance=o=>{if(typeof o?.source!=='string'||!o.source.trim()||!['measured','drawing-and-material-certificate','assumed-example'].includes(o.evidence))throw Error('Потрібне джерело та evidence: measured / drawing-and-material-certificate / assumed-example.');};
const finiteArray=a=>{if(!Array.isArray(a)||a.length<2||a.length>20000||a.some(v=>!Number.isFinite(v)))throw Error('Потрібний скінченний ряд навантаження.');};
const factor=(capacity,load)=>load>0?capacity/load:null;
export function goodmanScreen(stressPa,s){
 finiteArray(stressPa);positive(s,['ultimatePa','endurancePa','yieldPa','Kt','Kf']);if(s.Kt<1||s.Kf<1||s.endurancePa>s.ultimatePa||s.yieldPa>s.ultimatePa)throw Error('Несумісні матеріальні межі / концентрації.');
 const max=Math.max(...stressPa),min=Math.min(...stressPa),mean=(max+min)/2,amplitude=(max-min)/2;
 const utilization=s.Kf*amplitude/s.endurancePa+s.Kt*Math.max(0,mean)/s.ultimatePa,peak=s.Kt*Math.max(Math.abs(max),Math.abs(min));
 return {maxNominalPa:max,minNominalPa:min,meanNominalPa:mean,amplitudeNominalPa:amplitude,goodmanUtilization:utilization,fatigueFactor:utilization>0?1/utilization:null,yieldFactor:factor(s.yieldPa,peak),fatigueScreenPass:utilization<=1,yieldScreenPass:peak<=s.yieldPa,lifeCycles:null,
  formula:'a=(smax-smin)/2; m=(smax+smin)/2; U=Kf*a/Se+Kt*max(m,0)/Su; n=1/U',
  scope:'Single block-extrema uniaxial screen; no compressive mean-stress benefit, no rainflow/S-N life, multiaxiality or temperature correction. Se and Kf must already match the specified detail and conditions.'};
}
export function rodScreen(compressionN,lengthM,s){
 provenance(s);finiteArray(compressionN);positive(s,['areaM2','IyM4','IzM4','effectiveLengthY','effectiveLengthZ','elasticModulusPa','proportionalLimitPa','yieldPa','ultimatePa','endurancePa','Kt','Kf']);if(!(Number.isFinite(lengthM)&&lengthM>0))throw Error('Довжина шатуна.');
 const load=Math.max(0,...compressionN),stress=compressionN.map(f=>-f/s.areaM2),fatigue=goodmanScreen(stress,s);
 const axes=['Y','Z'].map(axis=>{const inertia=s[axis==='Y'?'IyM4':'IzM4'],K=s['effectiveLength'+axis],Pcr=Math.PI**2*s.elasticModulusPa*inertia/(K*lengthM)**2,criticalPa=Pcr/s.areaM2,elastic=criticalPa<=s.proportionalLimitPa;
 return {axis,criticalLoadN:Pcr,criticalNominalPa:criticalPa,elasticModelApplicable:elastic,factor:elastic?factor(Pcr,load):null,pass:elastic?load<=Pcr:null};});
 return {status:'preliminary-screen',source:s.source,evidence:s.evidence,lengthM,maxCompressionN:load,axes,fatigue,formula:'sigma=-Frod/A; Pcr=pi² E I/(K L)²',completeDesign:false,
  exclusions:['Eccentric/bending loads, big/small ends, bolt/cap contact, ovalization, plastic/inelastic buckling, rotating mass and actual duty spectrum are not resolved.','Euler factor is null outside the explicitly supplied proportional limit.']};
}
export function pinScreen(forceN,s){
 provenance(s);finiteArray(forceN);positive(s,['outerM','spanM','bearingLengthM','yieldPa','shearAllowablePa','bearingAllowablePa','Kt']);nonnegative(s,['innerM']);if(s.innerM>=s.outerM||s.Kt<1)throw Error('Переріз пальця / Kt.');
 const F=Math.max(...forceN.map(Math.abs)),area=Math.PI*(s.outerM**2-s.innerM**2)/4,I=Math.PI*(s.outerM**4-s.innerM**4)/64;
 const bendingPa=s.Kt*(F*s.spanM/4)*(s.outerM/2)/I,shearPa=F/(2*area),bearingPa=F/(s.outerM*s.bearingLengthM);
 return {status:'preliminary-screen',source:s.source,evidence:s.evidence,forceN:F,bendingPa,averageDoubleShearPa:shearPa,averageBearingPa:bearingPa,bendingFactor:factor(s.yieldPa,bendingPa),shearFactor:factor(s.shearAllowablePa,shearPa),bearingFactor:factor(s.bearingAllowablePa,bearingPa),completeDesign:false,
  formula:'I=pi(Do^4-Di^4)/64; M=F*span/4; sigma=Kt*M*Do/(2I); tau_avg=F/(2A); p_avg=F/(Do*b)',
  exclusions:['Simply supported beam with central point load, average double shear and projected bearing only. Actual boss/rod contact, deflection, ovalization, fatigue and lubrication are not solved.']};
}
export function shaftScreen(torqueNm,s){
 provenance(s);finiteArray(torqueNm);positive(s,['outerM','shearAllowablePa','Kt']);nonnegative(s,['innerM']);if(s.innerM>=s.outerM||s.Kt<1)throw Error('Переріз вала / Kt.');
 const maxTorqueNm=Math.max(...torqueNm.map(Math.abs)),J=Math.PI*(s.outerM**4-s.innerM**4)/32,peakShearPa=s.Kt*maxTorqueNm*s.outerM/(2*J);
 return {status:'preliminary-torsion-only',source:s.source,evidence:s.evidence,maxTorqueNm,polarMomentM4:J,peakShearPa,factor:factor(s.shearAllowablePa,peakShearPa),completeDesign:false,formula:'J=pi(Do^4-Di^4)/32; tau=Kt*T*Do/(2J)',
  exclusions:['Uses summed indicated crank torque, not a spatial crankshaft load model. Bending, journal reactions, fillets, fatigue and torsional resonance are not assessed.']};
}
export function coolantDuty(heatW,s){
 provenance(s);if(!Number.isFinite(heatW)||heatW<0)throw Error('Теплове навантаження.');positive(s,['densityKgM3','cpJKgK','riseK','viscosityPaS']);nonnegative(s,['staticPressurePa']);
 if(!Array.isArray(s.segments)||!s.segments.length||s.segments.length>100)throw Error('Потрібні сегменти однієї послідовної мережі.');
 const massFlowKgS=heatW/(s.cpJKgK*s.riseK),volumeFlowM3S=massFlowKgS/s.densityKgM3;let pressurePa=s.staticPressurePa;
 const segments=s.segments.map(x=>{positive(x,['diameterM']);nonnegative(x,['lengthM','roughnessM','lossK']);const area=Math.PI*x.diameterM**2/4,v=volumeFlowM3S/area,Re=s.densityKgM3*v*x.diameterM/s.viscosityPaS;
  if(Re>=2000&&Re<=4000)throw Error('Перехідний режим Re=2000–4000: потрібна окрема перевірена кореляція, не прихована інтерполяція.');
  const f=Re===0?0:Re<2000?64/Re:(-1.8*Math.log10(6.9/Re+(x.roughnessM/(3.7*x.diameterM))**1.11))**-2,dp=(f*x.lengthM/x.diameterM+x.lossK)*s.densityKgM3*v*v/2;pressurePa+=dp;return {...x,velocityMS:v,Re,darcyFactor:f,pressurePa:dp};});
 let pump=null;if(s.pump){const p=s.pump;increasing(p.flowM3S,'pump flow');if(p.headPa?.length!==p.flowM3S.length||p.efficiency?.length!==p.flowM3S.length||p.headPa.some(x=>!Number.isFinite(x)||x<0)||p.efficiency.some(x=>!Number.isFinite(x)||x<=0||x>1)||typeof p.source!=='string'||!p.source)throw Error('Потрібна карта насоса з напором Pa й ККД.');
  const head=linear(p.flowM3S,p.headPa,volumeFlowM3S),eta=linear(p.flowM3S,p.efficiency,volumeFlowM3S);pump=head===null?{status:'outside-pump-map',pass:null}:{status:'specified-flow-screen',source:p.source,availablePressurePa:head,efficiency:eta,pass:head>=pressurePa,shaftPowerAtMapPointW:volumeFlowM3S*head/eta};}
 return {status:'preliminary-series-network',source:s.source,evidence:s.evidence,heatW,massFlowKgS,volumeFlowM3S,pressurePa,hydraulicDutyW:volumeFlowM3S*pressurePa,segments,pump,completeDesign:false,
  formula:'mdot=Qheat/(cp*dT); dp=(f L/D+K)*rho*v²/2; hydraulicPower=dp*volumeFlow',
  exclusions:['Steady incompressible serial circuit only; no branch network, cavitation, pump/system operating-point solution, radiator heat rejection or thermostat. Heat load supplied by the current model remains unvalidated.']};
}
export function pmsmPoint(s,rpm,torqueNm,{samples=2001}={}){
 provenance(s);positive(s,['polePairs','LdH','LqH','fluxWb','currentPeakA','voltagePhasePeakV']);nonnegative(s,['resistanceOhm']);if(!Number.isInteger(s.polePairs)||![s.idMinA,s.idMaxA,rpm,torqueNm].every(Number.isFinite)||s.idMinA>s.idMaxA||s.idMinA< -s.currentPeakA||s.idMaxA>s.currentPeakA||rpm<0||!Number.isInteger(samples)||samples<101||samples>10001)throw Error('Межі dq пошуку.');
 const omega=rpm*Math.PI/30,we=s.polePairs*omega;let best=null;
 const at=id=>{const denominator=1.5*s.polePairs*(s.fluxWb+(s.LdH-s.LqH)*id);if(Math.abs(denominator)<1e-14)return;
  const iq=torqueNm/denominator,currentPeakA=Math.hypot(id,iq);if(currentPeakA>s.currentPeakA+1e-8)return;
  const vd=s.resistanceOhm*id-we*s.LqH*iq,vq=s.resistanceOhm*iq+we*(s.LdH*id+s.fluxWb),voltagePhasePeakV=Math.hypot(vd,vq);if(voltagePhasePeakV>s.voltagePhasePeakV+1e-8)return;
  const electricalW=1.5*(vd*id+vq*iq),copperW=1.5*s.resistanceOhm*(id*id+iq*iq),electromagneticW=torqueNm*omega;
  const q={idA:id,iqA:iq,currentPeakA,currentRmsA:currentPeakA/Math.SQRT2,vdV:vd,vqV:vq,voltagePhasePeakV,electricalW,copperW,electromagneticW,powerResidualW:electricalW-copperW-electromagneticW};if(!best||currentPeakA<best.currentPeakA)best=q;};
 for(let i=0;i<samples;i++)at(s.idMinA+(s.idMaxA-s.idMinA)*i/(samples-1));if(s.idMinA<=0&&s.idMaxA>=0)at(0);
 return {status:best?'feasible-dq-screen':'no-point-found-on-search-grid',rpm,torqueNm,point:best,samples,source:s.source,evidence:s.evidence,completeDesign:false,
  formula:'we=p*wm; T=1.5p[psi+(Ld-Lq)id]iq; vd=R id-we Lq iq; vq=R iq+we(Ld id+psi)',
  conventions:'Amplitude-invariant Park transform; dq current amplitude and phase-neutral voltage amplitude, not RMS or line-line. Limits explicitly provided, not inferred from DC voltage.',
  exclusions:['Fixed Ld/Lq/flux and resistance; no saturation, iron/rotation loss, inverter switching, thermal demagnetization, electromagnetic geometry or transient current control. Search is finite, not a proof of global optimum or physical infeasibility.']};
}
export function reviewDesign(r,s){
 if(!s||s.format!=='engineering-review/1')throw Error('Очікується engineering-review/1.');const results={};
 const run=(key,fn,requirements)=>{if(!s[key]){results[key]={status:'not-assessed',requirements};return;}try{results[key]=fn(s[key]);}catch(e){results[key]={status:'not-assessed-invalid-or-out-of-domain',reason:e.message,requirements};}};
 const ice=()=>{if(!r.ice)throw Error('Розрахунок ДВЗ неактивний.');return r.ice.point.rows;};
 run('rod',x=>rodScreen(ice().map(p=>p.rod),r.values['value.rod_length'],x),'Cross-section, end constraints, material certificate at temperature, corrected endurance data, Kt/Kf.');
 run('pin',x=>pinScreen(ice().map(p=>p.rod),x),'Pin dimensions, support/contact model and allowable bending/shear/bearing stresses.');
 run('shaft',x=>shaftScreen(ice().map(p=>p.torqueSum),x),'Selected section dimensions and allowable shear stress; spatial bending is not inferred.');
 run('coolant',x=>{ice();return coolantDuty(r.values['value.coolant_mass_flow']*r.params.coolantCp*r.params.coolantRise,x);},'Fluid properties at temperature, network lengths/diameters/roughness/losses, pump curve.');
 run('motor',x=>{if(!r.electric)throw Error('Електрична гілка неактивна.');if(!Array.isArray(x.points)||!x.points.length||x.points.length>100)throw Error('Потрібні points[{rpm,torqueNm}], до 100.');return {status:'point-screens',results:x.points.map(q=>pmsmPoint(x,q.rpm,q.torqueNm))};},'Measured/identified Ld,Lq,flux,R, pole pairs, explicit peak phase limits and selected operating points.');
 return {format:'engineering-review-result/1',version:VERSION,sourceRevision:r.sourceRevision,calculationRevision:r.calculationRevision,specificationHash:fingerprint(s),specification:s,results,completeDesign:false,
  missingCertification:'No fatigue-life, emissions, Euro compliance, battery safety or hardware qualification certificate is produced.'};
}
export function engineeringReviewHTML(a){
 const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return `<!doctype html><html lang="uk"><meta charset="utf-8"><title>ICE — додаткові інженерні перевірки</title><style>body{font:15px/1.5 Arial;max-width:900px;margin:35px auto;color:#193340;padding:20px}h1,h2{color:#153f54}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace}section{border-top:1px solid #c5d6de;margin-top:25px}.notice{padding:12px;background:#fff5e5;border-left:4px solid #a16a26}@media print{@page{size:A4;margin:18mm}body{margin:0;padding:0}section{break-before:page}}</style><h1>Додаткові інженерні перевірки · 0.7</h1><p class="notice">Попередні моделі для перевірки явно введених даних. Не повний розрахунок конструкції, ресурсу або сертифікація. Відсутній розділ не означає, що він пройшов перевірку.</p><p>Відбиток поточного розрахунку: <code>${esc(a.calculationRevision)}</code></p><p>Відбиток специфікації: <code>${esc(a.specificationHash)}</code></p>${Object.entries(a.results).map(([k,v])=>`<section><h2>${esc(k)}</h2><pre>${esc(JSON.stringify(v,null,2))}</pre></section>`).join('')}</html>`;
}
