import { DEFAULT_STATE, DRAFT_KEY, EditorState, SERIES } from "./templates";

export type DraftRecord = {
  id: string;
  name: string;
  state: EditorState;
  thumbnail: string;
  createdAt: number;
  updatedAt: number;
};

const DB_NAME = "cover-template-workbench";
const DB_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_KEY = "cover-template-active-draft-id";

function createId() {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultDraftName(state: EditorState) {
  const series = SERIES.find((item) => item.id === state.seriesId);
  return `${series?.name ?? "封面"}草稿`;
}

function normalizeState(state: Partial<EditorState> | null | undefined): EditorState {
  const seriesId = state?.seriesId ?? DEFAULT_STATE.seriesId;
  const series = SERIES.find((item) => item.id === seriesId) ?? SERIES[0];
  return {
    ...DEFAULT_STATE,
    ...state,
    seriesId: series.id,
    smallTitle: series.smallTitle,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open draft database."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);
    let result: T | undefined;

    if (request) {
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Draft transaction failed."));
    };
  });
}

export function getActiveDraftId() {
  return localStorage.getItem(ACTIVE_DRAFT_KEY);
}

export function setActiveDraftId(id: string) {
  localStorage.setItem(ACTIVE_DRAFT_KEY, id);
}

export async function listDrafts(): Promise<DraftRecord[]> {
  const drafts = (await withStore<DraftRecord[]>("readonly", (store) => store.getAll())) ?? [];
  return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDraft(id: string): Promise<DraftRecord | null> {
  return (await withStore<DraftRecord>("readonly", (store) => store.get(id))) ?? null;
}

export async function createDraft(
  initialState: EditorState = DEFAULT_STATE,
  name?: string,
): Promise<DraftRecord> {
  const now = Date.now();
  const state = normalizeState(initialState);
  const draft: DraftRecord = {
    id: createId(),
    name: name ?? defaultDraftName(state),
    state,
    thumbnail: "",
    createdAt: now,
    updatedAt: now,
  };
  await saveDraft(draft, false);
  return draft;
}

export async function saveDraft(
  draft: DraftRecord,
  touch = true,
): Promise<DraftRecord> {
  const next = {
    ...draft,
    state: normalizeState(draft.state),
    updatedAt: touch ? Date.now() : draft.updatedAt,
  };
  await withStore("readwrite", (store) => store.put(next));
  return next;
}

export async function duplicateDraft(id: string): Promise<DraftRecord | null> {
  const source = await getDraft(id);
  if (!source) return null;
  const now = Date.now();
  const copy: DraftRecord = {
    ...source,
    id: createId(),
    name: `${source.name} 副本`,
    createdAt: now,
    updatedAt: now,
  };
  await saveDraft(copy, false);
  return copy;
}

export async function deleteDraft(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function migrateLegacyDraft(): Promise<DraftRecord | null> {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;

  const existing = await listDrafts();
  if (existing.length > 0) {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }

  try {
    const state = normalizeState(JSON.parse(raw));
    const draft = await createDraft(state, "旧版自动迁移草稿");
    localStorage.removeItem(DRAFT_KEY);
    return draft;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}
