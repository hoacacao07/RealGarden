/**
 * Garden Assistant server glue (spec 7B): builds the tool context for one garden, loads and saves chat history,
 * matches the demo starter chips to their fixtures, and performs confirmed write proposals.
 *
 * Writes only ever happen in confirmProposal(), which reads the proposal from the stored model message (so the
 * browser can't invent one), validates it again and marks it confirmed. chatWithTools never writes.
 */
import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import { alertViews } from "./alerts";
import { careBundle, type CareBundle } from "./care";
import { friendlyLine, groupOf, isBlocked, isEdible } from "./catalog";
import { getZone } from "./clients/phzm";
import { ecoBundle, todayIso } from "./eco";
import { getGarden, getPlant } from "./data";
import { DEFAULT_BAG_FT3, shoppingList } from "./engine/shopping";
import { planInputs } from "./plan";
import { WRITE_TOOLS, type ChatTask, type ToolCtx, type WriteToolName } from "./ai/assistantTools";
import type { ChatMessage } from "./ai/gemini";
import type { GardenDoc, Plant } from "./types";

export const HISTORY_LIMIT = 20;
export const CHAT_RATE_LIMIT = 30;

export { STARTER_CHIPS, chipId } from "./assistant-chips";

// ---------------------------------------------------------------- tool context

export function toolCtx(g: GardenDoc, plants: Plant[]): ToolCtx {
  let care: Promise<CareBundle> | null = null;
  const inputs = planInputs(g, plants);
  return {
    garden: g, plants, today: todayIso(),
    care: () => (care ??= careBundle(g, plants, null)),
    alerts: () => alertViews(g.id, { activeOnly: true }),
    chatTasks: async () => {
      const rows = await prisma.task.findMany({ where: { garden_id: g.id, source: "chat" }, orderBy: { due_at: "asc" }, take: 30 });
      return rows.map((t): ChatTask => ({ id: t.id, title: t.title, detail: t.detail, due_at: t.due_at.toISOString().slice(0, 10), done: t.done }));
    },
    shopping: () => {
      const base = shoppingList({ ...inputs.shopping, bagFt3: DEFAULT_BAG_FT3, mix: "bagged" });
      return [...inputs.balconyLines, ...base];
    },
    eco: async () => {
      const b = await ecoBundle(g.id);
      return b && { report: b.report, swaps: b.swaps };
    },
    zone: (zip) => getZone(zip, g.site.lat),
  };
}

// ---------------------------------------------------------------- history

export interface StoredTools {
  tools?: { name: string; label: string; error?: boolean }[];
  proposals?: Proposal[];
  image?: boolean;
  source?: string;
}
export interface Proposal {
  id: string;
  name: WriteToolName;
  args: Record<string, unknown>;
  status: "pending" | "confirmed" | "dismissed";
  plant?: { id: string; name: string; scientific: string; line: string; group: string };
  result?: string;
}

export interface HistoryItem { id: string; role: "user" | "model"; text: string; meta: StoredTools; feedback: number | null; created_at: string }

export async function loadHistory(gardenId: string, take = 50): Promise<HistoryItem[]> {
  const rows = await prisma.chatMessage.findMany({ where: { garden_id: gardenId }, orderBy: { created_at: "desc" }, take });
  return rows.reverse().map((r) => ({
    id: r.id, role: r.role === "model" ? "model" : "user", text: r.content, meta: (r.tool_calls ?? {}) as StoredTools,
    feedback: r.feedback, created_at: r.created_at.toISOString(),
  }));
}

/**
 * Messages for the model: the last 20, starting with a user turn, with consecutive same-role turns merged
 * (a failed answer leaves two user turns in a row).
 */
export function modelHistory(items: Pick<HistoryItem, "role" | "text">[], limit = HISTORY_LIMIT): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of items.slice(-limit)) {
    if (!m.text.trim()) continue;
    if (!out.length && m.role !== "user") continue;
    const last = out.at(-1);
    if (last && last.role === m.role) last.text += `\n\n${m.text}`;
    else out.push({ role: m.role, text: m.text });
  }
  return out;
}

export async function saveMessage(gardenId: string, role: "user" | "model", content: string, meta: StoredTools) {
  const r = await prisma.chatMessage.create({ data: { garden_id: gardenId, role, content, tool_calls: meta as unknown as Prisma.InputJsonValue } });
  return r.id;
}

/** Plant card shown inside an answer for propose_add_plant. Null for unknown or invasive plants. */
export function plantCard(p: Plant | undefined): Proposal["plant"] | null {
  if (!p || isBlocked(p)) return null;
  return { id: p.id, name: p.common_name, scientific: p.scientific_name, line: friendlyLine(p), group: groupOf(p) };
}

