import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  FilePlus2,
  Image as ImageIcon,
  PanelRight,
  RefreshCcw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import * as fabric from "fabric";
import {
  defaultStickerTransform,
  fitImageTransform,
  imageObjectToTransform,
  readRole,
  renderCoverCanvas,
} from "./canvasRenderer";
import {
  createDraft,
  deleteDraft,
  DraftRecord,
  duplicateDraft,
  getActiveDraftId,
  listDrafts,
  migrateLegacyDraft,
  saveDraft,
  setActiveDraftId,
} from "./draftStore";
import { optimizeImageFile } from "./imageUtils";
import { DEFAULT_STATE, EditorState, ImageTransform, SERIES } from "./templates";
import "./mandianCover.css";

type LayerRole = "main" | "sticker";
type InspectorTab = "title" | "main" | "sticker" | "atmosphere" | "export";
type Toast = { kind: "ok" | "error"; text: string } | null;

const PANEL_TABS: Array<{ id: InspectorTab; label: string; icon: React.ReactNode }> = [
  { id: "title", label: "标题", icon: <Type size={16} /> },
  { id: "main", label: "主图", icon: <ImageIcon size={16} /> },
  { id: "sticker", label: "花字", icon: <Sparkles size={16} /> },
  { id: "atmosphere", label: "氛围", icon: <Sparkles size={16} /> },
  { id: "export", label: "导出", icon: <Download size={16} /> },
];

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export default function MandianCoverTool() {
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvas = useRef<fabric.Canvas | null>(null);
  const stateRef = useRef<EditorState>(DEFAULT_STATE);
  const currentDraftRef = useRef<DraftRecord | null>(null);
  const saveTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const renderTicket = useRef(0);

  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [currentDraft, setCurrentDraft] = useState<DraftRecord | null>(null);
  const [state, setState] = useState<EditorState>(DEFAULT_STATE);
  const [query, setQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<LayerRole | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>("title");
  const [isBooting, setIsBooting] = useState(true);
  const [isRendering, setIsRendering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const currentSeries = useMemo(
    () => SERIES.find((item) => item.id === state.seriesId) ?? SERIES[0],
    [state.seriesId],
  );

  const filteredDrafts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return drafts;
    return drafts.filter((draft) => {
      const series = SERIES.find((item) => item.id === draft.state.seriesId);
      return `${draft.name} ${series?.name ?? ""}`.toLowerCase().includes(keyword);
    });
  }, [drafts, query]);

  const showToast = (next: Toast) => {
    setToast(next);
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };

  const refreshDrafts = async () => {
    const next = await listDrafts();
    setDrafts(next);
    return next;
  };

  const activateDraft = (draft: DraftRecord) => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    currentDraftRef.current = draft;
    stateRef.current = draft.state;
    setCurrentDraft(draft);
    setState(draft.state);
    setSelectedRole(null);
    setActiveDraftId(draft.id);
  };

  const saveCurrentDraft = async (
    patch: Partial<DraftRecord>,
    options: { touch?: boolean; silent?: boolean } = {},
  ) => {
    const draft = currentDraftRef.current;
    if (!draft) return null;

    setIsSaving(true);
    try {
      const saved = await saveDraft({ ...draft, ...patch }, options.touch ?? true);
      currentDraftRef.current = saved;
      setCurrentDraft(saved);
      setDrafts((items) =>
        [saved, ...items.filter((item) => item.id !== saved.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      );
      return saved;
    } catch {
      if (!options.silent) {
        showToast({ kind: "error", text: "草稿保存失败，请检查浏览器存储空间。" });
      }
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const scheduleStateSave = (next: EditorState, syncReact = true) => {
    const draft = currentDraftRef.current;
    stateRef.current = next;
    if (syncReact) {
      setState(next);
    }
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }
    if (!draft) return;
    saveTimer.current = window.setTimeout(() => {
      void saveDraft({ ...draft, state: next, updatedAt: Date.now() })
        .then((saved) => {
          if (currentDraftRef.current?.id === saved.id) {
            currentDraftRef.current = saved;
            setCurrentDraft(saved);
          }
          setDrafts((items) =>
            [saved, ...items.filter((item) => item.id !== saved.id)].sort(
              (a, b) => b.updatedAt - a.updatedAt,
            ),
          );
        })
        .catch(() => showToast({ kind: "error", text: "草稿保存失败，请检查浏览器存储空间。" }));
    }, 180);
  };

  const updateState = (patch: Partial<EditorState>) => {
    scheduleStateSave({ ...stateRef.current, ...patch });
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await migrateLegacyDraft();
        let existing = await listDrafts();
        if (existing.length === 0) {
          const first = await createDraft(DEFAULT_STATE, "第一张封面");
          existing = [first];
        }
        if (cancelled) return;

        setDrafts(existing);
        const activeId = getActiveDraftId();
        const active = existing.find((item) => item.id === activeId) ?? existing[0];
        activateDraft(active);
      } catch {
        showToast({ kind: "error", text: "草稿库初始化失败，已临时使用默认草稿。" });
        const fallback: DraftRecord = {
          id: "fallback",
          name: "临时草稿",
          state: DEFAULT_STATE,
          thumbnail: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        activateDraft(fallback);
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canvasEl.current || fabricCanvas.current) return;

    const canvas = new fabric.Canvas(canvasEl.current, {
      preserveObjectStacking: true,
      selection: false,
      uniformScaling: true,
      backgroundColor: "#231832",
      enableRetinaScaling: false,
    });
    fabricCanvas.current = canvas;

    canvas.on("selection:created", ({ selected }) => {
      setSelectedRole(readRole(selected?.[0]));
    });
    canvas.on("selection:updated", ({ selected }) => {
      setSelectedRole(readRole(selected?.[0]));
    });
    canvas.on("selection:cleared", () => setSelectedRole(null));
    canvas.on("object:scaling", ({ target }) => {
      const role = readRole(target);
      if (!role || !target) return;
      const scale = Math.max(target.scaleX ?? 1, target.scaleY ?? 1);
      target.set({ scaleX: scale, scaleY: scale });
    });
    canvas.on("object:modified", ({ target }) => {
      const role = readRole(target);
      if (!role) return;
      const previous = role === "main" ? stateRef.current.mainImage : stateRef.current.sticker;
      if (!previous) return;
      updateState({
        [role === "main" ? "mainImage" : "sticker"]: imageObjectToTransform(
          target,
          previous.src,
        ),
      } as Partial<EditorState>);
    });

    const moveActiveObject = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return;
      }

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        return;
      }

      const target = canvas.getActiveObject();
      const role = readRole(target);
      if (!target || !role) return;

      event.preventDefault();
      const delta = {
        ArrowLeft: { left: -1, top: 0 },
        ArrowRight: { left: 1, top: 0 },
        ArrowUp: { left: 0, top: -1 },
        ArrowDown: { left: 0, top: 1 },
      }[event.key];
      if (!delta) return;

      target.set({
        left: Math.round((target.left ?? 0) + delta.left),
        top: Math.round((target.top ?? 0) + delta.top),
      });
      target.setCoords();
      canvas.requestRenderAll();

      const previous = role === "main" ? stateRef.current.mainImage : stateRef.current.sticker;
      if (!previous) return;
      scheduleStateSave(
        {
          ...stateRef.current,
          [role === "main" ? "mainImage" : "sticker"]: imageObjectToTransform(
            target,
            previous.src,
          ),
        },
        false,
      );
    };

    window.addEventListener("keydown", moveActiveObject);

    return () => {
      window.removeEventListener("keydown", moveActiveObject);
      canvas.dispose();
      fabricCanvas.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas || isBooting) return;

    const ticket = ++renderTicket.current;
    setIsRendering(true);
    void renderCoverCanvas(canvas, state)
      .then(() => {
        if (ticket !== renderTicket.current) return;
        setIsRendering(false);
        const thumbnail = canvas.toDataURL({ format: "png", multiplier: 0.14 });
        void saveCurrentDraft({ state, thumbnail }, { silent: true });
      })
      .catch(() => {
        if (ticket === renderTicket.current) {
          setIsRendering(false);
          showToast({ kind: "error", text: "画布渲染失败，请重新上传素材或刷新页面。" });
        }
      });
  }, [state, isBooting]);

  const handleSeriesChange = (seriesId: string) => {
    const series = SERIES.find((item) => item.id === seriesId) ?? SERIES[0];
    updateState({ seriesId: series.id, smallTitle: series.smallTitle });
  };

  const uploadMainImage = async (file: File | null) => {
    if (!file) return;
    try {
      showToast({ kind: "ok", text: "正在处理主图..." });
      const src = await optimizeImageFile(file, {
        maxWidth: 1600,
        maxHeight: 1800,
        mimeType: "image/jpeg",
        quality: 0.9,
      });
      updateState({ mainImage: await fitImageTransform(src) });
      setActiveTab("main");
      showToast({ kind: "ok", text: "主图已上传并自动贴合画框。" });
    } catch {
      showToast({ kind: "error", text: "主图上传失败，请换一张图片再试。" });
    }
  };

  const uploadSticker = async (file: File | null) => {
    if (!file) return;
    try {
      const src = await optimizeImageFile(file, {
        maxWidth: 900,
        maxHeight: 360,
        mimeType: "image/png",
      });
      updateState({ sticker: await defaultStickerTransform(src) });
      setActiveTab("sticker");
      showToast({ kind: "ok", text: "花字已添加到标题区域。" });
    } catch {
      showToast({ kind: "error", text: "花字上传失败，请确认图片格式可用。" });
    }
  };

  const resetMainImage = async () => {
    if (!state.mainImage) return;
    updateState({ mainImage: await fitImageTransform(state.mainImage.src) });
  };

  const resetSticker = async () => {
    if (!state.sticker) return;
    updateState({ sticker: await defaultStickerTransform(state.sticker.src) });
  };

  const resetBigTitle = () => {
    updateState({
      bigFontSize: DEFAULT_STATE.bigFontSize,
      bigLeft: DEFAULT_STATE.bigLeft,
      bigTop: DEFAULT_STATE.bigTop,
    });
  };

  const deleteSticker = () => updateState({ sticker: null });

  const createNewDraft = async () => {
    try {
      const draft = await createDraft(DEFAULT_STATE, `新封面 ${drafts.length + 1}`);
      const next = await refreshDrafts();
      activateDraft(next.find((item) => item.id === draft.id) ?? draft);
      showToast({ kind: "ok", text: "已新建空白稿件。" });
    } catch {
      showToast({ kind: "error", text: "新建稿件失败，请检查浏览器存储空间。" });
    }
  };

  const duplicateCurrentDraft = async () => {
    if (!currentDraft) return;
    const copy = await duplicateDraft(currentDraft.id);
    if (!copy) {
      showToast({ kind: "error", text: "复制稿件失败。" });
      return;
    }
    const next = await refreshDrafts();
    activateDraft(next.find((item) => item.id === copy.id) ?? copy);
    showToast({ kind: "ok", text: "已复制当前稿件。" });
  };

  const removeCurrentDraft = async () => {
    if (!currentDraft) return;
    if (drafts.length <= 1) {
      showToast({ kind: "error", text: "至少保留一个稿件。" });
      return;
    }
    if (!window.confirm(`确定删除「${currentDraft.name}」吗？`)) return;
    await deleteDraft(currentDraft.id);
    const next = await refreshDrafts();
    activateDraft(next[0]);
    showToast({ kind: "ok", text: "稿件已删除。" });
  };

  const renameCurrentDraft = (name: string) => {
    if (!currentDraft) return;
    const next = { ...currentDraft, name };
    currentDraftRef.current = next;
    setCurrentDraft(next);
    setDrafts((items) => items.map((item) => (item.id === next.id ? next : item)));
    void saveDraft({ ...next, name: name.trim() || "未命名封面" }).catch(() =>
      showToast({ kind: "error", text: "稿件名称保存失败。" }),
    );
  };

  const patchTransform = (role: LayerRole, patch: Partial<ImageTransform>) => {
    const source = role === "main" ? state.mainImage : state.sticker;
    if (!source) return;
    const next = {
      ...source,
      ...patch,
      scaleX: patch.scaleX ?? patch.scaleY ?? source.scaleX,
      scaleY: patch.scaleY ?? patch.scaleX ?? source.scaleY,
    };
    updateState({ [role === "main" ? "mainImage" : "sticker"]: next } as Partial<EditorState>);
  };

  const downloadPng = () => {
    const canvas = fabricCanvas.current;
    if (!canvas || !currentDraft) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const url = canvas.toDataURL({ format: "png", multiplier: 1 });
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(currentDraft.name)}-${safeFileName(currentSeries.name)}-${formatFileDate(new Date())}.png`;
    link.click();
  };

  return (
    <div className="mandian-cover-app">
      <main className="workbench-shell">
      <aside className="draft-sidebar">
        <div className="brand-block">
          <h1>封面工作台</h1>
          <span>900 × 1200 PNG</span>
        </div>

        <div className="draft-actions">
          <button className="primary-button" onClick={createNewDraft}>
            <FilePlus2 size={17} />
            新建
          </button>
          <button onClick={duplicateCurrentDraft} disabled={!currentDraft}>
            <Copy size={17} />
            复制
          </button>
        </div>

        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            placeholder="搜索稿件或系列"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="draft-list" aria-label="稿件库">
          {filteredDrafts.map((draft) => {
            const series = SERIES.find((item) => item.id === draft.state.seriesId);
            return (
              <button
                key={draft.id}
                className={draft.id === currentDraft?.id ? "draft-card active" : "draft-card"}
                onClick={() => activateDraft(draft)}
              >
                <span className="draft-thumb">
                  {draft.thumbnail ? (
                    <img src={draft.thumbnail} alt="" />
                  ) : (
                    <PanelRight size={18} />
                  )}
                </span>
                <span className="draft-meta">
                  <strong>{draft.name}</strong>
                  <span>{series?.name ?? "未知系列"}</span>
                  <time>{formatRelativeTime(draft.updatedAt)}</time>
                </span>
              </button>
            );
          })}
        </div>

        <section className="series-panel">
          <h2>系列模板</h2>
          <div className="series-grid compact">
            {SERIES.map((series) => (
              <button
                key={series.id}
                className={series.id === state.seriesId ? "series active" : "series"}
                onClick={() => handleSeriesChange(series.id)}
              >
                {series.name}
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="stage-workspace">
        <header className="workspace-toolbar">
          <div>
            <input
              className="draft-title-input"
              value={currentDraft?.name ?? ""}
              onChange={(event) => renameCurrentDraft(event.target.value)}
              disabled={!currentDraft}
            />
            <span className="workspace-status">
              {isBooting ? "正在加载草稿库" : isSaving ? "正在保存" : "草稿自动保存"}
            </span>
          </div>
          <div className="toolbar-actions">
            <span className="status-pill">{selectedRoleLabel(selectedRole)}</span>
            <span className="status-pill">预览 60%</span>
            <button onClick={removeCurrentDraft} disabled={!currentDraft || drafts.length <= 1}>
              <Trash2 size={17} />
              删除
            </button>
            <button className="primary-button" onClick={downloadPng} disabled={isRendering || !currentDraft}>
              <Download size={18} />
              {isRendering ? "渲染中" : "导出 PNG"}
            </button>
          </div>
        </header>

        <div className="canvas-wrap" data-rendering={isRendering}>
          <canvas ref={canvasEl} width={900} height={1200} />
        </div>
      </section>

      <aside className="inspector">
        <div className="inspector-tabs">
          {PANEL_TABS.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="inspector-content">
          {activeTab === "title" && (
            <Panel title="标题">
              <div className="toggle-choice" role="group" aria-label="小标题显示">
                <button
                  type="button"
                  className={state.smallTitleEnabled ? "active" : ""}
                  onClick={() => updateState({ smallTitleEnabled: true })}
                >
                  启用小标题
                </button>
                <button
                  type="button"
                  className={!state.smallTitleEnabled ? "active" : ""}
                  onClick={() => updateState({ smallTitleEnabled: false })}
                >
                  关闭小标题
                </button>
              </div>
              <label>
                当前小标题
                <input value={state.smallTitle} readOnly disabled />
              </label>
              <label>
                大字标题
                <textarea
                  value={state.bigTitle}
                  rows={4}
                  onChange={(event) => updateState({ bigTitle: event.target.value })}
                />
              </label>
              <div className="split">
                <NumberField
                  label="字号"
                  value={state.bigFontSize}
                  min={72}
                  max={150}
                  onChange={(value) => updateState({ bigFontSize: value })}
                />
                <NumberField
                  label="X"
                  value={state.bigLeft}
                  min={0}
                  max={180}
                  onChange={(value) => updateState({ bigLeft: value })}
                />
                <NumberField
                  label="Y"
                  value={state.bigTop}
                  min={0}
                  max={220}
                  onChange={(value) => updateState({ bigTop: value })}
                />
              </div>
              <button onClick={resetBigTitle}>
                <RotateCcw size={17} />
                恢复标题位置
              </button>
            </Panel>
          )}

          {activeTab === "main" && (
            <Panel title="主图">
              <DropUpload
                title={state.mainImage ? "主图已上传" : "上传主图"}
                hint="推荐 1200 × 1270 px 以上，上传后可拖动、缩放、方向键微调。"
                onFile={uploadMainImage}
              />
              <TransformControls
                transform={state.mainImage}
                emptyText="上传主图后可编辑位置和缩放。"
                onPatch={(patch) => patchTransform("main", patch)}
              />
              <div className="button-row">
                <button onClick={resetMainImage} disabled={!state.mainImage}>
                  <RotateCcw size={17} />
                  恢复默认位置
                </button>
              </div>
            </Panel>
          )}

          {activeTab === "sticker" && (
            <Panel title="花字">
              <DropUpload
                title={state.sticker ? "花字已上传" : "上传花字"}
                hint="花字会默认出现在上方标题区域，可拖动、缩放、旋转。"
                onFile={uploadSticker}
              />
              <TransformControls
                transform={state.sticker}
                emptyText="上传花字后可编辑位置、缩放和旋转。"
                onPatch={(patch) => patchTransform("sticker", patch)}
              />
              <div className="button-row">
                <button onClick={resetSticker} disabled={!state.sticker}>
                  <RotateCcw size={17} />
                  恢复默认位置
                </button>
                <button onClick={deleteSticker} disabled={!state.sticker}>
                  <Trash2 size={17} />
                  删除花字
                </button>
              </div>
            </Panel>
          )}

          {activeTab === "atmosphere" && (
            <Panel title="氛围">
              <label>
                小闪电透明度
                <div className="range-row">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={state.lightningOpacity}
                    onChange={(event) =>
                      updateState({ lightningOpacity: Number(event.target.value) })
                    }
                  />
                  <input
                    className="percent-input"
                    type="number"
                    min={0}
                    max={100}
                    value={state.lightningOpacity}
                    onChange={(event) =>
                      updateState({ lightningOpacity: clampPercent(Number(event.target.value)) })
                    }
                  />
                  <span className="percent-mark">%</span>
                </div>
              </label>
            </Panel>
          )}

          {activeTab === "export" && (
            <Panel title="导出">
              <div className="export-card">
                <strong>PNG 封面</strong>
                <span>固定导出 900 × 1200 px</span>
                <code>
                  {currentDraft
                    ? `${safeFileName(currentDraft.name)}-${safeFileName(currentSeries.name)}-${formatFileDate(new Date())}.png`
                    : "短视频封面.png"}
                </code>
              </div>
              <button className="primary-button wide" onClick={downloadPng} disabled={isRendering || !currentDraft}>
                <Download size={18} />
                {isRendering ? "渲染中" : "导出 PNG"}
              </button>
            </Panel>
          )}
        </div>
      </aside>

        {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TransformControls({
  transform,
  emptyText,
  onPatch,
}: {
  transform: ImageTransform | null;
  emptyText: string;
  onPatch: (patch: Partial<ImageTransform>) => void;
}) {
  if (!transform) {
    return <p className="empty-note">{emptyText}</p>;
  }

  const scale = Math.max(transform.scaleX, transform.scaleY);

  return (
    <div className="transform-grid">
      <NumberField label="X" value={transform.left} onChange={(left) => onPatch({ left })} />
      <NumberField label="Y" value={transform.top} onChange={(top) => onPatch({ top })} />
      <NumberField
        label="缩放"
        value={Number((scale * 100).toFixed(1))}
        min={5}
        max={300}
        step={0.5}
        onChange={(value) => onPatch({ scaleX: value / 100, scaleY: value / 100 })}
      />
      <NumberField
        label="旋转"
        value={transform.angle}
        min={-180}
        max={180}
        onChange={(angle) => onPatch({ angle })}
      />
    </div>
  );
}

function DropUpload({
  title,
  hint,
  onFile,
}: {
  title: string;
  hint: string;
  onFile: (file: File | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <label
      className={isDragging ? "drop-upload dragging" : "drop-upload"}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        void onFile(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <Upload size={19} />
      <strong>{title}</strong>
      <span>{hint}</span>
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          void onFile(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function selectedRoleLabel(role: LayerRole | null) {
  if (role === "main") return "主图已选中";
  if (role === "sticker") return "花字已选中";
  return "未选中图层";
}

function formatRelativeTime(timestamp: number) {
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "刚刚保存";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function formatFileDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}`;
}

function safeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "");
}
