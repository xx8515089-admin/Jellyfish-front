type MaybeAsyncVoid = void | PromiseLike<void>;

type PointerLockRequest = (this: HTMLElement) => MaybeAsyncVoid;
type PointerLockExit = (this: Document) => MaybeAsyncVoid;

/**
 * 请求 Pointer Lock，同时屏蔽浏览器或嵌入宿主产生的失败。
 * 返回 `true` 表示宿主已接受调用；调用方需要确认状态时，可以监听
 * `pointerlockchange`，或使用 `isPointerLockedTo`。
 */
export async function requestPointerLockSafely(element: HTMLElement): Promise<boolean> {
  const request = element.requestPointerLock as unknown as PointerLockRequest | undefined;
  if (typeof request !== "function") return false;

  try {
    await request.call(element);
    return true;
  } catch {
    return false;
  }
}

/** 安全释放 Pointer Lock，并兼容返回 Promise 的宿主。 */
export async function exitPointerLockSafely(): Promise<boolean> {
  if (typeof document === "undefined") return false;

  const exit = document.exitPointerLock as unknown as PointerLockExit | undefined;
  if (typeof exit !== "function") return false;

  try {
    await exit.call(document);
    return true;
  } catch {
    return false;
  }
}

/** 判断指定元素当前是否持有 Pointer Lock。 */
export function isPointerLockedTo(element: HTMLElement): boolean {
  if (typeof document === "undefined") return false;
  if (document.pointerLockElement === element) return true;

  const root = element.getRootNode();
  return typeof ShadowRoot !== "undefined"
    && root instanceof ShadowRoot
    && root.pointerLockElement === element;
}
