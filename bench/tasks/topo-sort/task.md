`topoSort(nodes, edges)` in `topo.js` is incomplete. Fix it.

Return a deterministic topological ordering or `null` for a cycle. `nodes` is an array of unique string node ids in priority order. Each edge is `[before, after]`. Reject duplicate node ids or edges that name an unknown node with `TypeError`. Duplicate edges are ignored. When several nodes are ready, choose the one appearing earliest in `nodes`. Include isolated nodes. Do not mutate either input. A self-edge is a cycle.

Keep the export and signature. Visible tests cover a simple chain only.
