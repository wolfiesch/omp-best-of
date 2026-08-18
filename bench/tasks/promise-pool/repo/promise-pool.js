export async function mapLimit(items, limit, mapper) {
	return Promise.all(items.map((value, index) => mapper(value, index)));
}
