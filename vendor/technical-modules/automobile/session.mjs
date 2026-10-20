import {factories,globals} from './registry.mjs';

// A headless, private dependency context. No browser globals or form controls.
// Reference datasets and worksheet/map adapters are supplied by the consumer.
export function createAutomobileModels(dependencies={}) {
  const context={...dependencies},cache=new Map();
  const supplied={'tyre-reference-data':'VehicleTyreReferenceData','wltc-cycle-data':'VehicleWltcCycleData',
    'road-load-adapter':'VehicleRoadLoadAdapter','engine-component-adapter':'VehicleEngineComponentAdapter',
    'motor-component-adapter':'VehicleMotorComponentAdapter','engineering-model':'VehicleEngineeringDocumentModel'};
  function load(name) {
    const key=name.replace(/^\.\//,'').replace(/\.js$/,'');
    if(factories[key])return get(key);
    if(supplied[key]&&context[supplied[key]])return context[supplied[key]];
    throw Error('Missing calculation dependency: '+name);
  }
  function get(name) {
    if(cache.has(name))return cache.get(name);
    if(!factories[name])throw Error('Unknown Automobile model: '+name);
    const model=factories[name]({dependencies:context,loadDependency:load,runtime:'node'});
    context[globals[name]]=model;cache.set(name,model);return model;
  }
  return Object.freeze({get});
}
