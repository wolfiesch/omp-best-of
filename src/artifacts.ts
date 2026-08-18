import { chmod, mkdir, writeFile } from "node:fs/promises";

export async function ensurePrivateDirectory(directory: string): Promise<void> {
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await chmod(directory, 0o700);
}

export async function writePrivateFile(file: string, content: string | Uint8Array): Promise<void> {
	await writeFile(file, content, { mode: 0o600 });
	await chmod(file, 0o600);
}

export async function secureExistingFile(file: string): Promise<void> {
	try {
		await chmod(file, 0o600);
	} catch (error) {
		const systemError = error as NodeJS.ErrnoException;
		if (systemError.code !== "ENOENT") throw error;
	}
}
