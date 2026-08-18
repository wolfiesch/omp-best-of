import { expect, test } from "bun:test";
import { runCommand } from "../src/process";

const unixTest = process.platform === "win32" ? test.skip : test;

// These integration checks exercise the real OS signal and timer boundary; fake
// timers cannot drive Bun.spawn process-group delivery.
unixTest("times out and kills the subprocess process group", async () => {
	const started = Date.now();
	const result = await runCommand(["bash", "-c", 'trap "" TERM; sleep 30 & child=$!; echo "$child"; wait'], {
		timeoutMs: 50,
		terminationGraceMs: 50,
	});

	expect(result.timedOut).toBe(true);
	expect(result.aborted).toBe(false);
	expect(Date.now() - started).toBeLessThan(2_000);
	const childPid = Number(result.stdout.trim());
	expect(Number.isSafeInteger(childPid)).toBe(true);
	expect(() => process.kill(childPid, 0)).toThrow();
});

unixTest("propagates AbortSignal cancellation to the subprocess group", async () => {
	const controller = new AbortController();
	const pending = runCommand(["bash", "-c", 'trap "" TERM; sleep 30 & wait'], {
		signal: controller.signal,
		terminationGraceMs: 50,
	});
	controller.abort(new Error("cancel test"));
	const result = await pending;
	expect(result.aborted).toBe(true);
	expect(result.timedOut).toBe(false);
});
