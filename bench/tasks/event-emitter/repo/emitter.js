export function createEmitter() {
	const events = new Map();
	function on(name, listener) { const list = events.get(name) ?? []; list.push(listener); events.set(name, list); return () => off(name, listener); }
	function off(name, listener) { const list = events.get(name) ?? []; const next = list.filter(item => item !== listener); events.set(name, next); return next.length !== list.length; }
	function once(name, listener) { return on(name, (...args) => { listener(...args); off(name, listener); }); }
	function emit(name, ...args) { const list = events.get(name) ?? []; for (const listener of list) listener(...args); return list.length; }
	return { on, once, off, emit };
}
