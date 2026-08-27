import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowDown, ArrowRight, BookOpen, Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Hand, House, Keyboard, MousePointer2, Plus, Route, Sparkles, Trash2, X } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { directorHomeCopy } from "./directorHomeCopy";
import { DirectorDeskShell } from "./app/layout/DirectorDeskShell";
import { DirectorCanvas } from "./editor/canvas/DirectorCanvas";
import { ViewportSensitivitySettings } from "./editor/canvas/ViewportSensitivitySettings";
import {
  clearDirectorDeskHostBridge,
  DIRECTOR_DESK_SESSION_OPENED_EVENT,
  initDirectorDeskHostBridge,
  postDirectorDeskMessageToHost,
} from "./editor/io/hostBridge";
import { useDirectorStore } from "./editor/store/directorStore";
import {
  createDirectorDeskRecord,
  deleteDirectorDeskRecord,
  ensureDirectorDeskRecordForId,
  ensureDirectorDeskRecords,
  getInitialDirectorDeskId,
  touchDirectorDeskRecord,
  writeActiveDirectorDeskId,
  writeDirectorDeskRecords,
  type DirectorDeskRecord,
} from "./editor/workspaces/directorDeskRegistry";
import {
  createPerformanceBenchmarkProject,
  getPerformanceBenchmarkSceneConfig,
  getPerformanceBenchmarkMode,
  getPerformanceBenchmarkPlayback,
} from "./editor/performance/performanceBenchmark";
import { getBenchmarkPerformanceProfile } from "./editor/performance/performanceProfiles";
import { PerformanceSettings } from "./editor/performance/PerformanceSettings";
import { getDirectorDeskEventTarget } from "./editor/io/directorDeskDom";
import { useDirectorDeskText } from "./useDirectorDeskText";

type AppScreen = "home" | "editor";

const HOME_DESK_PAGE_SIZE = 6;

const PERFORMANCE_BENCHMARK_LABELS_EN = {
  standard: "Historical load",
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
} as const;

type HomePaginationItem = number | "start-ellipsis" | "end-ellipsis";

function createHomePaginationItems(currentPage: number, pageCount: number): HomePaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const visiblePages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 4) {
    [2, 3, 4, 5].forEach((page) => visiblePages.add(page));
  }
  if (currentPage >= pageCount - 3) {
    [pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1].forEach((page) => visiblePages.add(page));
  }

  const pages = [...visiblePages]
    .filter((page) => page > 0 && page <= pageCount)
    .sort((left, right) => left - right);
  const items: HomePaginationItem[] = [];

  pages.forEach((page, index) => {
    const previousPage = pages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push(previousPage === 1 ? "start-ellipsis" : "end-ellipsis");
    }
    items.push(page);
  });

  return items;
}

interface DirectorDeskAppProps {
  initialInstanceId?: string;
  initialInstanceName?: string;
  onBackHome?: () => void;
  onClose?: () => void;
  onOpenDesk?: (id: string) => void;
}

function getUrlDirectorDeskInstanceId() {
  try {
    return new URLSearchParams(window.location.search).get("instanceId")?.trim() || null;
  } catch {
    return null;
  }
}

function updateUrlDirectorDeskInstanceId(id: string | null) {
  try {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("instanceId", id);
    } else {
      url.searchParams.delete("instanceId");
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // 即使嵌入宿主阻止写入 History API，也要保证导航状态可用。
  }
}

