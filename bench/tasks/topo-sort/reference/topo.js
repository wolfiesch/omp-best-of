export function topoSort(nodes, edges) {
	if (new Set(nodes).size !== nodes.length) throw new TypeError("Duplicate node");
	const order = new Map(nodes.map((node, index) => [node, index])); const indegree = new Map(nodes.map(node => [node, 0])); const next = new Map(nodes.map(node => [node, []])); const seen = new Set();
	for (const [from, to] of edges) { if (!order.has(from) || !order.has(to)) throw new TypeError("Unknown node"); const key = JSON.stringify([from, to]); if (seen.has(key)) continue; seen.add(key); next.get(from).push(to); indegree.set(to, indegree.get(to) + 1); }
	const ready = nodes.filter(node => indegree.get(node) === 0); const result = [];
	while (ready.length) { ready.sort((a, b) => order.get(a) - order.get(b)); const node = ready.shift(); result.push(node); for (const target of next.get(node)) { indegree.set(target, indegree.get(target) - 1); if (indegree.get(target) === 0) ready.push(target); } }
	return result.length === nodes.length ? result : null;
}
