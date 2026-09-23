import { useEffect, useMemo, useReducer } from "react";
import { localDate, localStamp } from "../../domain/clock";
import type { ReadingChange, SampleInput, StationState } from "../../domain/types";
import {
  buildDemoState,
  emptyState,
  guardCorrect,
  guardRelease,
  guardSubmit,
  reducer,
} from "../../domain/workflow";
import { clearState, loadState, saveState } from "../../storage/repository";

// —— 页面状态钩子：串联流程层与本地存储层 ——

function nowCtx() {
  const date = new Date();
  return { now: localStamp(date), today: localDate(date) };
}

function initState(): StationState {
  return loadState() ?? buildDemoState(nowCtx());
}

export interface StationApi {
  state: StationState;
  /** 返回错误文案；null 表示已提交（异常判定不会阻止提交，输入会被保留并生成异常单） */
  submit: (input: SampleInput) => string | null;
  release: (roomId: string) => string | null;
  correct: (releaseId: string, change: ReadingChange, reason: string) => string | null;
  resetDemo: () => void;
  clearAll: () => void;
}

export function useStation(): StationApi {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  return useMemo<StationApi>(
    () => ({
      state,
      submit(input) {
        const error = guardSubmit(state, input);
        if (error) return error;
        const ctx = nowCtx();
        dispatch({ type: "submit", input, now: ctx.now, today: ctx.today });
        return null;
      },
      release(roomId) {
        const error = guardRelease(state, roomId);
        if (error) return error;
        dispatch({ type: "release", roomId, ctx: nowCtx() });
        return null;
      },
      correct(releaseId, change, reason) {
        const release = state.releases.find((item) => item.id === releaseId);
        if (!release) return "放行记录不存在";
        const error = guardCorrect(release, change, reason);
        if (error) return error;
        dispatch({ type: "correct", releaseId, change, reason, ctx: nowCtx() });
        return null;
      },
      resetDemo() {
        clearState();
        dispatch({ type: "replace", state: buildDemoState(nowCtx()) });
      },
      clearAll() {
        clearState();
        dispatch({ type: "replace", state: emptyState() });
      },
    }),
    [state]
  );
}
