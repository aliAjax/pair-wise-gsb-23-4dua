import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildSeedState } from "../domain/seed";
import { correctRelease, emptyState, releaseRoom, submitSample } from "../domain/store";
import type {
  CorrectionInput,
  PersistedState,
  ReleaseRecord,
  SamplingFormValues,
} from "../domain/types";
import { createStorage, type StorageAdapter } from "../infra/storage";

export interface ActionResponse<T = undefined> {
  ok: boolean;
  errors?: string[];
  data?: T;
}

interface AppStateContextValue {
  state: PersistedState;
  submit: (values: SamplingFormValues) => ActionResponse;
  release: (roomId: string) => ActionResponse<ReleaseRecord>;
  correct: (releaseId: string, correction: CorrectionInput) => ActionResponse<ReleaseRecord>;
  resetToSeed: () => void;
  clearAll: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

function initialState(adapter: StorageAdapter): PersistedState {
  // 刷新后以本地存储为准；首次访问（或存储损坏）回落到演示种子
  return adapter.load() ?? buildSeedState();
}

export function AppStateProvider({
  children,
  adapter,
}: {
  children: ReactNode;
  adapter?: StorageAdapter;
}) {
  const storageRef = useRef<StorageAdapter | null>(null);
  if (!storageRef.current) storageRef.current = adapter ?? createStorage();

  const [state, setState] = useState<PersistedState>(() => initialState(storageRef.current!));

  const commit = useCallback((next: PersistedState) => {
    setState(next);
    storageRef.current?.save(next);
  }, []);

  const submit = useCallback(
    (values: SamplingFormValues): ActionResponse => {
      const result = submitSample(state, values, new Date());
      if (!result.ok) return { ok: false, errors: result.errors };
      commit(result.state);
      return { ok: true };
    },
    [state, commit]
  );

  const release = useCallback(
    (roomId: string): ActionResponse<ReleaseRecord> => {
      const result = releaseRoom(state, roomId, new Date());
      if (!result.ok) return { ok: false, errors: result.errors };
      commit(result.state);
      return { ok: true, data: result.data };
    },
    [state, commit]
  );

  const correct = useCallback(
    (releaseId: string, correction: CorrectionInput): ActionResponse<ReleaseRecord> => {
      const result = correctRelease(state, releaseId, correction, new Date());
      if (!result.ok) return { ok: false, errors: result.errors };
      commit(result.state);
      return { ok: true, data: result.data };
    },
    [state, commit]
  );

  const resetToSeed = useCallback(() => {
    commit(buildSeedState());
  }, [commit]);

  const clearAll = useCallback(() => {
    storageRef.current?.clear();
    commit(emptyState());
  }, [commit]);

  const value = useMemo<AppStateContextValue>(
    () => ({ state, submit, release, correct, resetToSeed, clearAll }),
    [state, submit, release, correct, resetToSeed, clearAll]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState 必须在 AppStateProvider 内使用");
  return ctx;
}
