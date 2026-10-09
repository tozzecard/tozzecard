import { expect, test } from "bun:test";
import { openapi } from "./openapi";

test("every route in index.ts is documented", async () => {
  const src = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  const routes = [
    ...src.matchAll(/app\.(?:get|post|put|patch|on)\(\s*(?:\[[^\]]*\],\s*)?"([^"]+)"/g),
  ]
    .map((m) => m[1].replace(/:(\w+)/g, "{$1}"))
    .filter((p) => p !== "*" && p !== "/openapi.json" && p !== "/docs");
  expect(routes.length).toBeGreaterThan(15);
  expect(routes.filter((p) => !(p in openapi.paths))).toEqual([]);
});
