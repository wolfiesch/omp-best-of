export function createSingleflight(loader) {
	const cache = new Map();
	return function load(key) {
		if (!cache.has(key)) cache.set(key, Promise.resolve(loader(key)));
		return cache.get(key);
	};
}
