export function memoizeAsync(fn) {
	const cache = new Map();
	return function memoized(key, ...args) {
		if (cache.has(key)) return cache.get(key);
		let promise;
		try { promise = Promise.resolve(fn.call(this, key, ...args)); } catch (error) { return Promise.reject(error); }
		cache.set(key, promise);
		promise.catch(() => { if (cache.get(key) === promise) cache.delete(key); });
		return promise;
	};
}
