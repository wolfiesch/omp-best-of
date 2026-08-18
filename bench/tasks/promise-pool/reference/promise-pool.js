export async function mapLimit(items, limit, mapper) {
	if (!Number.isInteger(limit) || limit <= 0) throw new RangeError("limit must be a positive integer");
	if (items.length === 0) return [];
	const results = new Array(items.length);
	let next = 0;
	let failed = false;
	return new Promise((resolve, reject) => {
		let active = 0;
		const launch = () => {
			if (failed) return;
			if (next === items.length && active === 0) { resolve(results); return; }
			while (!failed && active < limit && next < items.length) {
				const index = next++;
				active += 1;
				Promise.resolve()
					.then(() => mapper(items[index], index))
					.then(value => {
						active -= 1;
						results[index] = value;
						launch();
					}, error => {
						if (failed) return;
						failed = true;
						reject(error);
					});
			}
		};
		launch();
	});
}
