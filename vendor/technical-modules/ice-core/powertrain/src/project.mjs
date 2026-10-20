import {simulateMission,performance} from './simulation.mjs';import {nativeDocument} from './native.mjs';
import {assessRequirements} from './requirements.mjs';
export const VERSION='0.8.6';
export function calculatePowertrain(params,bundle,cycle=bundle.cycle){
 const r=simulateMission(params,bundle,cycle);r.performance=performance(params,bundle);r.requirements=assessRequirements(params,bundle);r.version=VERSION;r.cycle=cycle;
 const native=nativeDocument(r,bundle);r.document=native.document;r.nativeValues=native.values;return r;
}
