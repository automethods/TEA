/** Dimension-only schematic. No inferred frame, suspension or battery packaging. */
export const moduleId='module.vehicle.chassis-geometry',moduleVersion='0.1.0';
const fail=reason=>({status:'invalid-input',moduleId,moduleVersion,reason,geometry:null});
export function buildChassis(parameters={}){
 const {wheelbaseM,trackFrontM,trackRearM,frontTyre,rearTyre,body=null,sources=[]}=parameters;
 if(![wheelbaseM,trackFrontM,trackRearM,frontTyre?.radiusM,frontTyre?.widthM,rearTyre?.radiusM,rearTyre?.widthM].every(v=>Number.isFinite(v)&&v>0))return fail('positive-wheelbase-tracks-and-tyre-dimensions-required');
 if(frontTyre.widthM>=trackFrontM||rearTyre.widthM>=trackRearM)return fail('tyre-width-exceeds-track');
 const axles=[{id:'front',xM:0,trackM:trackFrontM,tyre:frontTyre},{id:'rear',xM:-wheelbaseM,trackM:trackRearM,tyre:rearTyre}];
 const wheels=axles.flatMap(a=>[-1,1].map(side=>({id:a.id+(side>0?'-left':'-right'),centreM:[a.xM,side*a.trackM/2,a.tyre.radiusM],radiusM:a.tyre.radiusM,widthM:a.tyre.widthM})));
 let envelope=null;
 if(body){
  const {lengthM,widthM,heightM,frontOverhangM,groundClearanceM}=body;
  if(![lengthM,widthM,heightM,frontOverhangM,groundClearanceM].every(v=>Number.isFinite(v)&&v>0)||lengthM<=wheelbaseM+frontOverhangM||groundClearanceM>=heightM)return fail('invalid-body-dimensions');
  envelope={minM:[frontOverhangM-lengthM,-widthM/2,groundClearanceM],maxM:[frontOverhangM,widthM/2,heightM]};
 }
 return {status:'ok',moduleId,moduleVersion,schema:'chassis-schematic/1',coordinateSystem:'SI metres; front axle x=0, x forward, y left, z up; ground z=0',parameters:structuredClone(parameters),geometry:{axles:axles.map(a=>({id:a.id,xM:a.xM,trackM:a.trackM})),wheels,bodyEnvelope:envelope},limitations:['Two axles only. Three-axle and articulated layouts require an explicit axle-position contract.','Tyre dimensions are unloaded nominal dimensions, not dynamic rolling radii.','Axle lines and optional bounding box are schematic; no frame rails, suspension travel, clearance check or structural analysis inferred.']};
}
export function projectPoint(point,{view='top',yawRad=.7,pitchRad=.5}={}){
 const [x,y,z]=point;
 if(view==='top')return [x,-y];if(view==='side')return [x,-z];
 const u=x*Math.cos(yawRad)-y*Math.sin(yawRad),v=x*Math.sin(yawRad)+y*Math.cos(yawRad);
 return [u,-(v*Math.sin(pitchRad)+z*Math.cos(pitchRad))];
}
