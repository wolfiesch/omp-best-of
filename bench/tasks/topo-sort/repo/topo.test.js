import { expect, test } from "bun:test"; import { topoSort } from "./topo.js";
test("sorts a chain", () => expect(topoSort(["a", "b", "c"], [["a", "b"], ["b", "c"]])).toEqual(["a", "b", "c"]));
test("returns null for a cycle", () => expect(topoSort(["a", "b"], [["a", "b"], ["b", "a"]])).toBeNull());
