"use client";

import { useCallback, useEffect, useState } from "react";
import type { Viewport } from "@xyflow/react";
import { mapEvidence, parseKnowledgeMap, type MapPoint, type ProblemKnowledgeMap } from "@/lib/learning/knowledge-map";
import { applyMapEvent, finishMapDraft, readMapStream, type KnowledgeMapDraft, type KnowledgeMapEvent } from "@/lib/learning/knowledge-map-stream";
import type { LearningSession } from "@/lib/learning/types";
import { createMapDeadline } from "@/lib/learning/knowledge-map-deadline";

export interface SavedMap { identity: string; map: ProblemKnowledgeMap; positions?: Record<string, MapPoint>; expanded?: string[]; viewport?: Viewport }
const empty: KnowledgeMapDraft = { plan: null, map: null };

export function useKnowledgeMap(session: LearningSession, stateToken: string) {
  const [snapshot] = useState(() => ({ session, stateToken, identity: JSON.stringify(session.problem), key: "problem-knowledge-map-v2:" + session.requestId }));
  const [draft, setDraft] = useState(empty);
  const [saved, setSaved] = useState<SavedMap | null>(null);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [storageNotice, setStorageNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let deadline: ReturnType<typeof createMapDeadline> | undefined;
    let active = true;
    const run = async () => {
      const evidence = mapEvidence(snapshot.session);
      try {
        const raw = localStorage.getItem(snapshot.key);
        if (raw && raw.length < 100000) {
          const cached = JSON.parse(raw) as SavedMap;
          if (cached.identity === snapshot.identity) {
            const map = parseKnowledgeMap(cached.map, evidence);
            if (active) { setSaved(cached); setDraft({ plan: null, map }); setComplete(true); }
            return;
          }
        }
      } catch { /* Old or damaged cache does not prevent a fresh request. */ }
      let received = empty;
      try {
        deadline = createMapDeadline(3000);
        const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
        const response = await fetch(`${base}/learning/knowledge-map`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ stateToken: snapshot.stateToken, stream: true }), signal: AbortSignal.any([controller.signal, deadline.signal]) });
        await readMapStream(response, (event, data) => {
          if (!active) return;
          if (event === "map.start") return;
          if (event === "complete") {
            const map = finishMapDraft(received, evidence);
            if ((data as { total: number }).total !== map.nodes.length) throw new Error("知识点数量与清单不一致");
            setDraft({ ...received, map }); setComplete(true);
          } else if (event === "map.plan" || event === "map.node") {
            if (`map.${(data as KnowledgeMapEvent).type}` !== event) throw new Error("图谱消息类型不一致");
            received = applyMapEvent(received, data as KnowledgeMapEvent, evidence);
            if (event === "map.plan") deadline!.planned(received.plan!.nodes.length);
            setDraft(received);
          } else throw new Error("图谱消息无法识别");
        });
      } catch (e) {
        if (active) { setComplete(false); setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "这次整理超时了，已显示的知识点仍可查看。"); }
      } finally { deadline?.clear(); }
    };
    const start = setTimeout(() => { void run(); }, 0);
    return () => { active = false; clearTimeout(start); deadline?.clear(); controller.abort(); };
  }, [snapshot, attempt]);
  const save = useCallback((data: Omit<SavedMap, "identity">) => {
    if (!complete) return; // Partial graphs must never masquerade as a complete cache.
    try { localStorage.setItem(snapshot.key, JSON.stringify({ ...data, identity: snapshot.identity })); }
    catch { setStorageNotice("浏览器暂时无法保存布局，本次仍可自由调整。"); }
  }, [snapshot, complete]);
  const retry = () => { setDraft(empty); setComplete(false); setError(""); setSaved(null); setAttempt(n => n + 1); };
  return { ...draft, saved, complete, error, attempt, storageNotice, snapshot, save, retry };
}
