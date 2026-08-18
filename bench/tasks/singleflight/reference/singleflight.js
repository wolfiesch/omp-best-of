export function createSingleflight(loader) {
	const inFlight = new Map();
	return function load(key) {
		if (inFlight.has(key)) return inFlight.get(key);
		let shared = Promise.resolve().then(() => loader(key));
		shared = shared.finally(() => {
			if (inFlight.get(key) === shared) inFlight.delete(key);
		});
		inFlight.set(key, shared);
		return shared;
	};
}
