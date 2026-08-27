import { useCallback } from "react";
import { useAppStore } from "../../../store/useAppStore";

export type DirectorDeskText = (zhCN: string, enUS: string) => string;

/** 让导演台界面直接跟随项目的全局语言设置。 */
export function useDirectorDeskText(): DirectorDeskText {
  const language = useAppStore((state) => state.language);

  return useCallback(
    (zhCN, enUS) => (language === "en-US" ? enUS : zhCN),
    [language],
  );
}
