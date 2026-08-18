import { expect, test } from "bun:test"; import { topoSort } from "../topo.js";
test("uses node order when several nodes are ready", () => expect(topoSort(["b", "a", "c"], [["a", "c"]])).toEqual(["b", "a", "c"]));
test("ignores duplicate edges", () => expect(topoSort(["a", "b"], [["a", "b"], ["a", "b"]])).toEqual(["a", "b"]));
test("includes isolated nodes", () => expect(topoSort(["z", "a", "b"], [["a", "b"]])).toEqual(["z", "a", "b"]));
test("rejects invalid node declarations", () => { expect(() => topoSort(["a", "a"], [])).toThrow(TypeError); expect(() => topoSort(["a"], [["a", "b"]])).toThrow(TypeError); });
test("does not mutate inputs", () => { const nodes = ["b", "a"]; const edges = [["a", "b"]]; topoSort(nodes, edges); expect(nodes).toEqual(["b", "a"]); expect(edges).toEqual([["a", "b"]]); });
test("treats self edges as cycles", () => expect(topoSort(["a"], [["a", "a"]])).toBeNull());
