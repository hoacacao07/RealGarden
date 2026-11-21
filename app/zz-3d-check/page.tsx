// TEMPORARY visual check for the 3D inspector. Deleted before commit.
import { getPlants } from "@/lib/data";
import { Opener } from "./opener";
export const dynamic = "force-dynamic";
export default async function P({ searchParams }: PageProps<"/zz-3d-check">) {
  const sp = await searchParams;
  const p = (await getPlants()).find((x) => x.id === sp.id)!;
  return <Opener plant={p} month={Number(sp.m ?? 6)} planted={String(sp.p ?? "2025-09-27")} />;
}
