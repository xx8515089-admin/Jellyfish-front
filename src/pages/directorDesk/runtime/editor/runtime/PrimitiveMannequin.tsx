import type { CharacterRigState } from "../schema/directorProject";
import type { CharacterRuntimeMotion } from "./characterRuntimeMotion";
import { ProceduralMannequin } from "./mannequin/ProceduralMannequin";
import type { CharacterBodyType } from "./mannequin/bodyTypes";

interface PrimitiveMannequinProps {
  bodyType?: CharacterBodyType;
  color?: string;
  rigState?: CharacterRigState;
  runtimeMotion?: CharacterRuntimeMotion;
}

export function PrimitiveMannequin({ bodyType, color = "#4F8EF7", rigState, runtimeMotion }: PrimitiveMannequinProps) {
  return <ProceduralMannequin bodyType={bodyType} color={color} rigState={rigState} runtimeMotion={runtimeMotion} />;
}