function createInitialDirectorDeskViewState(
  initialInstanceId?: string,
  initialInstanceName?: string,
  language: "zh-CN" | "en-US" = "zh-CN"
) {
  let records = ensureDirectorDeskRecords();
  const urlInstanceId = initialInstanceId?.trim() ?? getUrlDirectorDeskInstanceId() ?? null;
  if (urlInstanceId) {
    const ensured = ensureDirectorDeskRecordForId(records, urlInstanceId);
    records = ensured.records;
    const nextName = initialInstanceName?.trim();
    if (nextName && ensured.record.name !== nextName) {
      records = records.map((record) => (
        record.id === urlInstanceId ? { ...record, name: nextName } : record
      ));
      writeDirectorDeskRecords(records);
    }
  }
  const benchmarkMode = getPerformanceBenchmarkMode(window.location.search);
  if (benchmarkMode) {
    const timestamp = new Date().toISOString();
    const benchmarkId = urlInstanceId ?? "benchmark_standard";
    const benchmarkLabel = language === "en-US"
      ? PERFORMANCE_BENCHMARK_LABELS_EN[benchmarkMode]
      : getPerformanceBenchmarkSceneConfig(benchmarkMode).label;
    const benchmarkRecord: DirectorDeskRecord = {
      id: benchmarkId,
      name: language === "en-US"
        ? `${benchmarkLabel} performance benchmark (temporary)`
        : `${benchmarkLabel}性能基准（临时）`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return {
      records: [...records.filter((record) => record.id !== benchmarkId), benchmarkRecord],
      activeDeskId: benchmarkId,
      screen: "editor" as AppScreen,
    };
  }
  return {
    records,
    activeDeskId: urlInstanceId ?? getInitialDirectorDeskId(records) ?? records[0]?.id ?? "",
    screen: urlInstanceId ? "editor" : ("home" as AppScreen),
  };
}

function formatDirectorDeskUpdatedAt(value: string, language: 'zh-CN' | 'en-US') {
  const copy = directorHomeCopy[language];
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return copy.justUpdated;

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return copy.justUpdated;
  if (diffMinutes < 60) return copy.minutesAgo(diffMinutes);
  if (diffMinutes < 1440) return copy.hoursAgo(Math.round(diffMinutes / 60));

  return new Intl.DateTimeFormat(language, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function DirectorDeskApp({ initialInstanceId, initialInstanceName, onBackHome, onClose, onOpenDesk }: DirectorDeskAppProps) {
  const language = useAppStore((state) => state.language);
  const text = useDirectorDeskText();
  const homeCopy = directorHomeCopy[language];
  const benchmarkMode = getPerformanceBenchmarkMode(window.location.search);
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);
  const motionStudioOpen = useDirectorStore((state) => state.motionStudioOpen);
  const setMotionStudioOpen = useDirectorStore((state) => state.setMotionStudioOpen);
  const [directorDeskView, setDirectorDeskView] = useState(() => (
    createInitialDirectorDeskViewState(initialInstanceId, initialInstanceName, language)
  ));
  const [deleteDeskCandidate, setDeleteDeskCandidate] = useState<DirectorDeskRecord | null>(null);
  const [homePage, setHomePage] = useState(1);
  const [deskSwitcherOpen, setDeskSwitcherOpen] = useState(false);
  const deskSwitcherRef = useRef<HTMLDivElement>(null);
  const { records: directorDesks, activeDeskId, screen } = directorDeskView;
  const activeDirectorDesk = directorDesks.find((desk) => desk.id === activeDeskId) ?? directorDesks[0];
  const homePageCount = Math.max(1, Math.ceil(directorDesks.length / HOME_DESK_PAGE_SIZE));
  const currentHomePage = Math.min(homePage, homePageCount);
  const homePaginationItems = createHomePaginationItems(currentHomePage, homePageCount);
  const visibleDirectorDesks = directorDesks.slice(
    (currentHomePage - 1) * HOME_DESK_PAGE_SIZE,
    currentHomePage * HOME_DESK_PAGE_SIZE
  );

  function openDirectorDesk(
    id: string,
    records = directorDesks,
    options: { loadScene?: boolean } = {}
  ) {
    if (!id) return;

    const { loadScene = true } = options;
    const ensured = ensureDirectorDeskRecordForId(records, id);
    const nextRecords = touchDirectorDeskRecord(ensured.records, id);
    if (screen === "home" && onOpenDesk) {
      writeActiveDirectorDeskId(id);
      onOpenDesk(id);
      return;
    }
    setDirectorDeskView({ records: nextRecords, activeDeskId: id, screen: "editor" });
    writeActiveDirectorDeskId(id);
    updateUrlDirectorDeskInstanceId(id);
    if (loadScene) {
      useDirectorStore.getState().openScopedScene(id);
    }
  }

  function backToHome() {
    if (onBackHome) {
      onBackHome();
      return;
    }

    const records = ensureDirectorDeskRecords();
    setDirectorDeskView({ records, activeDeskId, screen: "home" });
    updateUrlDirectorDeskInstanceId(null);
  }

  useEffect(() => {
    initDirectorDeskHostBridge();
    if (screen === "editor" && !benchmarkMode) {
      openDirectorDesk(activeDeskId, directorDesks);
    }

    if (benchmarkMode) {
      const state = useDirectorStore.getState();
      const benchmarkProfile = getBenchmarkPerformanceProfile(window.location.search);
      const benchmarkPlayback = getPerformanceBenchmarkPlayback(window.location.search);
      const benchmarkScene = getPerformanceBenchmarkSceneConfig(benchmarkMode);
      useDirectorStore.setState({
        ...state,
        project: createPerformanceBenchmarkProject(benchmarkMode),
        viewMode: "director",
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedCrowdId: null,
        selectedCameraKeyframeId: null,
        selectedCameraKeyframeIds: [],
        selectedObjectMotionKeyframeId: null,
        showCharacterRoutes: false,
        motionStudioOpen: benchmarkScene.monitorEnabled,
        cameraMotionProgress: benchmarkPlayback.progress,
        cameraMotionPlaying: benchmarkPlayback.playing,
        ...(benchmarkProfile ? { performanceProfile: benchmarkProfile } : {}),
      });
    }

    postDirectorDeskMessageToHost({ type: "storyai:director-desk-ready" });

    return clearDirectorDeskHostBridge;
  }, []);

  useEffect(() => {
    function handleHostSessionOpened(event: Event) {
      const instanceId = (event as CustomEvent<{ instanceId?: string }>).detail?.instanceId;
      if (instanceId) {
        openDirectorDesk(instanceId, directorDesks, { loadScene: false });
      }
    }

    window.addEventListener(DIRECTOR_DESK_SESSION_OPENED_EVENT, handleHostSessionOpened);
    return () => window.removeEventListener(DIRECTOR_DESK_SESSION_OPENED_EVENT, handleHostSessionOpened);
  }, [directorDesks]);

  useEffect(() => {
    if (!deskSwitcherOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      deskSwitcherRef.current
        ?.querySelector<HTMLButtonElement>(".director-desk-option.is-selected")
        ?.focus();
    });

    function handlePointerDown(event: MouseEvent) {
      if (!deskSwitcherRef.current?.contains(event.target as Node)) {
        setDeskSwitcherOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDeskSwitcherOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [deskSwitcherOpen]);

  function handleDeskMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const options = Array.from(
      deskSwitcherRef.current?.querySelectorAll<HTMLButtonElement>(".director-desk-option") ?? []
    );
    if (options.length === 0) return;

    event.preventDefault();
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + options.length) % options.length
          : (currentIndex - 1 + options.length) % options.length;
    options[nextIndex]?.focus();
  }

  function handleCreateDesk() {
    const record = createDirectorDeskRecord(directorDesks);
    const nextRecords = [...directorDesks, record];
    writeDirectorDeskRecords(nextRecords);
    openDirectorDesk(record.id, nextRecords);
  }

  function handleConfirmDeleteDesk() {
    if (!deleteDeskCandidate) return;

    const result = deleteDirectorDeskRecord(directorDesks, deleteDeskCandidate.id);
    setDirectorDeskView({
      records: result.records,
      activeDeskId: result.activeId ?? result.records[0]?.id ?? "",
      screen: "home",
    });
    setDeleteDeskCandidate(null);
  }

  function handleClose() {
    if (onClose) {
      onClose();
      return;
    }
    postDirectorDeskMessageToHost({ type: "storyai:director-desk-close" });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(getDirectorDeskEventTarget(event))) return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.repeat) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        useDirectorStore.getState().copySelectedObjects();
        return;
      }

      if (key === "v") {
        event.preventDefault();
        useDirectorStore.getState().pasteClipboardObjects();
        return;
      }

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        useDirectorStore.getState().undo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!deleteDeskCandidate) return;

    function handleDeleteDialogKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDeleteDeskCandidate(null);
    }

    window.addEventListener("keydown", handleDeleteDialogKeyDown);
    return () => window.removeEventListener("keydown", handleDeleteDialogKeyDown);
  }, [deleteDeskCandidate]);

  useEffect(() => {
    if (homePage <= homePageCount) return;
    setHomePage(homePageCount);
  }, [homePage, homePageCount]);

  if (screen === "home") {
    return (
      <>
        <main className="director-home-shell">
          <section className="director-home-workspace">
            <header className="director-home-hero">
              <div>
                <p className="director-home-kicker">Standalone 3D Director Desk</p>
                <h1>{homeCopy.heroTitle}</h1>
                <p>{homeCopy.heroDescription}</p>
              </div>
              <div className="director-home-hero-actions">
                <button className="director-home-primary-button" type="button" onClick={handleCreateDesk}>
                  <Plus aria-hidden="true" size={17} />
                  {homeCopy.createDesk}
                </button>
                <a className="director-home-scroll-hint" href="#director-home-guide-title">
                  {homeCopy.scrollHint}
                  <ArrowDown aria-hidden="true" size={14} />
                </a>
              </div>
            </header>

            <section className="director-home-list-panel" aria-label={homeCopy.myDesks}>
              {directorDesks.length ? (
                <div className="director-home-grid" aria-label={homeCopy.deskListAria}>
                  {visibleDirectorDesks.map((desk, index) => {
                    const absoluteIndex = (currentHomePage - 1) * HOME_DESK_PAGE_SIZE + index;
                    return (
                      <article
                        key={desk.id}
                        className={`director-home-card ${desk.id === activeDeskId ? "is-active" : ""}`}
                      >
                        <button className="director-home-card-main" type="button" onClick={() => openDirectorDesk(desk.id)}>
                          <span className="director-home-card-icon">
                            <Boxes aria-hidden="true" size={21} strokeWidth={1.8} />
                          </span>
                          <span className="director-home-card-content">
                            <span className="director-home-card-title">{desk.name}</span>
                            <span className="director-home-card-meta">
                              <Clock3 aria-hidden="true" size={13} />
                              {formatDirectorDeskUpdatedAt(desk.updatedAt, language)}
                            </span>
                          </span>
                          <span className="director-home-card-index">{String(absoluteIndex + 1).padStart(2, "0")}</span>
                          <ArrowRight className="director-home-card-arrow" aria-hidden="true" size={18} />
                        </button>
                        <button
                          className="director-home-card-delete"
                          type="button"
                          aria-label={homeCopy.deleteDeskAria(desk.name)}
                          onClick={() => setDeleteDeskCandidate(desk)}
                        >
                          <Trash2 aria-hidden="true" size={15} strokeWidth={1.9} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="director-home-empty" aria-label={homeCopy.emptyListAria}>
                  <Boxes aria-hidden="true" size={28} strokeWidth={1.6} />
                  <h2>{homeCopy.emptyTitle}</h2>
                  <p>{homeCopy.emptyDescription}</p>
                </div>
              )}

              {homePageCount > 1 ? (
                <footer className="director-home-pagination" aria-label={homeCopy.paginationAria}>
                  <span>{homeCopy.deskCount(directorDesks.length)}</span>
                  <div className="director-home-pagination-controls">
                    <button
                      className="director-home-pagination-nav"
                      type="button"
                      aria-label={homeCopy.previousPage}
                      disabled={currentHomePage <= 1}
                      onClick={() => setHomePage((page) => Math.max(1, page - 1))}
                    >
                      <ChevronLeft aria-hidden="true" size={17} />
                    </button>
                    {homePaginationItems.map((item) => (
                      typeof item === "number" ? (
                        <button
                          className={`director-home-page-number${item === currentHomePage ? " is-active" : ""}`}
                          type="button"
                          aria-current={item === currentHomePage ? "page" : undefined}
                          key={item}
                          onClick={() => setHomePage(item)}
                        >
                          {item}
                        </button>
                      ) : (
                        <span className="director-home-page-ellipsis" aria-hidden="true" key={item}>...</span>
                      )
                    ))}
                    <button
                      className="director-home-pagination-nav"
                      type="button"
                      aria-label={homeCopy.nextPage}
                      disabled={currentHomePage >= homePageCount}
                      onClick={() => setHomePage((page) => Math.min(homePageCount, page + 1))}
                    >
                      <ChevronRight aria-hidden="true" size={17} />
                    </button>
                  </div>
                </footer>
              ) : null}
            </section>
          </section>

          <section className="director-home-guide" aria-labelledby="director-home-guide-title">
          <header className="director-home-section-heading">
            <span><BookOpen aria-hidden="true" size={16} />{homeCopy.quickStartBadge}</span>
            <div>
              <h2 id="director-home-guide-title">{homeCopy.quickStartTitle}</h2>
              <p>{homeCopy.quickStartDescription}</p>
            </div>
          </header>
          <ol className="director-home-steps">
            {homeCopy.quickStartSteps.map(([title, description], index) => (
              <li key={title}>
                <span>{index + 1}</span>
                <div><strong>{title}</strong><p>{description}</p></div>
              </li>
            ))}
          </ol>
          <p className="director-home-shortcuts">
            <strong>{homeCopy.cameraShortcuts}</strong>
            <kbd>WASD</kbd>{homeCopy.move}
            <kbd>Q / E</kbd>{homeCopy.descendAscend}
            <kbd>Enter</kbd>{homeCopy.saveShot}
            <kbd>Space</kbd>{homeCopy.playPause}
            <kbd>Esc</kbd>{homeCopy.exitCamera}
          </p>
          </section>

          <section className="director-home-release" aria-labelledby="director-home-release-title">
          <header className="director-home-section-heading">
            <span><Sparkles aria-hidden="true" size={16} />{homeCopy.releaseBadge}</span>
            <div>
              <h2 id="director-home-release-title">{homeCopy.releaseTitle}</h2>
              <p>{homeCopy.releaseDescription}</p>
            </div>
          </header>
          <ul className="director-home-release-list">
            {homeCopy.releaseNotes.map((note) => (
              <li key={note}><Check aria-hidden="true" size={15} /><span>{note}</span></li>
            ))}
          </ul>
          </section>

          <section className="director-home-controls" aria-labelledby="director-home-controls-title">
          <header className="director-home-section-heading">
            <span><Keyboard aria-hidden="true" size={16} />{homeCopy.controlsBadge}</span>
            <div>
              <h2 id="director-home-controls-title">{homeCopy.controlsTitle}</h2>
              <p>{homeCopy.controlsDescription}</p>
            </div>
          </header>

          <div className="director-home-control-grid">
            {homeCopy.controlGroups.map((group) => (
              <article key={group.title} className="director-home-control-group">
                <header><MousePointer2 aria-hidden="true" size={15} /><div><h3>{group.title}</h3><p>{group.description}</p></div></header>
                <dl>
                  {group.controls.map(([keys, action]) => (
                    <div key={keys}><dt>{keys}</dt><dd>{action}</dd></div>
                  ))}
                </dl>
              </article>
            ))}
          </div>

          <article className="director-home-mac-gestures">
            <header><Hand aria-hidden="true" size={17} /><div><h3>{homeCopy.macTitle}</h3><p>{homeCopy.macDescription}</p></div></header>
            <dl>
              {homeCopy.macGestures.map(([gesture, action]) => (
                <div key={gesture}><dt>{gesture}</dt><dd>{action}</dd></div>
              ))}
            </dl>
          </article>

          <article className="director-home-tools-guide">
            <h3>{homeCopy.toolsTitle}</h3>
            <dl>
              {homeCopy.toolGroups.map(([area, actions]) => (
                <div key={area}><dt>{area}</dt><dd>{actions}</dd></div>
              ))}
            </dl>
          </article>
          </section>
        </main>

        {deleteDeskCandidate && (
          <div
            className="director-home-confirm-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDeleteDeskCandidate(null);
            }}
          >
            <section
              className="director-home-confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="director-delete-dialog-title"
              aria-describedby="director-delete-dialog-description"
            >
              <h2 id="director-delete-dialog-title">{homeCopy.deleteTitle}</h2>
              <p id="director-delete-dialog-description">
                {homeCopy.deleteDescription(deleteDeskCandidate.name)}
              </p>
              <div className="director-home-confirm-actions">
                <button
                  className="director-home-confirm-button"
                  type="button"
                  autoFocus
                  onClick={() => setDeleteDeskCandidate(null)}
                >
                  {homeCopy.cancel}
                </button>
                <button
                  className="director-home-confirm-button is-danger"
                  type="button"
                  onClick={handleConfirmDeleteDesk}
                >
                  {homeCopy.delete}
                </button>
              </div>
            </section>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <button className="top-bar-title top-bar-home-button" type="button" onClick={backToHome}>
            {language === 'en-US' ? '3D Director Desk' : '3D导演台'}
          </button>
          <span className="top-bar-version" aria-label={`${text("当前版本", "Current version")} v${__APP_VERSION__}`}>v{__APP_VERSION__}</span>
          <button className="top-bar-home-nav-button" type="button" aria-label={homeCopy.backHome} onClick={backToHome}>
            <House aria-hidden="true" size={14} strokeWidth={1.9} />
            {homeCopy.home}
          </button>
          <div className="director-desk-switcher" aria-label={homeCopy.deskSelector} ref={deskSwitcherRef}>
            <div className="director-desk-select-shell">
              <button
              aria-expanded={deskSwitcherOpen}
              aria-haspopup="listbox"
              aria-label={homeCopy.selectDesk}
              className="director-desk-select"
              type="button"
              onClick={() => setDeskSwitcherOpen((current) => !current)}
              onKeyDown={(event) => {
                if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                  event.preventDefault();
                  setDeskSwitcherOpen(true);
                }
              }}
            >
                <span>{activeDirectorDesk?.name ?? homeCopy.selectDesk}</span>
                <ChevronDown aria-hidden="true" className="director-desk-select-chevron" size={14} strokeWidth={1.8} />
              </button>
              {deskSwitcherOpen ? (
                <div
                  aria-label={homeCopy.selectDesk}
                  className="director-desk-menu"
                  role="listbox"
                  onKeyDown={handleDeskMenuKeyDown}
                >
                  {directorDesks.map((desk) => {
                    const isSelected = desk.id === activeDeskId;
                    return (
                      <button
                        aria-selected={isSelected}
                        className={`director-desk-option${isSelected ? " is-selected" : ""}`}
                        key={desk.id}
                        role="option"
                        type="button"
                        onClick={() => {
                          setDeskSwitcherOpen(false);
                          openDirectorDesk(desk.id);
                        }}
                      >
                        <span>{desk.name}</span>
                        {isSelected ? <Check aria-hidden="true" size={14} strokeWidth={2} /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <button className="director-desk-create-button" type="button" onClick={handleCreateDesk}>
              <Plus aria-hidden="true" size={14} strokeWidth={1.9} />
              {homeCopy.create}
            </button>
          </div>
        </div>
        <div className="top-bar-center">
          <div className="mode-toggle ui-segmented" role="group" aria-label={text("视角切换", "View switcher")}>
            <button
              className={`mode-toggle-button ui-segmented-item ${viewMode === "director" ? "ui-segmented-item-active" : ""}`}
              aria-pressed={viewMode === "director"}
              type="button"
              onClick={() => setViewMode("director")}
            >
              {text("导演视角", "Director view")}
            </button>
            <button
              className={`mode-toggle-button ui-segmented-item ${viewMode === "camera" ? "ui-segmented-item-active" : ""}`}
              aria-label={text("第一视角", "Camera view")}
              aria-pressed={viewMode === "camera"}
              title={text("查看摄影机最终画面", "View the final camera frame")}
              type="button"
              onClick={() => setViewMode("camera")}
            >
              {text("第一视角", "Camera view")}
            </button>
          </div>
          <button
            className={`top-bar-motion-button${motionStudioOpen ? " is-active" : ""}`}
            type="button"
            aria-label={motionStudioOpen
              ? text("关闭运镜工作台", "Close camera motion studio")
              : text("打开运镜工作台", "Open camera motion studio")}
            aria-pressed={motionStudioOpen}
            onClick={() => {
              setViewMode("director");
              setMotionStudioOpen(!motionStudioOpen);
            }}
          >
            <Route aria-hidden="true" size={15} />
            {text("运镜", "Camera motion")}
          </button>
          <ViewportSensitivitySettings />
          <PerformanceSettings />
        </div>
        <div className="top-bar-actions">
          <button
            className="top-bar-action-button"
            type="button"
            aria-label={text("关闭", "Close")}
            title={text("关闭", "Close")}
            onClick={handleClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </div>
      </header>
      <DirectorDeskShell>
        <DirectorCanvas />
      </DirectorDeskShell>
    </div>
  );
}
