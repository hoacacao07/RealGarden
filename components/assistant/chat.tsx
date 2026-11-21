"use client";

/**
 * Garden Assistant chat (spec 7B.4): starter chips, streamed answers, tool chips ("Checked your forecast"),
 * plant / task cards with a Confirm step, thumbs up/down, and an optional photo. Used by the full page
 * (/garden/[id]/assistant) and the floating panel.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, CalendarPlus, Loader2, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STARTER_CHIPS } from "@/lib/assistant-chips";
import type { HistoryItem, Proposal, StoredTools } from "@/lib/assistant";

interface Msg { key: string; id: string | null; role: "user" | "model"; text: string; meta: StoredTools; feedback: number | null; pending?: boolean; error?: string }

let n = 0;
const key = () => `m${Date.now()}_${n++}`;

export function GardenChat({ gardenId, compact = false }: { gardenId: string; compact?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/chat?garden_id=${encodeURIComponent(gardenId)}`).then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages: HistoryItem[] }) => { if (alive) setMsgs(d.messages.map((m) => ({ ...m, key: m.id }))); })
      .catch(() => undefined).finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [gardenId]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

  const patch = useCallback((k: string, f: (m: Msg) => Msg) => setMsgs((xs) => xs.map((m) => (m.key === k ? f(m) : m))), []);

  async function send(text: string) {
    const q = text.trim();
    if ((!q && !photo) || busy) return;
    setBusy(true);
    setInput("");
    const uk = key(), mk = key();
    setMsgs((xs) => [...xs,
      { key: uk, id: null, role: "user", text: q || "Can you check this photo of my plant?", meta: { image: !!photo }, feedback: null },
      { key: mk, id: null, role: "model", text: "", meta: { tools: [], proposals: [] }, feedback: null, pending: true },
    ]);
    const form = new FormData();
    form.set("garden_id", gardenId);
    form.set("message", q);
    if (photo) form.set("image", photo);
    setPhoto(null);
    try {
      const res = await fetch("/api/chat", { method: "POST", body: form });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: "The assistant is unavailable right now." }));
        patch(mk, (m) => ({ ...m, pending: false, error: e.error }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "user") patch(uk, (m) => ({ ...m, id: ev.id }));
          else if (ev.type === "text") patch(mk, (m) => ({ ...m, text: m.text + ev.text }));
          else if (ev.type === "tool") patch(mk, (m) => ({ ...m, meta: { ...m.meta, tools: [...(m.meta.tools ?? []), { name: ev.name, label: ev.label, error: ev.error }] } }));
          else if (ev.type === "proposal") patch(mk, (m) => ({ ...m, meta: { ...m.meta, proposals: [...(m.meta.proposals ?? []), ev.proposal] } }));
          else if (ev.type === "done") patch(mk, (m) => ({ ...m, id: ev.id, pending: false, meta: { ...m.meta, source: ev.source } }));
          else if (ev.type === "error") patch(mk, (m) => ({ ...m, pending: false, error: ev.error }));
        }
      }
      patch(mk, (m) => (m.pending ? { ...m, pending: false } : m));
    } catch {
      patch(mk, (m) => ({ ...m, pending: false, error: "The assistant is unavailable right now." }));
    } finally {
      setBusy(false);
    }
  }

  async function decide(m: Msg, p: Proposal, action: "confirm" | "dismiss") {
    if (!m.id) return;
    const res = await fetch("/api/chat/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ garden_id: gardenId, message_id: m.id, proposal_id: p.id, action }) });
    const d = await res.json().catch(() => ({}));
    const next: Proposal = res.ok ? d.proposal : { ...p, result: d.error ?? "Couldn't do that." };
    patch(m.key, (x) => ({ ...x, meta: { ...x.meta, proposals: x.meta.proposals?.map((y) => (y.id === p.id ? next : y)) } }));
  }

  async function rate(m: Msg, v: 1 | -1) {
    if (!m.id) return;
    const value = m.feedback === v ? 0 : v;
    patch(m.key, (x) => ({ ...x, feedback: value || null }));
    await fetch("/api/chat/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_id: m.id, value }) }).catch(() => undefined);
  }

  async function clear() {
    if (busy || !confirm("Clear this chat?")) return;
    await fetch(`/api/chat?garden_id=${encodeURIComponent(gardenId)}`, { method: "DELETE" }).catch(() => undefined);
    setMsgs([]);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto space-y-4 p-3" aria-live="polite">
        {loaded && msgs.length === 0 && (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-primary"><Sparkles className="size-5" aria-hidden /><p className="font-semibold">Ask Garden AI about your garden</p></div>
            <p className="text-sm text-muted-foreground">I can see your plants, weather, alerts and tasks. Ask in any language.</p>
            <div className="flex flex-wrap gap-2">
              {STARTER_CHIPS.map((c) => (
                <button key={c.id} onClick={() => send(c.text)} disabled={busy}
                  className="rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-secondary text-left">{c.text}</button>
              ))}
            </div>
          </div>
        )}
        {!loaded && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading chat…</p>}
        {msgs.map((m) => (m.role === "user" ? (
          <div key={m.key} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap">
              {m.meta.image && <span className="flex items-center gap-1 text-xs opacity-80 mb-1"><Camera className="size-3" aria-hidden /> Photo attached</span>}
              {m.text}
            </div>
          </div>
        ) : (
          <div key={m.key} className="space-y-2">
            {!!m.meta.tools?.length && (
              <div className="flex flex-wrap gap-1.5">
                {m.meta.tools.map((t, i) => (
                  <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${t.error ? "bg-coral/15" : "bg-secondary"}`}>
                    <Check className="size-3" aria-hidden /> {t.label}
                  </span>
                ))}
              </div>
            )}
            {(m.text || m.pending) && (
              <div className="max-w-[95%] rounded-2xl rounded-bl-sm border bg-card px-3 py-2 text-sm">
                {m.text ? <Markdown text={m.text} /> : <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…</span>}
              </div>
            )}
            {m.error && <p className="rounded-xl bg-coral/10 px-3 py-2 text-sm">{m.error}</p>}
            {m.meta.proposals?.map((p) => <ProposalCard key={p.id} p={p} gardenId={gardenId} ready={!!m.id && !m.pending} onDecide={(a) => decide(m, p, a)} />)}
            {m.id && !m.pending && !m.error && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <button aria-label="Helpful" aria-pressed={m.feedback === 1} onClick={() => rate(m, 1)} className={`p-1 rounded hover:bg-muted ${m.feedback === 1 ? "text-primary" : ""}`}><ThumbsUp className="size-3.5" /></button>
                <button aria-label="Not helpful" aria-pressed={m.feedback === -1} onClick={() => rate(m, -1)} className={`p-1 rounded hover:bg-muted ${m.feedback === -1 ? "text-coral" : ""}`}><ThumbsDown className="size-3.5" /></button>
                {m.meta.source === "fixture" && <span className="text-[10px] uppercase tracking-wide ml-1">sample answer</span>}
              </div>
            )}
          </div>
        )))}
      </div>

      <form className="border-t p-2 space-y-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        {photo && (
          <div className="flex items-center gap-2 text-xs rounded-lg bg-secondary px-2 py-1 w-fit">
            <Camera className="size-3" aria-hidden /> {photo.name.slice(0, 30)}
            <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)}><X className="size-3" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          <Button type="button" variant="ghost" size="icon" aria-label="Add a plant photo" onClick={() => fileRef.current?.click()} disabled={busy}><Camera /></Button>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={compact ? 1 : 2} maxLength={2000}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask about your garden…" aria-label="Your question"
            className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={busy || (!input.trim() && !photo)}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
          <span>AI can be wrong. Check plant problems with your UF/IFAS Extension office.</span>
          {msgs.length > 0 && <button type="button" onClick={clear} className="inline-flex items-center gap-1 hover:text-foreground"><Trash2 className="size-3" aria-hidden /> Clear</button>}
        </div>
      </form>
    </div>
  );
}

function ProposalCard({ p, gardenId, ready, onDecide }: { p: Proposal; gardenId: string; ready: boolean; onDecide: (a: "confirm" | "dismiss") => Promise<void> }) {
  const [working, setWorking] = useState(false);
  const go = async (a: "confirm" | "dismiss") => { setWorking(true); await onDecide(a); setWorking(false); };
  const isPlant = p.name === "propose_add_plant";
  const a = p.args as { title?: string; due_at?: string; detail?: string; qty?: number };
  return (
    <div className="rounded-2xl border bg-secondary/40 p-3 text-sm space-y-2 max-w-[95%]">
      <div className="flex gap-3 items-start">
        <span className="rounded-xl bg-card p-2 text-primary">{isPlant ? <Sparkles className="size-4" aria-hidden /> : <CalendarPlus className="size-4" aria-hidden />}</span>
        <div className="flex-1">
          {isPlant && p.plant ? (
            <>
              <p className="font-semibold">{a.qty} × <Link className="underline" href={`/plants/${p.plant.id}`}>{p.plant.name}</Link> <span className="font-normal italic text-muted-foreground">{p.plant.scientific}</span></p>
              <p className="text-muted-foreground">{p.plant.line}</p>
            </>
          ) : (
            <>
              <p className="font-semibold">{a.title}</p>
              <p className="text-muted-foreground">Due {a.due_at}{a.detail ? ` · ${a.detail}` : ""}</p>
            </>
          )}
        </div>
      </div>
      {p.status === "pending" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!ready || working} onClick={() => go("confirm")}>{working ? <Loader2 className="animate-spin" /> : <Check />} {isPlant ? "Add to my garden" : "Add to my tasks"}</Button>
          <Button size="sm" variant="ghost" disabled={!ready || working} onClick={() => go("dismiss")}>Not now</Button>
          {p.result && <span className="text-coral text-xs">{p.result}</span>}
        </div>
      ) : (
        <p className={`text-xs ${p.status === "confirmed" ? "text-primary font-medium" : "text-muted-foreground"}`}>
          {p.status === "confirmed" ? "✓ " : ""}{p.result}
          {p.status === "confirmed" && isPlant && <> · <Link className="underline" href={`/design?garden=${gardenId}`}>Open Design</Link></>}
          {p.status === "confirmed" && !isPlant && <> · <Link className="underline" href={`/garden/${gardenId}/care`}>Open Care</Link></>}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tiny safe markdown (bold, italics, links, lists)

function Inline({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)|\*[^*\s][^*]*\*|https?:\/\/[^\s)]+)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={m.index}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("[")) {
      const label = t.slice(1, t.indexOf("]"));
      out.push(<a key={m.index} href={m[2]} target={m[2].startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="underline">{label}</a>);
    } else if (t.startsWith("http")) out.push(<a key={m.index} href={t} target="_blank" rel="noreferrer" className="underline break-all">{t}</a>);
    else out.push(<em key={m.index}>{t.slice(1, -1)}</em>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    blocks.push(L.ordered
      ? <ol key={blocks.length} className="list-decimal pl-5 space-y-1">{L.items.map((t, i) => <li key={i}><Inline text={t} /></li>)}</ol>
      : <ul key={blocks.length} className="list-disc pl-5 space-y-1">{L.items.map((t, i) => <li key={i}><Inline text={t} /></li>)}</ul>);
    list = null;
  };
  for (const line of lines) {
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ol || ul) {
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((ol ?? ul)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    blocks.push(h ? <p key={blocks.length} className="font-semibold"><Inline text={h[1]} /></p> : <p key={blocks.length}><Inline text={line} /></p>);
  }
  flush();
  return <div className="space-y-2 leading-relaxed">{blocks}</div>;
}
