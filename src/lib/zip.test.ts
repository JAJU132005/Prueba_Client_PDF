import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { createZipBlob } from "@/lib/zip";

describe("createZipBlob", () => {
  const files = [
    { name: "a.png", bytes: new Uint8Array([1, 2, 3]) },
    { name: "b.jpg", bytes: new Uint8Array([4, 5]) },
  ];

  it("devuelve un Blob application/zip (R14)", () => {
    expect(createZipBlob(files).type).toBe("application/zip");
  });

  it("con al menos un archivo no vacío tiene size > 0 (R16)", () => {
    expect(createZipBlob(files).size).toBeGreaterThan(0);
  });

  it("roundtrip: recupera nombres y bytes exactos (R15)", async () => {
    const blob = createZipBlob(files);
    const buffer = await blob.arrayBuffer();
    const entries = unzipSync(new Uint8Array(buffer));
    expect(Object.keys(entries).sort()).toEqual(["a.png", "b.jpg"]);
    expect(Array.from(entries["a.png"])).toEqual([1, 2, 3]);
    expect(Array.from(entries["b.jpg"])).toEqual([4, 5]);
  });
});
