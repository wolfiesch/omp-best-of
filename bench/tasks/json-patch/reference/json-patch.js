function clone(value, stack = new WeakSet()) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (!value || typeof value !== "object") throw new TypeError("value is not JSON-compatible");
	if (stack.has(value)) throw new TypeError("cyclic value");
	stack.add(value);
	try {
		if (Array.isArray(value)) return value.map(item => clone(item, stack));
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new TypeError("value is not JSON-compatible");
		const result = {};
		for (const key of Object.keys(value)) define(result, key, clone(value[key], stack));
		return result;
	} finally { stack.delete(value); }
}
function define(object, key, value) {
	Object.defineProperty(object, key, { value, enumerable: true, configurable: true, writable: true });
}
function tokens(path) {
	if (path === "") return [];
	if (typeof path !== "string" || !path.startsWith("/")) throw new Error("invalid JSON pointer");
	return path.slice(1).split("/").map(token => {
		if (/~(?:[^01]|$)/.test(token)) throw new Error("invalid JSON pointer escape");
		return token.replace(/~1/g, "/").replace(/~0/g, "~");
	});
}
function index(token, length, adding) {
	if (adding && token === "-") return length;
	if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error("invalid array index");
	const value = Number(token);
	if (!Number.isSafeInteger(value) || value < 0 || value > (adding ? length : length - 1)) throw new Error("array index out of bounds");
	return value;
}
function parent(root, pathTokens) {
	let current = root;
	for (const token of pathTokens.slice(0, -1)) {
		if (Array.isArray(current)) current = current[index(token, current.length, false)];
		else if (current && typeof current === "object" && Object.hasOwn(current, token)) current = current[token];
		else throw new Error("missing parent");
	}
	if (!current || typeof current !== "object") throw new Error("missing parent");
	return { current, key: pathTokens.at(-1) };
}
function equal(left, right) {
	if (left === right) return true;
	if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	const leftKeys = Object.keys(left); const rightKeys = Object.keys(right);
	return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
}
function get(root, pathTokens) {
	let current = root;
	for (const token of pathTokens) {
		if (Array.isArray(current)) current = current[index(token, current.length, false)];
		else if (current && typeof current === "object" && Object.hasOwn(current, token)) current = current[token];
		else throw new Error("missing target");
	}
	return current;
}

export function applyPatch(document, operations) {
	if (!Array.isArray(operations)) throw new TypeError("operations must be an array");
	let result = clone(document);
	for (const operation of operations) {
		if (!operation || typeof operation !== "object" || typeof operation.op !== "string" || typeof operation.path !== "string") throw new TypeError("malformed operation");
		if (!["add", "remove", "replace", "test"].includes(operation.op)) throw new Error("unsupported operation");
		const pathTokens = tokens(operation.path);
		if (["add", "replace", "test"].includes(operation.op) && !Object.hasOwn(operation, "value")) throw new Error("missing value");
		if (operation.op === "test") {
			if (!equal(get(result, pathTokens), operation.value)) throw new Error("test failed");
			continue;
		}
		if (pathTokens.length === 0) {
			if (operation.op === "remove") throw new Error("cannot remove root");
			result = clone(operation.value);
			continue;
		}
		const { current, key } = parent(result, pathTokens);
		if (Array.isArray(current)) {
			if (operation.op === "add") current.splice(index(key, current.length, true), 0, clone(operation.value));
			else {
				const target = index(key, current.length, false);
				if (operation.op === "remove") current.splice(target, 1);
				else current[target] = clone(operation.value);
			}
		} else {
			const exists = Object.hasOwn(current, key);
			if (operation.op !== "add" && !exists) throw new Error("missing target");
			if (operation.op === "remove") delete current[key];
			else define(current, key, clone(operation.value));
		}
	}
	return result;
}
