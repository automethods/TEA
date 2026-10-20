/** Constant-OCV/Rint battery acceptance re-queries the signed motor; no host state. */
export const moduleId='module.vehicle.battery-motor';
export const moduleVersion='0.1.0';
export const modelId='constant-ocv-motor-feedback/1';
const failure=reason=>({status:'invalid-input',moduleId,moduleVersion,modelId,outputs:null,reason});
export function coupleBatteryMotorStep({battery,dtS,chargeRoomEnergyJ,auxiliaryPowerW,
 requestedMotorElectricalPowerW,requestedMotorShaftPowerW,evaluateMotor}){
 if(!battery||!['energy','rint'].includes(battery.model)||![dtS,chargeRoomEnergyJ,auxiliaryPowerW,requestedMotorElectricalPowerW,requestedMotorShaftPowerW].every(Number.isFinite)
  ||dtS<=0||chargeRoomEnergyJ<0||auxiliaryPowerW<0||typeof evaluateMotor!=='function')return failure('invalid-battery-motor-step');
 const rint=battery.model==='rint',U=battery.openCircuitVoltageV,R=battery.resistanceOhm;
 let dischargeLimitW=Infinity,chargeLimitW=chargeRoomEnergyJ/dtS;
 if(rint){
  const {dischargeCurrentLimitA:d,chargeCurrentLimitA:c,minTerminalVoltageV:vmin,maxTerminalVoltageV:vmax}=battery;
  if(![U,R,d,c,vmin,vmax].every(Number.isFinite)||!(U>0&&R>=0&&d>0&&c>=0&&vmin>0&&vmin<=U&&U<=vmax))return failure('invalid-rint-limits');
  const id=Math.min(d,R>0?U/(2*R):Infinity,R>0?(U-vmin)/R:Infinity);
  const ic=Math.min(c,R>0?(vmax-U)/R:Infinity,chargeRoomEnergyJ/(dtS*U));
  dischargeLimitW=(U-R*id)*id;chargeLimitW=(U+R*ic)*ic;
 }
 function terminal(powerW){
  if(!rint)return {batteryTerminalPowerW:powerW,batteryChemicalPowerW:powerW,batteryHeatPowerW:0,batteryCurrentA:null,batteryTerminalVoltageV:null};
  const current=2*powerW/(U+Math.sqrt(Math.max(0,U*U-4*R*powerW)));
  return {batteryTerminalPowerW:powerW,batteryChemicalPowerW:U*current,batteryHeatPowerW:R*current*current,batteryCurrentA:current,batteryTerminalVoltageV:U-R*current};
 }
 const requestedW=requestedMotorElectricalPowerW+auxiliaryPowerW;
 if(requestedW>dischargeLimitW+1e-6)return failure('battery-discharge-power-limit');
 let state=terminal(Math.max(-chargeLimitW,requestedW)),motor;
 // Source loss grids are voltage-invariant. Voltage is a declared operating-envelope
 // check; the second query validates the actual terminal voltage after torque limiting.
 for(let pass=0;pass<2;pass++){
  motor=evaluateMotor({batteryChargePowerLimitW:chargeLimitW+auxiliaryPowerW,motorTerminalVoltageV:state.batteryTerminalVoltageV});
  if(motor?.status!=='ok')return failure(motor?.reason||'motor-feedback-refused');
  const o=motor.outputs;
  if(!o||![o.motorElectricalPowerW,o.motorShaftPowerW,o.mappedLossPowerW,o.additionalInverterLossPowerW,o.motorShaftTorqueNm].every(Number.isFinite))return failure('invalid-motor-feedback');
  const netW=o.motorElectricalPowerW+auxiliaryPowerW;
  if(netW>dischargeLimitW+1e-6||netW< -chargeLimitW-1e-6)return failure('motor-feedback-exceeds-battery-window');
  if(o.mappedLossPowerW<0||o.additionalInverterLossPowerW< -1e-8||Math.abs(o.motorElectricalPowerW-o.motorShaftPowerW-o.mappedLossPowerW-o.additionalInverterLossPowerW)>1e-6*Math.max(1,Math.abs(o.motorElectricalPowerW)))return failure('motor-feedback-energy-balance');
  state=terminal(netW);
 }
 return {status:'ok',moduleId,moduleVersion,modelId,outputs:{...state,...motor.outputs,
  curtailedElectricalPowerW:Math.max(0,motor.outputs.motorElectricalPowerW-requestedMotorElectricalPowerW),
  additionalFrictionShaftPowerW:requestedMotorShaftPowerW<0?Math.max(0,motor.outputs.motorShaftPowerW-requestedMotorShaftPowerW):0},
  limited:motor.limited===true,chargePowerLimitW:chargeLimitW,dischargePowerLimitW:rint?dischargeLimitW:null};
}
