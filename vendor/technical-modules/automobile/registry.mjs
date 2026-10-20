import { createNumeric as factory_0 } from "./numeric.mjs";
import { createLayoutCalculator as factory_1 } from "./layout.mjs";
import { createChapter3Calculations as factory_2 } from "./chapter3-calculations.mjs";
import { createChapter4Inputs as factory_3 } from "./chapter4-inputs.mjs";
import { createChapter4Traction as factory_4 } from "./chapter4-traction.mjs";
import { createRollingResistanceSpeed as factory_5 } from "./rolling-resistance-speed.mjs";
import { createQModel as factory_6 } from "./q-model.mjs";
import { createPowertrainDesign as factory_7 } from "./powertrain-design.mjs";
import { createLaunchDesign as factory_8 } from "./launch-design.mjs";
import { createTractionCharacteristic as factory_9 } from "./traction-characteristic.mjs";
import { createGearboxRatios as factory_10 } from "./gearbox-ratios.mjs";
import { createGearboxTeeth as factory_11 } from "./gearbox-teeth.mjs";
import { createGearboxGears as factory_12 } from "./gearbox-gears.mjs";
import { createGearboxLayout as factory_13 } from "./gearbox-layout.mjs";
import { createTractionPaths as factory_14 } from "./traction-paths.mjs";
import { createPerformance as factory_15 } from "./performance.mjs";
import { createBraking as factory_16 } from "./braking.mjs";
import { createClutch as factory_17 } from "./clutch.mjs";
import { createCycleEnergy as factory_18 } from "./cycle-energy.mjs";
import { batteryDesignFactory as factory_19 } from "./battery-design.mjs";
import { createFuelEconomy as factory_20 } from "./fuel-economy.mjs";
import { createDriveshaft as factory_21 } from "./driveshaft.mjs";
import { createFinalDrive as factory_22 } from "./final-drive.mjs";
import { createSecondary as factory_23 } from "./final-drive-secondary.mjs";
import { createDifferential as factory_24 } from "./differential.mjs";
import { createWheelDrive as factory_25 } from "./wheel-drive.mjs";
import { createHandling as factory_26 } from "./handling.mjs";
import { createRide as factory_27 } from "./ride.mjs";
import { createOffroad as factory_28 } from "./offroad.mjs";
import { createSuspension as factory_29 } from "./suspension.mjs";
import { createSteering as factory_30 } from "./steering.mjs";
import { createBrakes as factory_31 } from "./brakes.mjs";
import { createSteeringLinkage as factory_32 } from "./steering-linkage.mjs";
import { createElasticElements as factory_33 } from "./elastic-elements.mjs";
import { createWheelGear as factory_34 } from "./wheel-gear.mjs";
import { createClutchSpecial as factory_35 } from "./clutch-special.mjs";
import { createMechanicalDesignReview as factory_36 } from "./mechanical-design-review.mjs";
import { createShiftStrategy as factory_37 } from "./shift-strategy.mjs";
import { createEfficiencyMaps as factory_38 } from "./efficiency-maps.mjs";
import { createTractionDiagram as factory_39 } from "./traction-diagram.mjs";
import { createPassengerMass as factory_40 } from "./passenger-mass.mjs";
import { createElectricDriveSelection as factory_41 } from "./electric-drive-selection.mjs";
import { createComponentDesignDefaults as factory_42 } from "./component-design-defaults.mjs";
import { createTransmissionSchemes as factory_43 } from "./transmission-schemes.mjs";
import { createQDataset as factory_44 } from "./q-dataset.mjs";
import { createWltcCycles as factory_45 } from "./wltc-cycles.mjs";
import { createMeasuredEfficiencyMap as factory_46 } from "./measured-efficiency-map.mjs";
import { createSteeringAnimation as factory_47 } from "./steering-animation.mjs";
export const factories=Object.freeze({
  "numeric":factory_0,
  "layout":factory_1,
  "chapter3-calculations":factory_2,
  "chapter4-inputs":factory_3,
  "chapter4-traction":factory_4,
  "rolling-resistance-speed":factory_5,
  "q-model":factory_6,
  "powertrain-design":factory_7,
  "launch-design":factory_8,
  "traction-characteristic":factory_9,
  "gearbox-ratios":factory_10,
  "gearbox-teeth":factory_11,
  "gearbox-gears":factory_12,
  "gearbox-layout":factory_13,
  "traction-paths":factory_14,
  "performance":factory_15,
  "braking":factory_16,
  "clutch":factory_17,
  "cycle-energy":factory_18,
  "battery-design":factory_19,
  "fuel-economy":factory_20,
  "driveshaft":factory_21,
  "final-drive":factory_22,
  "final-drive-secondary":factory_23,
  "differential":factory_24,
  "wheel-drive":factory_25,
  "handling":factory_26,
  "ride":factory_27,
  "offroad":factory_28,
  "suspension":factory_29,
  "steering":factory_30,
  "brakes":factory_31,
  "steering-linkage":factory_32,
  "elastic-elements":factory_33,
  "wheel-gear":factory_34,
  "clutch-special":factory_35,
  "mechanical-design-review":factory_36,
  "shift-strategy":factory_37,
  "efficiency-maps":factory_38,
  "traction-diagram":factory_39,
  "passenger-mass":factory_40,
  "electric-drive-selection":factory_41,
  "component-design-defaults":factory_42,
  "transmission-schemes":factory_43,
  "q-dataset":factory_44,
  "wltc-cycles":factory_45,
  "measured-efficiency-map":factory_46,
  "steering-animation":factory_47,
});
export const globals=Object.freeze({"numeric":"VehicleNumeric","layout":"VehicleLayoutCalculator","chapter3-calculations":"VehicleChapter3Calculations","chapter4-inputs":"VehicleChapter4Inputs","chapter4-traction":"VehicleChapter4Traction","rolling-resistance-speed":"VehicleRollingResistanceSpeed","q-model":"VehicleQModel","powertrain-design":"VehiclePowertrainDesign","launch-design":"VehicleLaunchDesign","traction-characteristic":"VehicleTractionCharacteristic","gearbox-ratios":"VehicleGearboxRatios","gearbox-teeth":"VehicleGearboxTeeth","gearbox-gears":"VehicleGearboxGears","gearbox-layout":"VehicleGearboxLayout","traction-paths":"VehicleTractionPaths","performance":"VehiclePerformance","braking":"VehicleBraking","clutch":"VehicleClutch","cycle-energy":"VehicleCycleEnergy","battery-design":"VehicleBatteryDesign","fuel-economy":"VehicleFuelEconomy","driveshaft":"VehicleDriveshaft","final-drive":"VehicleFinalDrive","final-drive-secondary":"VehicleFinalDriveSecondary","differential":"VehicleDifferential","wheel-drive":"VehicleWheelDrive","handling":"VehicleHandling","ride":"VehicleRide","offroad":"VehicleOffroad","suspension":"VehicleSuspension","steering":"VehicleSteering","brakes":"VehicleBrakes","steering-linkage":"VehicleSteeringLinkage","elastic-elements":"VehicleElasticElements","wheel-gear":"VehicleWheelGear","clutch-special":"VehicleClutchSpecial","mechanical-design-review":"VehicleMechanicalDesignReview","shift-strategy":"VehicleShiftStrategy","efficiency-maps":"VehicleEfficiencyMaps","traction-diagram":"VehicleTractionDiagram","passenger-mass":"VehiclePassengerMass","electric-drive-selection":"VehicleElectricDriveSelection","component-design-defaults":"VehicleComponentDesignDefaults","transmission-schemes":"VehicleTransmissionSchemes","q-dataset":"VehicleQDataset","wltc-cycles":"VehicleWltcCycles","measured-efficiency-map":"VehicleMeasuredEfficiencyMap","steering-animation":"VehicleSteeringAnimation"});