// ---------------------------------------------------------------- confirm

export type ConfirmResult = { ok: true; text: string; proposal: Proposal } | { ok: false; status: number; error: string };

/** Run one stored proposal after the user tapped Confirm (or mark it dismissed). */
export async function confirmProposal(gardenId: string, messageId: string, proposalId: string, action: "confirm" | "dismiss"): Promise<ConfirmResult> {
  const msg = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg || msg.garden_id !== gardenId || msg.role !== "model") return { ok: false, status: 404, error: "Message not found" };
  const meta = (msg.tool_calls ?? {}) as StoredTools;
  const p = meta.proposals?.find((x) => x.id === proposalId);
  if (!p) return { ok: false, status: 404, error: "Suggestion not found" };
  if (p.status !== "pending") return { ok: true, text: p.result ?? "Already done.", proposal: p };

  let text = "Dismissed.";
  if (action === "confirm") {
    const schema = WRITE_TOOLS[p.name];
    if (!schema) return { ok: false, status: 400, error: "Unknown action" };
    const parsed = schema.safeParse(p.args);
    if (!parsed.success) return { ok: false, status: 400, error: "That suggestion is no longer valid" };
    const r = p.name === "propose_task"
      ? await addTask(gardenId, parsed.data as { title: string; due_at: string; detail?: string })
      : await addPlant(gardenId, parsed.data as { plant_id: string; qty: number });
    if (!r.ok) return r;
    text = r.text;
  }
  const next: Proposal = { ...p, status: action === "confirm" ? "confirmed" : "dismissed", result: text };
  const proposals = meta.proposals!.map((x) => (x.id === proposalId ? next : x));
  await prisma.chatMessage.update({ where: { id: messageId }, data: { tool_calls: { ...meta, proposals } as unknown as Prisma.InputJsonValue } });
  return { ok: true, text, proposal: next };
}

async function addTask(gardenId: string, t: { title: string; due_at: string; detail?: string }): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const today = todayIso();
  const due = t.due_at < today ? today : t.due_at;
  await prisma.task.create({
    data: { garden_id: gardenId, kind: "chat", title: t.title, detail: t.detail ?? null, due_at: new Date(due + "T12:00:00Z"), priority: "normal", source: "chat" },
  });
  return { ok: true, text: `Added "${t.title}" to your care list for ${due}.` };
}

/** Add N plants to the garden: into the first bed of the matching kind (edible or landscape), in a small grid. */
async function addPlant(gardenId: string, a: { plant_id: string; qty: number }): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const [plant, garden] = await Promise.all([getPlant(a.plant_id), getGarden(gardenId)]);
  if (!garden) return { ok: false, status: 404, error: "Garden not found" };
  if (!plant) return { ok: false, status: 400, error: "That plant isn't in the catalog" };
  if (isBlocked(plant)) return { ok: false, status: 400, error: "That plant is invasive in Florida and can't be added" };
  const want = isEdible(plant) ? "edible" : "landscape";
  const zone = garden.zones.find((z) => (z.kind ?? "landscape") === want) ?? garden.zones[0] ?? null;
  const poly = zone?.polygon ?? [];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const box = poly.length
    ? { x0: Math.min(...xs), y0: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    : { x0: 0, y0: 0, w: garden.canvas_w_ft, h: garden.canvas_h_ft };
  const cols = Math.max(1, Math.min(a.qty, Math.ceil(Math.sqrt(a.qty * (box.w / Math.max(box.h, 1))))));
  const rows = Math.ceil(a.qty / cols);
  const today = new Date(todayIso() + "T12:00:00Z");
  const balcony = garden.site.kind === "balcony";
  await prisma.placement.createMany({
    data: Array.from({ length: a.qty }, (_, i) => ({
      garden_id: gardenId, plant_id: plant.id, zone_id: zone?.id ?? null, planted_on: today,
      x_ft: round1(box.x0 + (box.w * ((i % cols) + 0.5)) / cols),
      y_ft: round1(box.y0 + (box.h * (Math.floor(i / cols) + 0.5)) / rows),
      ...(balcony && { container_gal: 5, mount: "floor" }),
    })),
  });
  await prisma.garden.update({ where: { id: gardenId }, data: { updated_at: new Date() } });
  return { ok: true, text: `Added ${a.qty} ${plant.common_name} to ${zone?.name ?? "your garden"}. Open Design to move them.` };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
