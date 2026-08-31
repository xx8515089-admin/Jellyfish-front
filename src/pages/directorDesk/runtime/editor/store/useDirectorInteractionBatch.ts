import { useCallback, useEffect, useRef } from "react";
import { useDirectorStore } from "./directorStore";

/**
 * 将一次连续交互合并成一个撤销记录，并把持久化延迟到交互结束。
 * 拖拽、滑杆和其他高频输入统一使用这个钩子，避免每帧复制并序列化完整工程。
 */
export function useDirectorInteractionBatch(onCommit?: () => void) {
  const beginUndoBatch = useDirectorStore((state) => state.beginUndoBatch);
  const endUndoBatch = useDirectorStore((state) => state.endUndoBatch);
  const interactionActiveRef = useRef(false);
  const onCommitRef = useRef(onCommit);

  onCommitRef.current = onCommit;

  const beginInteraction = useCallback(() => {
    if (interactionActiveRef.current) return;

    interactionActiveRef.current = true;
    beginUndoBatch();
  }, [beginUndoBatch]);

  const endInteraction = useCallback(() => {
    if (!interactionActiveRef.current) return;

    interactionActiveRef.current = false;
    try {
      onCommitRef.current?.();
    } finally {
      endUndoBatch();
    }
  }, [endUndoBatch]);

  useEffect(() => () => {
    if (!interactionActiveRef.current) return;

    interactionActiveRef.current = false;
    try {
      onCommitRef.current?.();
    } finally {
      endUndoBatch();
    }
  }, [endUndoBatch]);

  return { beginInteraction, endInteraction };
}
