#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function findNodePtyDir() {
	try {
		const pkgJson = require.resolve("node-pty/package.json", {
			paths: [process.cwd()],
		});
		return path.dirname(pkgJson);
	} catch {
		return null;
	}
}

function rebuildNodePty(pkgDir) {
	console.log("[ensure-node-pty] Rebuilding node-pty for Node ABI", process.versions.modules);
	try {
		execFileSync("node-gyp", ["rebuild"], {
			cwd: pkgDir,
			stdio: "inherit",
		});
		return;
	} catch (error) {
		if (error && error.code !== "ENOENT") {
			throw error;
		}
	}

	execFileSync("pnpm", ["exec", "node-gyp", "rebuild"], {
		cwd: pkgDir,
		stdio: "inherit",
	});
}

const pkgDir = findNodePtyDir();
if (!pkgDir) {
	process.exit(0);
}

const releaseBinary = path.join(pkgDir, "build", "Release", "pty.node");
const debugBinary = path.join(pkgDir, "build", "Debug", "pty.node");

const hasBinary = fs.existsSync(releaseBinary) || fs.existsSync(debugBinary);

try {
	require("node-pty");
	process.exit(0);
} catch (error) {
	const message = String(error && error.message ? error.message : error);
	const isAbiIssue =
		error &&
		(error.code === "ERR_DLOPEN_FAILED" ||
			error.code === "MODULE_NOT_FOUND" ||
			message.includes("NODE_MODULE_VERSION") ||
			message.includes("pty.node"));

	if (!isAbiIssue && hasBinary) {
		throw error;
	}
}

rebuildNodePty(pkgDir);
