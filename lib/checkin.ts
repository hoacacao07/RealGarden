/** Check-in pipeline shared by /api/identify, /api/diagnose and /api/checkins (server only). */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { DEMO_PHOTOS, type DemoPhoto } from "./ai/features";
import type { IdentifyResult } from "./clients/plantnet";
import type { Plant } from "./types";

export const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export class UploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface PhotoIn { bytes: Buffer; demoPhoto: DemoPhoto | null }

/** Read the image from multipart form data: either an uploaded `image` file or a `demo_photo` name. */
export async function readPhoto(form: FormData): Promise<PhotoIn> {
  const demo = form.get("demo_photo");
  if (typeof demo === "string" && demo) {
    if (!DEMO_PHOTOS.includes(demo as DemoPhoto)) throw new UploadError(`demo_photo must be one of ${DEMO_PHOTOS.join(", ")}`);
    const bytes = fs.readFileSync(path.join(process.cwd(), "public", "demo-photos", `${demo}.jpg`));
    return { bytes, demoPhoto: demo as DemoPhoto };
  }
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) throw new UploadError("Add a photo (image file) or pick a demo photo.");
  if (file.size > MAX_BYTES) throw new UploadError("Photo is larger than 5 MB. Try a smaller one.", 413);
  if (file.type && !OK_TYPES.includes(file.type)) throw new UploadError("Use a JPEG, PNG, WebP or HEIC photo.");
  return { bytes: Buffer.from(await file.arrayBuffer()), demoPhoto: null };
}

/**
 * Re-encode as JPEG. `.rotate()` applies EXIF orientation, and sharp drops all metadata (EXIF GPS included)
 * unless `withMetadata()` is called, so the stored photo carries no location.
 */
export async function cleanPhoto(bytes: Buffer): Promise<{ jpeg: Buffer; thumb: Buffer; base64: string }> {
  try {
    const jpeg = await sharp(bytes).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const thumb = await sharp(jpeg).resize(480, 480, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
    return { jpeg, thumb, base64: jpeg.toString("base64") };
  } catch {
    throw new UploadError("Could not read that image. Try a JPEG or PNG photo.");
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").split(" ").slice(0, 2).join(" ");

/** Match Pl@ntNet results to the catalog by scientific name (genus + species). */
export function matchPlant(r: IdentifyResult, plants: Plant[]): { plant: Plant; score: number } | null {
  for (const x of r.results) {
    const name = norm(x.species.scientificNameWithoutAuthor);
    const p = plants.find((pl) => norm(pl.scientific_name) === name);
    if (p) return { plant: p, score: x.score };
  }
  return null;
}
