export function createEmitter() {
	const events = new Map(); let nextId = 0;
	function add(name, listener, once) { const entry = { id: nextId++, listener, once, active: true }; const list = events.get(name) ?? []; list.push(entry); events.set(name, list); return () => removeEntry(name, entry); }
	function removeEntry(name, entry) { if (!entry.active) return false; entry.active = false; const list = events.get(name); if (list) { const next = list.filter(item => item !== entry); if (next.length) events.set(name, next); else events.delete(name); } return true; }
	function on(name, listener) { return add(name, listener, false); }
	function once(name, listener) { return add(name, listener, true); }
	function off(name, listener) { const list = events.get(name) ?? []; let removed = false; for (const entry of list) if (entry.listener === listener) removed = removeEntry(name, entry) || removed; return removed; }
	function emit(name, ...args) { const snapshot = [...(events.get(name) ?? [])]; let called = 0; for (const entry of snapshot) { if (!entry.active) continue; if (entry.once) removeEntry(name, entry); called += 1; entry.listener(...args); } return called; }
	return { on, once, off, emit };
}
