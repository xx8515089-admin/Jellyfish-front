import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getDirectorDeskEventTarget } from "../io/directorDeskDom";

const DEFAULT_MOVE_SPEED = 6;
const MAX_FRAME_DELTA = 0.05;
const HORIZONTAL_EPSILON = 1e-8;

const DIRECTOR_MOVEMENT_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "ShiftLeft",
  "ShiftRight",
]);

export interface DirectorMovementIntent {
  forward: number;
  strafe: number;
  vertical: number;
}

export interface DirectorKeyboardControllerProps {
  active: boolean;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  moveSpeed?: number;
}

/** 判断物理按键是否用于导演视图导航。 */
export function isDirectorMovementCode(code: string) {
  return DIRECTOR_MOVEMENT_CODES.has(code);
}

/** 将当前按键集合转换为基于坐标轴的归一化操作意图。 */
export function getDirectorMovementIntent(pressedCodes: ReadonlySet<string>): DirectorMovementIntent {
  return {
    forward: Number(pressedCodes.has("KeyW")) - Number(pressedCodes.has("KeyS")),
    strafe: Number(pressedCodes.has("KeyD")) - Number(pressedCodes.has("KeyA")),
    vertical:
      Number(pressedCodes.has("Space")) -
      Number(pressedCodes.has("ShiftLeft") || pressedCodes.has("ShiftRight")),
  };
}

/**
 * 在不修改任一输入值的情况下构建世界空间移动方向。
 * 前进方向会投影到地面平面，因此抬头或低头不会使 W/S 改变高度。
 * 对斜向移动做归一化处理，避免产生额外的速度增益。
 */
export function getDirectorMovementDirection(
  intent: DirectorMovementIntent,
  cameraForward: Vector3,
  fallbackForward = new Vector3(0, 0, -1)
) {
  const forward = new Vector3(cameraForward.x, 0, cameraForward.z);
  if (forward.lengthSq() <= HORIZONTAL_EPSILON) {
    forward.set(fallbackForward.x, 0, fallbackForward.z);
  }
  if (forward.lengthSq() <= HORIZONTAL_EPSILON) {
    forward.set(0, 0, -1);
  }
  forward.normalize();

  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const movement = forward
    .multiplyScalar(intent.forward)
    .addScaledVector(right, intent.strafe)
    .addScaledVector(new Vector3(0, 1, 0), intent.vertical);

  if (movement.lengthSq() > 1) movement.normalize();
  return movement;
}

/** 文本控件、按钮以及可编辑内容中的任意节点均返回 true。 */
export function isEditableDirectorEventTarget(target: EventTarget | null) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;

  if (target.closest("input, textarea, select, button")) return true;

  let element: Element | null = target;
  while (element) {
    const contentEditable = element.getAttribute("contenteditable");
    if (contentEditable !== null) {
      return contentEditable.toLowerCase() !== "false";
    }
    if (element instanceof HTMLElement && element.isContentEditable) return true;
    element = element.parentElement;
  }

  return false;
}

/**
 * 常规导演视图的键盘飞行控制器。
 * 此组件必须挂载在 R3F Canvas 内，并与对应的 OrbitControls 相邻。
 */
export function DirectorKeyboardController({
  active,
  controlsRef,
  moveSpeed = DEFAULT_MOVE_SPEED,
}: DirectorKeyboardControllerProps) {
  const { camera, invalidate } = useThree();
  const pressedCodesRef = useRef(new Set<string>());
  const cameraForwardRef = useRef(new Vector3());
  const lastHorizontalForwardRef = useRef(new Vector3(0, 0, -1));
  const movementRef = useRef(new Vector3());
  const rightRef = useRef(new Vector3());
  const worldUpRef = useRef(new Vector3(0, 1, 0));

  useEffect(() => {
    const pressedCodes = pressedCodesRef.current;
    pressedCodes.clear();
    if (!active) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableDirectorEventTarget(getDirectorDeskEventTarget(event)) ||
        !isDirectorMovementCode(event.code)
      ) {
        return;
      }

      event.preventDefault();
      pressedCodes.add(event.code);
      invalidate();
    }

    function handleKeyUp(event: KeyboardEvent) {
      pressedCodes.delete(event.code);
    }

    function clearPressedCodes() {
      pressedCodes.clear();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", clearPressedCodes);

    return () => {
      pressedCodes.clear();
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", clearPressedCodes);
    };
  }, [active, invalidate]);

  useFrame((_state, delta) => {
    if (!active) return;

    const controls = controlsRef.current;
    if (!controls) return;

    const intent = getDirectorMovementIntent(pressedCodesRef.current);
    if (intent.forward === 0 && intent.strafe === 0 && intent.vertical === 0) return;

    camera.getWorldDirection(cameraForwardRef.current);
    if (
      cameraForwardRef.current.x * cameraForwardRef.current.x +
        cameraForwardRef.current.z * cameraForwardRef.current.z >
      HORIZONTAL_EPSILON
    ) {
      lastHorizontalForwardRef.current
        .set(cameraForwardRef.current.x, 0, cameraForwardRef.current.z)
        .normalize();
    }

    rightRef.current
      .crossVectors(lastHorizontalForwardRef.current, worldUpRef.current)
      .normalize();
    const movement = movementRef.current
      .copy(lastHorizontalForwardRef.current)
      .multiplyScalar(intent.forward)
      .addScaledVector(rightRef.current, intent.strafe)
      .addScaledVector(worldUpRef.current, intent.vertical);
    if (movement.lengthSq() > 1) movement.normalize();
    movement.multiplyScalar(Math.max(0, moveSpeed) * Math.min(Math.max(delta, 0), MAX_FRAME_DELTA));

    camera.position.add(movement);
    controls.target.add(movement);
    camera.updateMatrixWorld();
    controls.update();
    invalidate();
  });

  return null;
}

export default DirectorKeyboardController;
