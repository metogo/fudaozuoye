"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { latestConnectionMessage, parseKnowledgeConnection, type KnowledgeConnection } from "@/lib/learning/knowledge-connection";
import { mapEvidence } from "@/lib/learning/knowledge-map";
import type { ChatMessage, LearningSession } from "@/lib/learning/types";

export interface ConnectionEntry {
  requestId: string;
  problem: string;
  source: string;
  status: "pending" | "ready" | "error";
  connection: KnowledgeConnection | null;
}

/** Optional enrichment never owns the main stream's busy state, gates or abort controller. */
export function useKnowledgeConnections(session: LearningSession | null, stateToken: string | undefined, messages: ChatMessage[], enabled: boolean, locked: boolean) {
  const [entries, setEntries] = useState<Map<string, ConnectionEntry>>(new Map());
  const [attempt, setAttempt] = useState(0);
  const cache = useRef(new Map<string, KnowledgeConnection | null>());
  const candidate = latestConnectionMessage(messages);
  const source = candidate?.text, messageId = candidate?.id;
  const requestId = session?.requestId, problem = session ? JSON.stringify(session.problem) : "";
  const evidence = session ? mapEvidence(session) : "";
  useEffect(() => {
    if (!enabled || locked || !requestId || !stateToken || !source || !messageId) return;
    const controller = new AbortController();
    let active = true;
    const key = JSON.stringify([requestId, problem, messageId, source]);
    const publish = (status: ConnectionEntry["status"], connection: KnowledgeConnection | null) => {
      if (active) setEntries(previous => new Map(previous).set(messageId, { requestId, problem, source, status, connection }));
    };
    const run = async () => {
      if (cache.current.has(key)) { publish("ready", cache.current.get(key)!); return; }
      publish("pending", null);
      try {
        const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
        const response = await fetch(`${base}/learning/knowledge-connection`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stateToken, messageId, source }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(31000)]),
        });
        if (!response.ok) throw new Error("知识连接请求失败");
        const data = await response.json();
        if (data.messageId !== messageId || !("connection" in data)) throw new Error("知识连接与当前讲解不匹配");
        const connection = parseKnowledgeConnection(data.connection, source, evidence);
        if (!active) return;
        cache.current.set(key, connection);
        publish("ready", connection);
      } catch {
        if (active && !controller.signal.aborted) publish("error", null);
      }
    };
    const start = setTimeout(() => { void run(); }, 0);
    return () => { active = false; clearTimeout(start); controller.abort(); };
  }, [enabled, locked, requestId, stateToken, source, messageId, problem, evidence, attempt]);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  const visible = new Map<string, ConnectionEntry>();
  const shownPairs = new Set<string>();
  if (!locked) for (const message of messages) {
    const entry = entries.get(message.id);
    if (!entry || entry.requestId !== requestId || entry.problem !== problem || entry.source !== message.text || message.status !== "complete") continue;
    if (entry.status !== "ready" && (!enabled || message.id !== messageId)) continue;
    if (entry.status === "ready" && !entry.connection) continue;
    if (entry.connection) {
      const pair = [entry.connection.foundation.title, entry.connection.target.title].map(t => t.replace(/\s/g, "")).sort().join(":");
      if (shownPairs.has(pair)) continue;
      shownPairs.add(pair);
    }
    visible.set(message.id, entry);
  }
  return { entries: visible, retry };
}
