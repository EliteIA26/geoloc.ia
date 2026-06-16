import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AlertasSchema, SeriesSchema } from "./data";

const dataDir = join(process.cwd(), "public", "data");
const load = (f: string) => JSON.parse(readFileSync(join(dataDir, f), "utf8"));

describe("seed data validates against schemas", () => {
  it("alertas.json", () => {
    expect(() => AlertasSchema.parse(load("alertas.json"))).not.toThrow();
  });
  it("series-ndvi.json", () => {
    expect(() => SeriesSchema.parse(load("series-ndvi.json"))).not.toThrow();
  });
});
