export function memoizeAsync(fn) {
	const cache = new Map();
	return async function memoized(key, ...args) {
		if (cache.has(key)) return cache.get(key);
		const promise = Promise.resolve(fn.call(this, key, ...args));
		cache.set(key, promise);
		return promise;
	};
}
