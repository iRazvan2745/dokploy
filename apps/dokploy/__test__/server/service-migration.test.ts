import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/services/application", () => ({
	findApplicationById: vi.fn(),
	updateApplication: vi.fn(),
	deployApplication: vi.fn(),
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: vi.fn(),
	updateCompose: vi.fn(),
	deployCompose: vi.fn(),
}));

vi.mock("@dokploy/server/services/postgres", () => ({
	findPostgresById: vi.fn(),
	updatePostgresById: vi.fn(),
	deployPostgres: vi.fn(),
}));

vi.mock("@dokploy/server/services/mysql", () => ({
	findMySqlById: vi.fn(),
	updateMySqlById: vi.fn(),
	deployMySql: vi.fn(),
}));

vi.mock("@dokploy/server/services/mariadb", () => ({
	findMariadbById: vi.fn(),
	updateMariadbById: vi.fn(),
	deployMariadb: vi.fn(),
}));

vi.mock("@dokploy/server/services/mongo", () => ({
	findMongoById: vi.fn(),
	updateMongoById: vi.fn(),
	deployMongo: vi.fn(),
}));

vi.mock("@dokploy/server/services/redis", () => ({
	findRedisById: vi.fn(),
	updateRedisById: vi.fn(),
	deployRedis: vi.fn(),
}));

vi.mock("@dokploy/server/services/libsql", () => ({
	findLibsqlById: vi.fn(),
	updateLibsqlById: vi.fn(),
	deployLibsql: vi.fn(),
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: vi.fn(async () => ({
		getService: vi.fn(() => ({
			inspect: vi.fn(),
		})),
	})),
}));

import * as applicationService from "@dokploy/server/services/application";
import * as serverService from "@dokploy/server/services/server";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { getRemoteDocker } from "@dokploy/server/utils/servers/remote-docker";
import {
	buildMigrationLookup,
	hasBindMounts,
	shouldCopyApplicationDropCode,
} from "@dokploy/server/services/service-migration";

const createApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "app-1",
	appName: "app-one",
	name: "App One",
	serverId: "source-server",
	buildServerId: null,
	sourceType: "drop",
	applicationStatus: "idle",
	mounts: [
		{
			mountId: "mount-volume",
			type: "volume",
			volumeName: "app-one-data",
			mountPath: "/data",
		},
		{
			mountId: "mount-file",
			type: "file",
			filePath: "config/env",
			mountPath: "/app/.env",
		},
	],
	...overrides,
});

const createServer = (serverId: string, overrides: Record<string, unknown> = {}) => ({
	serverId,
	name: serverId,
	serverType: "deploy",
	serverStatus: "active",
	ipAddress: `${serverId}.example.com`,
	port: 22,
	username: "root",
	sshKeyId: `${serverId}-ssh`,
	sshKey: {
		privateKey: "PRIVATE KEY",
	},
	...overrides,
});

describe("service migration preflight", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(applicationService.findApplicationById).mockResolvedValue(
			createApplication() as any,
		);
		vi.mocked(serverService.findServerById).mockImplementation(async (serverId: string) =>
			createServer(serverId),
		);
		vi.mocked(execProcess.execAsync).mockResolvedValue({
			stdout: "",
			stderr: "",
		} as any);
		vi.mocked(execProcess.execAsyncRemote).mockResolvedValue({
			stdout: "",
			stderr: "",
		} as any);
		vi.mocked(getRemoteDocker).mockResolvedValue({
			getService: vi.fn(() => ({
				inspect: vi.fn().mockRejectedValue(new Error("not found")),
			})),
		} as any);
	});

	it("detects drop applications that need file and code sync", async () => {
		const lookup = await buildMigrationLookup(
			"application",
			"app-1",
			"target-server",
		);

		expect(lookup.filesPath).toBe("/etc/dokploy/applications/app-one/files");
		expect(lookup.codePath).toBe("/etc/dokploy/applications/app-one/code");
		expect(lookup.sourceServerId).toBe("source-server");
		expect(lookup.targetServerId).toBe("target-server");
	});

	it("supports dokploy server as the source endpoint", async () => {
		vi.mocked(applicationService.findApplicationById).mockResolvedValue(
			createApplication({
				serverId: null,
			}) as any,
		);

		const lookup = await buildMigrationLookup(
			"application",
			"app-1",
			"target-server",
		);

		expect(lookup.sourceServerId).toBeNull();
		expect(lookup.sourceServerName).toBe("Dokploy server");
		expect(lookup.targetServerId).toBe("target-server");
	});

	it("supports dokploy server as the target endpoint", async () => {
		const lookup = await buildMigrationLookup("application", "app-1", "local");

		expect(lookup.sourceServerId).toBe("source-server");
		expect(lookup.targetServerId).toBeNull();
		expect(lookup.targetServerName).toBe("Dokploy server");
	});

	it("rejects services with bind mounts", async () => {
		vi.mocked(applicationService.findApplicationById).mockResolvedValue(
			createApplication({
				mounts: [
					{
						mountId: "mount-bind",
						type: "bind",
						hostPath: "/srv/data",
						mountPath: "/data",
					},
				],
			}) as any,
		);

		await expect(
			buildMigrationLookup("application", "app-1", "target-server"),
		).rejects.toMatchObject({
			message: "Services with bind mounts are not supported for migration",
		});
	});

	it("rejects services that are not stopped", async () => {
		vi.mocked(applicationService.findApplicationById).mockResolvedValue(
			createApplication({
				applicationStatus: "running",
			}) as any,
		);

		await expect(
			buildMigrationLookup("application", "app-1", "target-server"),
		).rejects.toMatchObject({
			message: "Service must be stopped before migration",
		});
	});

	it("rejects missing rsync on either server", async () => {
		vi.mocked(execProcess.execAsyncRemote).mockImplementation(
			async (serverId: string, command: string) => {
				if (
					command.includes("command -v rsync") &&
					serverId === "source-server"
				) {
					throw new Error("missing rsync");
				}
				return { stdout: "", stderr: "" } as any;
			},
		);

		await expect(
			buildMigrationLookup("application", "app-1", "target-server"),
		).rejects.toMatchObject({
			message: "Source server is missing rsync",
		});
	});

	it("rejects target docker service conflicts", async () => {
		vi.mocked(getRemoteDocker).mockResolvedValue({
			getService: vi.fn(() => ({
				inspect: vi.fn().mockResolvedValue({ id: "docker-service" }),
			})),
		} as any);

		await expect(
			buildMigrationLookup("application", "app-1", "target-server"),
		).rejects.toBeInstanceOf(TRPCError);
		await expect(
			buildMigrationLookup("application", "app-1", "target-server"),
		).rejects.toMatchObject({
			message: "Target server already has a Docker service named app-one",
		});
	});
});

describe("service migration helpers", () => {
	it("detects bind mounts", () => {
		expect(
			hasBindMounts([
				{
					mountId: "mount-bind",
					type: "bind",
					hostPath: "/srv/data",
					mountPath: "/data",
				} as never,
			]),
		).toBe(true);
	});

	it("only copies code for drop applications without build servers", () => {
		expect(
			shouldCopyApplicationDropCode("application", {
				sourceType: "drop",
				buildServerId: null,
			}),
		).toBe(true);
		expect(
			shouldCopyApplicationDropCode("application", {
				sourceType: "git",
				buildServerId: null,
			}),
		).toBe(false);
		expect(
			shouldCopyApplicationDropCode("application", {
				sourceType: "drop",
				buildServerId: "build-server",
			}),
		).toBe(false);
	});
});
