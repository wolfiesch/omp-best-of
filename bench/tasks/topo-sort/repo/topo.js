export function topoSort(nodes, edges) {
	const indegree = new Map(); const next = new Map();
	for (const [from, to] of edges) { indegree.set(to, (indegree.get(to) ?? 0) + 1); const list = next.get(from) ?? []; list.push(to); next.set(from, list); }
	const ready = nodes.filter(node => !indegree.get(node)); const result = [];
	while (ready.length) { const node = ready.shift(); result.push(node); for (const target of next.get(node) ?? []) { indegree.set(target, indegree.get(target) - 1); if (indegree.get(target) === 0) ready.push(target); } }
	return result.length === nodes.length ? result : null;
}
