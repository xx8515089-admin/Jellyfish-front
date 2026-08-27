import { Download, Gauge, Play, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDirectorStore } from "../store/directorStore";
import { isDirectorDeskEventInside } from "../io/directorDeskDom";
import {
  PERFORMANCE_PROFILE_OPTIONS,
  PERFORMANCE_PROFILE_CONFIGS,
  getEffectivePerformanceProfile,
} from "./performanceProfiles";
import {
  getAutomaticPerformanceRuntimeSnapshot,
  subscribeAutomaticPerformanceRuntime,
} from "./automaticPerformanceRuntime";
import {
  PERFORMANCE_BENCHMARK_COMPLETE_EVENT,
  buildPerformanceBenchmarkUrl,
  downloadPerformanceBenchmarkReport,
} from "./performanceBenchmarkReport";
import {
  PERFORMANCE_BENCHMARK_SCENES,
  getPerformanceBenchmarkMode,
  type DirectorBenchmarkReport,
} from "./performanceBenchmark";
import { useDirectorDeskText } from "../../useDirectorDeskText";

const PERFORMANCE_BENCHMARK_LABELS_EN = {
  standard: "Historical load",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
} as const;

export function PerformanceSettings() {
  const text = useDirectorDeskText();
  const profile = useDirectorStore((state) => state.performanceProfile);
  const setProfile = useDirectorStore((state) => state.setPerformanceProfile);
  const [open, setOpen] = useState(false);
  const [benchmarkStatus, setBenchmarkStatus] = useState(() => window.__DIRECTOR_BENCHMARK_STATUS__);
  const [benchmarkReport, setBenchmarkReport] = useState<DirectorBenchmarkReport | null>(
    () => window.__DIRECTOR_BENCHMARK_REPORT__ ?? null
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const automaticRuntime = useSyncExternalStore(
    subscribeAutomaticPerformanceRuntime,
    getAutomaticPerformanceRuntimeSnapshot,
    getAutomaticPerformanceRuntimeSnapshot
  );
  const effectiveProfile = profile === "auto"
    ? PERFORMANCE_PROFILE_CONFIGS[automaticRuntime.effectiveProfileId]
    : getEffectivePerformanceProfile(profile);
  const benchmarkMode = getPerformanceBenchmarkMode(window.location.search);
  const selectedOption = PERFORMANCE_PROFILE_OPTIONS.find((option) => option.id === profile)
    ?? PERFORMANCE_PROFILE_OPTIONS[0];
  const profileCopy = {
    auto: [text("自动", "Auto"), text("根据电脑性能自动选择", "Choose automatically for this device")],
    fluid: [text("流畅", "Smooth"), text("优先降低卡顿，适合 Windows 集显和大场景", "Prioritize smooth editing for integrated graphics and large scenes")],
    balanced: [text("均衡", "Balanced"), text("平衡画质与编辑流畅度", "Balance image quality and editing performance")],
    quality: [text("高清", "Quality"), text("优先保证画面清晰，适合性能较强的电脑", "Prioritize clarity on higher-performance devices")],
  } as const;
  const selectedOptionCopy = profileCopy[selectedOption.id];
  const effectiveProfileLabel = profileCopy[effectiveProfile.id][0];

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (isDirectorDeskEventInside(event, wrapperRef.current)) return;
      setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!benchmarkMode) return;
    function updateBenchmarkResult(event: Event) {
      const detail = (event as CustomEvent<DirectorBenchmarkReport>).detail;
      setBenchmarkReport(detail);
      setBenchmarkStatus("complete");
    }
    const interval = window.setInterval(() => {
      setBenchmarkStatus(window.__DIRECTOR_BENCHMARK_STATUS__);
    }, 250);
    window.addEventListener(PERFORMANCE_BENCHMARK_COMPLETE_EVENT, updateBenchmarkResult);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(PERFORMANCE_BENCHMARK_COMPLETE_EVENT, updateBenchmarkResult);
    };
  }, [benchmarkMode]);

  function openBenchmark(mode: "light" | "medium" | "heavy") {
    const url = buildPerformanceBenchmarkUrl(window.location.href, mode, effectiveProfile.id);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="performance-settings" ref={wrapperRef}>
      <button
        ref={triggerRef}
        aria-label={`${text("性能", "Performance")} ${selectedOptionCopy[0]}`}
        aria-controls="performance-settings-popover"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`performance-settings-trigger${open ? " is-active" : ""}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <Gauge aria-hidden="true" size={15} strokeWidth={1.9} />
        <span>{text("性能", "Performance")}</span>
        <small>{selectedOptionCopy[0]}</small>
      </button>

      {open ? (
        <section
          id="performance-settings-popover"
          aria-label={text("性能档位设置", "Performance profile settings")}
          className="performance-settings-popover"
          role="dialog"
        >
          <header className="performance-settings-header">
            <div>
              <strong>{text("性能档位", "Performance profile")}</strong>
              <small>{text("切换后立即生效，并自动保存", "Changes apply immediately and save automatically")}</small>
            </div>
            <button aria-label={text("关闭性能档位设置", "Close performance settings")} type="button" onClick={() => setOpen(false)}>
              <X aria-hidden="true" size={15} />
            </button>
          </header>

          <div className="performance-profile-list" role="radiogroup" aria-label={text("选择性能档位", "Choose performance profile")}>
            {PERFORMANCE_PROFILE_OPTIONS.map((option) => {
              const checked = option.id === profile;
              const optionCopy = profileCopy[option.id];
              return (
                <button
                  key={option.id}
                  aria-checked={checked}
                  aria-label={`${optionCopy[0]}: ${optionCopy[1]}`}
                  className={checked ? "is-selected" : ""}
                  role="radio"
                  type="button"
                  onClick={() => setProfile(option.id)}
                >
                  <span className="performance-profile-radio" aria-hidden="true" />
                  <span><strong>{optionCopy[0]}</strong><small>{optionCopy[1]}</small></span>
                </button>
              );
            })}
          </div>

          <p aria-label={text("当前实际性能档位", "Current effective performance profile")} className="performance-settings-status">
            {text("当前实际使用：", "Currently using: ")}<strong>{effectiveProfileLabel}</strong>
            {profile === "auto" && automaticRuntime.averageFps !== null
              ? text(`，最近约 ${automaticRuntime.averageFps} FPS`, `, recently about ${automaticRuntime.averageFps} FPS`)
              : null}{text("。只影响编辑预览，视频导出仍按导出面板选择的 720p / 1080p 生成。", ". This only affects the editor preview; exported video still uses the 720p / 1080p selected in the export panel.")}
          </p>

          <section className="performance-benchmark-tools" aria-label={text("标准性能测试", "Standard performance benchmark")}>
            <header>
              <strong>{text("标准性能测试", "Standard performance benchmark")}</strong>
              <small>{text("在新标签运行固定场景，不会改动当前导演台", "Run a fixed scene in a new tab without changing this director desk")}</small>
            </header>
            <div className="performance-benchmark-actions">
              {(["light", "medium", "heavy"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => openBenchmark(mode)}>
                  <Play aria-hidden="true" size={13} />
                  <span>{text(PERFORMANCE_BENCHMARK_SCENES[mode].label, PERFORMANCE_BENCHMARK_LABELS_EN[mode])}</span>
                </button>
              ))}
            </div>
            {benchmarkMode ? (
              <div className="performance-benchmark-result" role="status">
                {benchmarkReport ? (
                  <>
                    <span>
                      {benchmarkReport.averageFps} FPS · {text("低帧", "1% low")} {benchmarkReport.onePercentLowFps} FPS
                    </span>
                    <button type="button" onClick={() => downloadPerformanceBenchmarkReport(benchmarkReport)}>
                      <Download aria-hidden="true" size={13} />
                      {text("下载匿名报告", "Download anonymous report")}
                    </button>
                  </>
                ) : (
                  <span>{benchmarkStatus === "sampling" ? text("正在采样…", "Sampling...") : text("正在预热场景…", "Warming up scene...")}</span>
                )}
              </div>
            ) : null}
          </section>
        </section>
      ) : null}
      {benchmarkMode ? (
        <aside className="performance-benchmark-hud" role="status" aria-label={text("性能基准进度", "Performance benchmark progress")}>
          <div>
            <strong>
              {text(
                PERFORMANCE_BENCHMARK_SCENES[benchmarkMode].label,
                PERFORMANCE_BENCHMARK_LABELS_EN[benchmarkMode]
              )} {text("性能基准", "benchmark")}
            </strong>
            <small>{effectiveProfileLabel}</small>
          </div>
          {benchmarkReport ? (
            <>
              <span>{benchmarkReport.averageFps} FPS · 1% Low {benchmarkReport.onePercentLowFps}</span>
              <button type="button" onClick={() => downloadPerformanceBenchmarkReport(benchmarkReport)}>
                <Download aria-hidden="true" size={13} />
                {text("下载匿名报告", "Download anonymous report")}
              </button>
            </>
          ) : (
            <span>{benchmarkStatus === "sampling"
              ? text("正在采样，约 6 秒", "Sampling, about 6 seconds")
              : text("正在预热场景，约 2 秒", "Warming up scene, about 2 seconds")}</span>
          )}
        </aside>
      ) : null}
    </div>
  );
}
