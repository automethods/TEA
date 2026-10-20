"use strict";

// Bounded candidate screening. A candidate is not silently made an input:
// the author can adopt its dimensions and the ordinary worksheets recalculate.
// No load or allowable stress is raised to obtain a green result.
export function createMechanicalDesignReview({ dependencies = {}, loadDependency = null, runtime = "browser" } = {}) {
  const window = runtime === "browser" ? dependencies : undefined;
  const globalThis = dependencies;
  const module = loadDependency ? { exports: {} } : undefined;
  const require = loadDependency;
  const clutch = dependencies.VehicleClutch || loadDependency?.("./clutch.js");
  const special = dependencies.VehicleClutchSpecial || loadDependency?.("./clutch-special.js");

  const positive=v=>typeof v==="number"&&Number.isFinite(v)&&v>0;
  const noChange={defined:false};
  function liningCheck({torqueNm,mu,surfaces,outerMm,innerMm,limitMpa}){
    if(![torqueNm,mu,surfaces,outerMm,innerMm,limitMpa].every(positive)||outerMm<=innerMm
      ||!Number.isInteger(surfaces)||surfaces<2||surfaces%2)return {defined:false};
    const radiusM=(outerMm+innerMm)/4000,areaM2=Math.PI*(outerMm**2-innerMm**2)/4e6;
    const clampN=torqueNm/(mu*surfaces*radiusM),pressureMpa=clampN/areaM2/1e6;
    return {defined:true,torqueNm,mu,surfaces,outerMm,innerMm,limitMpa,radiusM,areaM2,clampN,pressureMpa,passes:pressureMpa<=limitMpa*(1+1e-10)};
  }
  function lining({state,torqueNm}){
    const g=state?.geometry,mu=state?.inputs?.frictionCoefficient,z=state?.inputs?.frictionSurfaces;
    const limit=clutch.pressureLimitFor({geometry:g,profileRange:state?.adopted?.liningPressureMpa?.recommendedRange}).range?.max;
    const original=liningCheck({torqueNm,mu,surfaces:z,outerMm:g?.outerMm,innerMm:g?.innerMm,limitMpa:limit});
    if(!original.defined||original.passes)return noChange;
    const history=[];let candidate=null;
    for(const row of clutch.liningTableFor(state.methodProfile)){
      if(row.outerMm<=g.outerMm)continue;
      const result=liningCheck({torqueNm,mu,surfaces:z,outerMm:row.outerMm,innerMm:row.innerMm,limitMpa:Math.min(limit,row.pressureMaxMpa)});
      history.push(result);if(result.passes){candidate={...result,rowId:row.id};break;}
    }
    return {defined:true,kind:"lining",original,candidate,history,
      changes:candidate?{clutchGeometryBasis:"verified-table",clutchLiningRow:candidate.rowId}:null,
      reason:candidate?"Наступний розмір історичного ряду, який проходить перевірку тиску без збільшення початкової межі. Рядок має інші розміри та може мати інший тип накладки; це лише геометричний кандидат. Історичний азбестовий матеріал не рекомендовано; сучасний матеріал і тепловий ресурс не підтверджено.":"У наведеному ряду немає більшої накладки, що проходить тиск. Потрібні інша геометрія/матеріал або більше поверхонь тертя; жодної з цих змін не зроблено мовчки."};
  }
  function springCheck({inputs:i,clampForceN:required,meanRadiusM:R,liningAreaM2:A,torqueNm:M,pressureLimitMpa:qmax}){
    const vals=[required,R,A,M,qmax,i.springCount,i.springMeanDiameterM,i.springWireDiameterM,
      i.springReleaseFactor,i.springUnevenFactor,i.springAllowableShearMpa,i.springTravelM,
      i.springShearModulusMpa,i.springDeadCoils,i.springAdoptedCoils,i.springInstalledDeflectionM,
      i.springInstalledLengthM,i.frictionCoefficient,i.frictionSurfaces];
    if(!vals.every(positive)||i.springAdoptedCoils<2||!Number.isInteger(i.springCount)
      ||Math.abs(i.springAdoptedCoils*2-Math.round(i.springAdoptedCoils*2))>1e-9)return {defined:false};
    const d=i.springWireDiameterM,D=i.springMeanDiameterM,n=i.springAdoptedCoils;
    if(!(D>d))return {defined:false};
    const stiffnessNpm=i.springShearModulusMpa*1e6*d**4/(8*D**3*n);
    const developedN=stiffnessNpm*i.springInstalledDeflectionM;
    const maximumN=stiffnessNpm*(i.springInstalledDeflectionM+i.springTravelM);
    const netN=i.springCount*developedN/i.springReleaseFactor;
    const capacityNm=i.frictionCoefficient*netN*R*i.frictionSurfaces;
    const pressureMpa=netN/A/1e6;
    const allowableN=Math.PI*d**3*i.springAllowableShearMpa*1e6/(8*D);
    const designN=1.2*i.springUnevenFactor*i.springReleaseFactor*required/i.springCount;
    const releaseClearanceM=i.springInstalledLengthM-i.springTravelM-(n+i.springDeadCoils)*d;
    const checks={capacity:capacityNm>=M*(1-1e-10),pressure:pressureMpa<=qmax*(1+1e-10),
      wireDesign:designN<=allowableN*(1+1e-10),wireWorking:maximumN<=allowableN*(1+1e-10),clearance:releaseClearanceM>=0};
    return {defined:true,wireMm:d*1000,meanMm:D*1000,coils:n,stiffnessNpm,developedN,maximumN,netN,
      capacityNm,requiredTorqueNm:M,pressureMpa,pressureLimitMpa:qmax,allowableN,designN,releaseClearanceM,
      checks,passes:Object.values(checks).every(Boolean)};
  }
  function springs({state,outcome}){
    if(state?.pressureElementId!=="coil-springs"||!outcome?.springs?.assemblyDeclared)return noChange;
    const value=id=>outcome.steps.find(s=>s.output?.id===id)?.result?.value;
    const context={inputs:state.inputs,clampForceN:value("value.clutch-required-clamp-force"),meanRadiusM:value("value.clutch-mean-radius"),
      liningAreaM2:value("value.clutch-lining-area"),torqueNm:value("value.clutch-design-torque"),pressureLimitMpa:clutch.pressureLimitFor({geometry:state.geometry,profileRange:state.adopted.liningPressureMpa.recommendedRange}).range?.max};
    const original=springCheck(context);if(!original.defined||original.passes)return noChange;
    // Keep spring count, material, installed/free lengths and release travel fixed.
    // The diameter index is retained, not optimized away. Search finite 0.5-mm
    // wire and half-coil grids, bounded at 16 mm and 30 working coils.
    const ratio=original.meanMm/original.wireMm;
    if(ratio<4||ratio>12)return {defined:true,kind:"springs",original,candidate:null,history:[],reason:"Потрібно спочатку прийняти конструктивне відношення D/d у проєктному діапазоні 4…12; поточне не підмінено."};
    let candidate=null, trials=0;
    const history=[];
    for(let d=Math.ceil(original.wireMm*2)/2;d<=16&&!candidate;d+=.5){
      for(let n=2;n<=30;n+=.5){
        trials++;
        const result=springCheck({...context,inputs:{...state.inputs,springWireDiameterM:d/1000,springMeanDiameterM:d*ratio/1000,springAdoptedCoils:n}});
        if(result.defined&&result.passes){candidate=result;history.push(result);break;}
      }
    }
    return {defined:true,kind:"springs",original,candidate,history,trials,
      changes:candidate?{clutchSpringWireDiameter:candidate.wireMm,clutchSpringMeanDiameter:candidate.meanMm,clutchSpringAdoptedCoils:candidate.coils}:null,
      reason:candidate?"Попередній кандидат проходить момент, тиск, міцність за (9.10)/(9.12)/(9.18) і запас до змикання. Складання та матеріальні межі не змінено. Після прийняття його знову обчислює основний аркуш.":"У заданих межах пошуку немає пружини, що проходить усі умови одночасно. Спочатку перегляньте накладку, кількість пружин чи компонування. Успішний результат не вигадано."};
  }
  function splines(original){
    if(!original?.defined||original.crushWithinLimit&&original.shearWithinLimit)return noChange;
    const history=[];let candidate=null;
    for(let l=Math.floor(original.splineLengthMm)+1;l<=200;l++){
      const c=special.hubSplines({...original,splineLengthMm:l});history.push(c);
      if(c.defined&&c.crushWithinLimit&&c.shearWithinLimit){candidate=c;break;}
    }
    return {defined:true,kind:"splines",original,candidate,history,
      changes:candidate?{clutchHubSplineLength:candidate.splineLengthMm}:null,
      reason:candidate?"Збільшено тільки довжину шліців у межах 200 мм; повторно перевірено зминання й зріз. Розміщення маточини ще перевіряють кресленням.":"У межах 200 мм немає придатної довжини; потрібно переглянути діаметри, кількість або профіль шліців."};
  }
  function levers(original){
    if(!original?.defined||original.withinLimit)return noChange;
    let candidate=null;const history=[];
    for(let W=Math.ceil((original.sectionModulusMm3+1)/5)*5;W<=10000;W+=5){
      const c=special.releaseLevers({...original,sectionModulusMm3:W});history.push(c);
      if(c.defined&&c.withinLimit){candidate=c;break;}
    }
    return {defined:true,kind:"levers",original,candidate,history,
      changes:candidate?{clutchLeverSectionModulus:candidate.sectionModulusMm3}:null,
      reason:candidate?"Збільшено момент опору перерізу без зміни сили, плечей і межі матеріалу. Геометрію перерізу й розміщення треба прийняти окремо.":"Потрібно переглянути переріз чи кінематику важеля; у проєктному ряду до 10000 мм³ придатного кандидата немає."};
  }
  function collect({state,outcome,specialState}){
    const M=outcome?.steps?.find(s=>s.output?.id==="value.clutch-design-torque")?.result?.value;
    return [lining({state,torqueNm:M}),springs({state,outcome}),splines(specialState?.splines),levers(specialState?.levers)].filter(r=>r.defined);
  }
  function step(reviews,tex){
    reviews=(reviews||[]).filter(r=>r?.defined&&r.original);
    if(!reviews.length)return null;
    const finite=(v,d=3)=>Number.isFinite(v)?tex(v,d):"—";
    const lines=[];
    for(const r of reviews){const o=r.original,c=r.candidate;
      if(r.kind==="lining"){
        lines.push(`q_{old}=${finite(o.pressureMpa)}>[q]=${finite(o.limitMpa)}\\ \\text{МПа}`);
        if(c)lines.push(`D_{new}=${finite(c.outerMm,0)},\\ d_{new}=${finite(c.innerMm,0)}\\ \\text{мм};\\quad q_{new}=\\frac{${finite(c.torqueNm)} }{${finite(c.mu)}\\cdot${finite(c.surfaces,0)}\\cdot${finite(c.radiusM,5)}\\cdot${finite(c.areaM2,6)}\\cdot10^6}=${finite(c.pressureMpa)}\\le${finite(c.limitMpa)}\\ \\text{МПа}`);
      } else if(r.kind==="springs"){
        lines.push(`d_{old}=${finite(o.wireMm)},\\ D_{old}=${finite(o.meanMm)},\\ n_{old}=${finite(o.coils)};\\quad M_{old}=${finite(o.capacityNm)}\\ \\text{Н·м};\\quad q_{old}=${finite(o.pressureMpa)}\\ \\text{МПа}`);
        if(c)lines.push(`d_{new}=${finite(c.wireMm)},\\ D_{new}=${finite(c.meanMm)},\\ n_{new}=${finite(c.coils)};\\quad M_{new}=${finite(c.capacityNm)}\\ge${finite(c.requiredTorqueNm)}\\ \\text{Н·м}`,`q_{new}=${finite(c.pressureMpa)}\\le${finite(c.pressureLimitMpa)};\\quad P_{max,new}=${finite(c.maximumN)}\\le${finite(c.allowableN)}\\ \\text{Н};\\quad\\Delta L=${finite(c.releaseClearanceM*1000)}\\ \\text{мм}`);
      }else if(r.kind==="splines"){
        lines.push(`l_{old}=${finite(o.splineLengthMm)}\\ \\text{мм};\\quad\\sigma_{old}=${finite(o.crushMpa)},\\ \\tau_{old}=${finite(o.shearMpa)}\\ \\text{МПа}`);
        if(c)lines.push(`l_{new}=${finite(c.splineLengthMm)}\\ \\text{мм};\\quad\\sigma_{new}=${finite(c.crushMpa)}\\le${finite(c.crushLimits.max)};\\quad\\tau_{new}=${finite(c.shearMpa)}\\le${finite(c.shearLimits.max)}\\ \\text{МПа}`);
      }else{
        lines.push(`W_{old}=${finite(o.sectionModulusMm3)}\\ \\text{мм}^3;\\quad\\sigma_{old}=${finite(o.value)}>${finite(o.limits.max)}\\ \\text{МПа}`);
        if(c)lines.push(`W_{new}=${finite(c.sectionModulusMm3)}\\ \\text{мм}^3;\\quad\\sigma_{new}=${finite(c.value)}\\le${finite(c.limits.max)}\\ \\text{МПа}`);
      }
    }
    return {id:"clutch-design-review",title:"Зчеплення: невиконані умови та перевірка більших розмірів",purpose:"Keep failed mechanical checks and explicitly test bounded dimensional candidates.",
      output:{id:"value.clutch-design-review",symbol:"C_{review}",label:"Clutch dimensional candidates",valueType:"list",canonicalUnit:null},
      expression:"evaluate candidate dimensions without changing loads, allowable stresses or assembly lengths",
      dependencies:["value.clutch-design-torque"],equationNumber:null,
      formulaTex:"q=\\frac{M}{\\mu zR_cA};\\quad C=\\frac{Gd^4}{8D^3n};\\quad P=Cf;\\quad M_{cap}=\\mu zR_cP_{net}",
      substitutionTex:"\\begin{gathered}"+lines.join("\\\\")+"\\end{gathered}",
      result:{value:reviews.map(r=>({kind:r.kind,original:r.original,candidate:r.candidate,trialCount:r.trials??r.history.length,adopted:false})),canonicalUnit:null,displayUnit:null},
      method:"bounded-dimension-review",sourceRefs:["source.project-derivation","source.method.course"],assumptions:[],
      readerNotes:reviews.map(r=>r.reason),limitations:["Кандидати не змінюють введення мовчки. Після явного прийняття весь основний розрахунок повторюється.","Перевірені лише наведені статичні умови. Втома, нагрів, технологія та компонування залишаються окремими вимогами.","Пружини: скринінг за співвідношеннями основного аркуша; кривизна дроту, стійкість і втома додатково не моделюються."]};
  }
  return Object.freeze({liningCheck,lining,springCheck,springs,splines,levers,collect,step});
}
