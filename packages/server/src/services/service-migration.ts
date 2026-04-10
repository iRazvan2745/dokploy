import path from "node:path";
import { paths } from "@dokploy/server/constants";
import type { ServiceType } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { findApplicationById, updateApplication } from "./application";
import { findComposeById, updateCompose } from "./compose";
import { deployLibsql, findLibsqlById, updateLibsqlById } from "./libsql";
import {
	deployMariadb,
	findMariadbById,
	updateMariadbById,
} from "./mariadb";
import { deployMongo, findMongoById, updateMongoById } from "./mongo";
import { deployMySql, findMySqlById, updateMySqlById } from "./mysql";
import type { Mount } from "./mount";
import { deployPostgres, findPostgresById, updatePostgresById } from "./postgres";
import { deployRedis, findRedisById, updateRedisById } from "./redis";
import { findServerById } from "./server";
import { deployApplication } from "./application";
import { deployCompose } from "./compose";
import { addDomainToCompose } from "../utils/docker/domain";
import type {
	ComposeSpecification,
	DefinitionsVolume,
} from "../utils/docker/types";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export type MigratableServiceType = Extract<
	ServiceType,
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql"
>;

type BaseService = {
	appName: string;
	name?: string | null;
	serverId?: string | null;
	mounts: Mount[];
};

type ApplicationLike = BaseService & {
	applicationId: string;
	applicationStatus: string;
	sourceType?: string | null;
	buildServerId?: string | null;
};

type ComposeLike = BaseService & {
	composeId: string;
	composeStatus: string;
	composeType: "docker-compose" | "stack";
};

type ComposeEntity = Awaited<ReturnType<typeof findComposeById>>;

type DatabaseLike = BaseService & {
	applicationStatus: string;
};

type ServiceEntity =
	| ({
			type: "application";
	  } & ApplicationLike)
	| ({
			type: "compose";
	  } & ComposeEntity)
	| ({
			type:
				| "postgres"
				| "mysql"
				| "mariadb"
				| "mongo"
				| "redis"
				| "libsql";
	  } & DatabaseLike);

type ServiceLookup = {
	id: string;
	appName: string;
	name: string;
	sourceServerId: string | null;
	sourceServerName: string;
	targetServerId: string | null;
	targetServerName: string;
	type: MigratableServiceType;
	mounts: Mount[];
	filesPath: string | null;
	codePath: string | null;
	status: string;
	composeType?: "docker-compose" | "stack";
	volumeNames: string[];
};

const MIGRATION_SUPPORTED_TYPES: MigratableServiceType[] = [
	"application",
	"compose",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"libsql",
];

export const isMigratableServiceType = (
	serviceType: string,
): serviceType is MigratableServiceType =>
	MIGRATION_SUPPORTED_TYPES.includes(serviceType as MigratableServiceType);

export const hasBindMounts = (mounts: Mount[]) =>
	mounts.some((mount) => mount.type === "bind");

export const hasFileMounts = (mounts: Mount[]) =>
	mounts.some((mount) => mount.type === "file");

export const getVolumeMounts = (mounts: Mount[]) =>
	mounts.filter((mount) => mount.type === "volume" && mount.volumeName);

const getMountVolumeNames = (mounts: Mount[]) =>
	getVolumeMounts(mounts)
		.map((mount) => mount.volumeName)
		.filter((volumeName): volumeName is string => Boolean(volumeName));

export const shouldCopyApplicationDropCode = (
	serviceType: MigratableServiceType,
	service: Pick<ApplicationLike, "sourceType" | "buildServerId">,
) =>
	serviceType === "application" &&
	service.sourceType === "drop" &&
	!service.buildServerId;

const shellEscape = (value: string) => `'${value.replace(/'/g, `'\"'\"'`)}'`;

const bashLine = (value: string) => `${value.replace(/\n/g, " ").trim()}\n`;

const LOCAL_TARGET = "local";

const isLocalServerId = (serverId: string | null | undefined) =>
	serverId === null || serverId === undefined || serverId === LOCAL_TARGET;

const getEndpointName = (serverName?: string | null) =>
	serverName || "Dokploy server";

const formatEndpoint = (serverId: string | null, serverName: string) =>
	serverId ? `${serverName} (${serverId})` : `${serverName} (local)`;

const emitLog = (onData: ((data: string) => void) | undefined, message: string) => {
	onData?.(message);
};

const emitSection = (
	onData: ((data: string) => void) | undefined,
	title: string,
	details?: string,
) => {
	onData?.(`${title}${details ? ` ${details}` : ""}`);
};

const ensureRemoteDeployServer = async (serverId: string, label: string) => {
	const server = await findServerById(serverId);

	if (server.serverType !== "deploy") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} must be a deploy server`,
		});
	}

	if (server.serverStatus !== "active") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} must be active`,
		});
	}

	if (!server.sshKeyId || !server.sshKey?.privateKey) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} must have an SSH key configured`,
		});
	}

	return server;
};

const ensureLocalRsyncAvailable = async () => {
	try {
		await execAsync("command -v rsync >/dev/null 2>&1");
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Dokploy server is missing rsync",
		});
	}
};

const ensureRemoteCommand = async (serverId: string, command: string) => {
	const { stdout } = await execAsyncRemote(serverId, command);
	return stdout.trim();
};

const ensureRsyncAvailable = async (serverId: string, label: string) => {
	try {
		await execAsyncRemote(serverId, "command -v rsync >/dev/null 2>&1");
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${label} is missing rsync`,
		});
	}
};

const ensureNoTargetDockerConflict = async (
	targetServerId: string | null,
	appName: string,
) => {
	const docker = await getRemoteDocker(targetServerId);

	try {
		const service = docker.getService(appName);
		await service.inspect();
		throw new TRPCError({
			code: "CONFLICT",
			message: `Target server already has a Docker service named ${appName}`,
		});
	} catch (error) {
		if (error instanceof TRPCError) {
			throw error;
		}
	}
};

const getServiceEntity = async (
	serviceType: MigratableServiceType,
	serviceId: string,
): Promise<ServiceEntity> => {
	switch (serviceType) {
		case "application": {
			const service = await findApplicationById(serviceId);
			return {
				...service,
				type: "application",
			};
		}
		case "compose": {
			const service = await findComposeById(serviceId);
			return {
				...service,
				type: "compose",
			};
		}
		case "postgres": {
			const service = await findPostgresById(serviceId);
			return {
				...service,
				type: "postgres",
			};
		}
		case "mysql": {
			const service = await findMySqlById(serviceId);
			return {
				...service,
				type: "mysql",
			};
		}
		case "mariadb": {
			const service = await findMariadbById(serviceId);
			return {
				...service,
				type: "mariadb",
			};
		}
		case "mongo": {
			const service = await findMongoById(serviceId);
			return {
				...service,
				type: "mongo",
			};
		}
		case "redis": {
			const service = await findRedisById(serviceId);
			return {
				...service,
				type: "redis",
			};
		}
		case "libsql": {
			const service = await findLibsqlById(serviceId);
			return {
				...service,
				type: "libsql",
			};
		}
	}
};

const getFilesBasePath = (
	serviceType: MigratableServiceType,
	serverId: string | null,
	appName: string,
) => {
	const pathSet = paths(!!serverId);

	if (serviceType === "compose") {
		return path.join(pathSet.COMPOSE_PATH, appName, "files");
	}

	return path.join(pathSet.APPLICATIONS_PATH, appName, "files");
};

const getDropCodePath = (serverId: string | null, appName: string) => {
	const { APPLICATIONS_PATH } = paths(!!serverId);
	return path.join(APPLICATIONS_PATH, appName, "code");
};

const getServiceStatus = (service: ServiceEntity) =>
	service.type === "compose"
		? service.composeStatus
		: service.applicationStatus;

type ComposeVolumeReference =
	| {
			type: "named";
			source: string;
			volumeName: string;
			serviceName: string;
			targetPath?: string;
	  }
	| {
			type: "anonymous";
			serviceName: string;
			targetPath: string;
			volumeName: string;
	  };

type ParsedComposeShortVolume =
	| {
			type: "bind";
			source: string;
			targetPath: string;
	  }
	| {
			type: "named";
			source: string;
			targetPath: string;
	  }
	| {
			type: "anonymous";
			targetPath: string;
	  }
	| null;

const isComposeBindSource = (source: string) =>
	source.startsWith(".") ||
	source.startsWith("/") ||
	source.startsWith("~") ||
	source.startsWith("$");

const isComposeVolumeMode = (value: string) =>
	value
		.split(",")
		.every((segment) =>
			["ro", "rw", "z", "Z", "cached", "delegated", "consistent"].includes(
				segment,
			),
		);

const parseComposeShortVolume = (volume: string): ParsedComposeShortVolume => {
	const parts = volume.split(":");

	if (parts.length === 1) {
		return {
			type: "anonymous" as const,
			targetPath: parts[0] ?? "",
		};
	}

	const [firstPart, secondPart] = parts;

	if (
		parts.length === 2 &&
		firstPart &&
		secondPart &&
		isComposeBindSource(firstPart) &&
		isComposeVolumeMode(secondPart)
	) {
		return {
			type: "anonymous" as const,
			targetPath: firstPart,
		};
	}

	const source = firstPart;
	const targetPath = secondPart;

	if (!source || !targetPath) {
		return null;
	}

	if (isComposeBindSource(source)) {
		return {
			type: "bind" as const,
			source,
			targetPath,
		};
	}

	return {
		type: "named" as const,
		source,
		targetPath,
	};
};

const resolveComposeNamedVolume = (
	appName: string,
	source: string,
	rootVolume?: DefinitionsVolume,
) => {
	const externalName =
		typeof rootVolume?.external === "object" ? rootVolume.external.name : undefined;
	if (externalName) {
		return externalName;
	}

	if (rootVolume?.external === true) {
		return rootVolume.name || source;
	}

	if (rootVolume?.name) {
		return rootVolume.name;
	}

	return `${appName}_${source}`;
};

const listComposeAnonymousVolumeRefs = (
	appName: string,
	composeType: ComposeLike["composeType"],
	composeSpec: ComposeSpecification,
) => {
	const volumeRefs: ComposeVolumeReference[] = [];
	const serviceEntries = Object.entries(composeSpec.services || {});

	for (const [serviceName, serviceConfig] of serviceEntries) {
		for (const rawVolume of serviceConfig.volumes || []) {
			if (typeof rawVolume === "string") {
				const parsedVolume = parseComposeShortVolume(rawVolume);

				if (!parsedVolume) {
					continue;
				}

				if (parsedVolume.type === "bind") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Compose migration does not support bind mounts declared in the compose file",
					});
				}

				if (parsedVolume.type === "anonymous") {
					if (composeType === "stack") {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message:
								"Compose stack migration does not support anonymous Docker volumes declared in the compose file",
						});
					}

					volumeRefs.push({
						type: "anonymous",
						serviceName,
						targetPath: parsedVolume.targetPath,
						volumeName: "",
					});
					continue;
				}

				volumeRefs.push({
					type: "named",
					serviceName,
					source: parsedVolume.source,
					targetPath: parsedVolume.targetPath,
					volumeName: resolveComposeNamedVolume(
						appName,
						parsedVolume.source,
						composeSpec.volumes?.[parsedVolume.source],
					),
				});
				continue;
			}

			if (rawVolume.type === "bind") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Compose migration does not support bind mounts declared in the compose file",
				});
			}

			if (rawVolume.type !== "volume") {
				continue;
			}

			if (!rawVolume.source) {
				if (!rawVolume.target) {
					continue;
				}

				if (composeType === "stack") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Compose stack migration does not support anonymous Docker volumes declared in the compose file",
					});
				}

				volumeRefs.push({
					type: "anonymous",
					serviceName,
					targetPath: rawVolume.target,
					volumeName: "",
				});
				continue;
			}

			volumeRefs.push({
				type: "named",
				serviceName,
				source: rawVolume.source,
				targetPath: rawVolume.target,
				volumeName: resolveComposeNamedVolume(
					appName,
					rawVolume.source,
					composeSpec.volumes?.[rawVolume.source],
				),
			});
		}
	}

	return volumeRefs;
};

const inspectAnonymousComposeVolumeName = async (
	serverId: string | null,
	appName: string,
	serviceName: string,
	targetPath: string,
) => {
	const command = [
		"set -e",
		`CONTAINER_ID=$(docker ps -aq --filter label=com.docker.compose.project=${shellEscape(appName)} --filter label=com.docker.compose.service=${shellEscape(serviceName)} | head -n 1)`,
		'if [ -z "$CONTAINER_ID" ]; then exit 1; fi',
		`docker inspect --format '{{range .Mounts}}{{println .Type "|" .Destination "|" .Name}}{{end}}' "$CONTAINER_ID" | awk -F'|' -v target=${shellEscape(targetPath)} '$1 == "volume" && $2 == target { print $3; exit }'`,
	]
		.map(bashLine)
		.join("");

	let volumeName = "";

	try {
		const runner = serverId
			? await execAsyncRemote(serverId, command)
			: await execAsync(command);
		volumeName = runner.stdout.trim();
	} catch {
		volumeName = "";
	}

	if (!volumeName) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Could not resolve anonymous compose volume for service ${serviceName} at ${targetPath}`,
		});
	}

	return volumeName;
};

const resolveComposeVolumeNames = async (compose: ComposeEntity) => {
	const composeSpec = await addDomainToCompose(compose, compose.domains);

	if (!composeSpec) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Compose file could not be loaded for migration",
		});
	}

	const volumeRefs = listComposeAnonymousVolumeRefs(
		compose.appName,
		compose.composeType,
		composeSpec,
	);

	if (volumeRefs.length === 0) {
		return [];
	}

	const resolvedVolumeNames = await Promise.all(
		volumeRefs.map(async (volumeRef) => {
			if (volumeRef.type === "named") {
				return volumeRef.volumeName;
			}

			return inspectAnonymousComposeVolumeName(
				compose.serverId ?? null,
				compose.appName,
				volumeRef.serviceName,
				volumeRef.targetPath,
			);
		}),
	);

	return [...new Set(resolvedVolumeNames)];
};

export const buildMigrationLookup = async (
	serviceType: MigratableServiceType,
	serviceId: string,
	targetServerId: string,
) => {
	const service = await getServiceEntity(serviceType, serviceId);

	const normalizedTargetServerId = isLocalServerId(targetServerId)
		? null
		: targetServerId;
	const sourceServerId = service.serverId ?? null;

	if (sourceServerId === normalizedTargetServerId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Source and target servers must be different",
		});
	}

	const status = getServiceStatus(service);
	if (status !== "idle") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Service must be stopped before migration",
		});
	}

	if (hasBindMounts(service.mounts)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Services with bind mounts are not supported for migration",
		});
	}

	const volumeNames =
		service.type === "compose"
			? await resolveComposeVolumeNames(service)
			: getMountVolumeNames(service.mounts);

	const sourceServer = sourceServerId
		? await ensureRemoteDeployServer(sourceServerId, "Source server")
		: null;
	const targetServer = normalizedTargetServerId
		? await ensureRemoteDeployServer(normalizedTargetServerId, "Target server")
		: null;

	if (sourceServer) {
		await ensureRsyncAvailable(sourceServer.serverId, "Source server");
	} else {
		await ensureLocalRsyncAvailable();
	}

	if (targetServer) {
		await ensureRsyncAvailable(targetServer.serverId, "Target server");
	} else {
		await ensureLocalRsyncAvailable();
	}

	await ensureNoTargetDockerConflict(normalizedTargetServerId, service.appName);

	return {
		id: serviceId,
		appName: service.appName,
		name: service.name || service.appName,
		sourceServerId,
		sourceServerName: getEndpointName(sourceServer?.name),
		targetServerId: normalizedTargetServerId,
		targetServerName: getEndpointName(targetServer?.name),
		type: serviceType,
		mounts: service.mounts,
		filesPath: hasFileMounts(service.mounts)
			? getFilesBasePath(serviceType, sourceServerId, service.appName)
			: null,
		codePath:
			service.type === "application" &&
			shouldCopyApplicationDropCode(serviceType, service)
				? getDropCodePath(sourceServerId, service.appName)
				: null,
		status,
		composeType: service.type === "compose" ? service.composeType : undefined,
		volumeNames,
	} satisfies ServiceLookup;
};

export const logMigrationPreflight = async ({
	serviceType,
	serviceId,
	targetServerId,
	onData,
}: {
	serviceType: MigratableServiceType;
	serviceId: string;
	targetServerId: string;
	onData?: (data: string) => void;
}) => {
	emitSection(onData, "Preflight: loading service...");
	const service = await getServiceEntity(serviceType, serviceId);
	const normalizedTargetServerId = isLocalServerId(targetServerId)
		? null
		: targetServerId;
	const sourceServerId = service.serverId ?? null;

	emitLog(onData, `Requested service type: ${serviceType}`);
	emitLog(onData, `Requested service id: ${serviceId}`);
	emitLog(onData, `Current serverId: ${sourceServerId ?? "local"}`);
	emitLog(
		onData,
		`Requested target serverId: ${normalizedTargetServerId ?? "local"}`,
	);
	emitLog(onData, `Current status: ${getServiceStatus(service)}`);
	emitLog(onData, `Mount count: ${service.mounts.length}`);
	emitLog(
		onData,
		`Bind mounts detected: ${hasBindMounts(service.mounts) ? "yes" : "no"}`,
	);
	emitLog(
		onData,
		`File mounts detected: ${hasFileMounts(service.mounts) ? "yes" : "no"}`,
	);
};

const inspectVolumeMountpoint = async (
	serverId: string | null,
	volumeName: string,
) => {
	const command = `docker volume inspect -f '{{ .Mountpoint }}' ${shellEscape(volumeName)}`;
	if (serverId) {
		return ensureRemoteCommand(serverId, command);
	}
	const { stdout } = await execAsync(command);
	return stdout.trim();
};

const getTargetVolumeMountpoint = async (
	targetServerId: string | null,
	volumeName: string,
) => {
	const createCommand = `docker volume create ${shellEscape(volumeName)}`;
	if (targetServerId) {
		await execAsyncRemote(targetServerId, createCommand);
	} else {
		await execAsync(createCommand);
	}
	return inspectVolumeMountpoint(targetServerId, volumeName);
};

const getSourceVolumeMountpoint = async (
	sourceServerId: string | null,
	volumeName: string,
) => inspectVolumeMountpoint(sourceServerId, volumeName);

const prepareTargetDirectory = async (
	targetServerId: string | null,
	targetPath: string,
	onData?: (data: string) => void,
) => {
	emitSection(
		onData,
		"Preparing target directory",
		`${targetPath} on ${targetServerId ? "remote target" : "Dokploy server"}`,
	);
	const command = `mkdir -p ${shellEscape(targetPath)} && find ${shellEscape(targetPath)} -mindepth 1 -maxdepth 1 -exec rm -rf {} +`;
	if (targetServerId) {
		await execAsyncRemote(targetServerId, command);
	} else {
		await execAsync(command);
	}
	emitLog(onData, `Target directory ready: ${targetPath}`);
};

const syncDirectoryBetweenServers = async ({
	sourceServerId,
	sourcePath,
	targetServerId,
	targetPath,
	onData,
}: {
	sourceServerId: string | null;
	sourcePath: string;
	targetServerId: string | null;
	targetPath: string;
	onData?: (data: string) => void;
}) => {
	const sourcePathEscaped = shellEscape(sourcePath);
	const targetPathEscaped = shellEscape(targetPath);

	if (sourceServerId && targetServerId) {
		emitSection(
			onData,
			"Rsync mode:",
			"remote -> remote",
		);
		const targetServer = await findServerById(targetServerId);
		const privateKey = targetServer.sshKey?.privateKey;

		if (!privateKey) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Target server is missing an SSH private key",
			});
		}

		const keyBase64 = Buffer.from(privateKey, "utf8").toString("base64");
		const targetHost = shellEscape(targetServer.ipAddress);
		const targetPort = shellEscape(String(targetServer.port));
		const targetUser = shellEscape(targetServer.username);

		const command = [
			"set -e",
			"TMP_KEY=$(mktemp)",
			"cleanup() { rm -f \"$TMP_KEY\"; }",
			"trap cleanup EXIT",
			`echo ${shellEscape(keyBase64)} | base64 -d > "$TMP_KEY"`,
			"chmod 600 \"$TMP_KEY\"",
			`mkdir -p ${sourcePathEscaped}`,
			`rsync -a --numeric-ids --delete ${sourcePathEscaped}/ -e "ssh -i $TMP_KEY -p ${targetPort} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" ${targetUser}@${targetHost}:${targetPathEscaped}/`,
		]
			.map(bashLine)
			.join("");

		await execAsyncRemote(sourceServerId, command, onData);
		emitLog(onData, "Rsync transfer completed.");
		return;
	}

	if (!sourceServerId && targetServerId) {
		emitSection(
			onData,
			"Rsync mode:",
			"Dokploy -> remote",
		);
		const targetServer = await findServerById(targetServerId);
		const privateKey = targetServer.sshKey?.privateKey;

		if (!privateKey) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Target server is missing an SSH private key",
			});
		}

		const keyBase64 = Buffer.from(privateKey, "utf8").toString("base64");
		const targetHost = shellEscape(targetServer.ipAddress);
		const targetPort = shellEscape(String(targetServer.port));
		const targetUser = shellEscape(targetServer.username);

		const command = [
			"set -e",
			"TMP_KEY=$(mktemp)",
			"cleanup() { rm -f \"$TMP_KEY\"; }",
			"trap cleanup EXIT",
			`echo ${shellEscape(keyBase64)} | base64 -d > "$TMP_KEY"`,
			"chmod 600 \"$TMP_KEY\"",
			`mkdir -p ${sourcePathEscaped}`,
			`rsync -a --numeric-ids --delete ${sourcePathEscaped}/ -e "ssh -i $TMP_KEY -p ${targetPort} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" ${targetUser}@${targetHost}:${targetPathEscaped}/`,
		]
			.map(bashLine)
			.join("");

		await execAsync(command);
		emitLog(onData, "Rsync transfer completed.");
		return;
	}

	if (sourceServerId && !targetServerId) {
		emitSection(
			onData,
			"Rsync mode:",
			"remote -> Dokploy",
		);
		const sourceServer = await findServerById(sourceServerId);
		const privateKey = sourceServer.sshKey?.privateKey;

		if (!privateKey) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Source server is missing an SSH private key",
			});
		}

		const keyBase64 = Buffer.from(privateKey, "utf8").toString("base64");
		const sourceHost = shellEscape(sourceServer.ipAddress);
		const sourcePort = shellEscape(String(sourceServer.port));
		const sourceUser = shellEscape(sourceServer.username);

		const command = [
			"set -e",
			"TMP_KEY=$(mktemp)",
			"cleanup() { rm -f \"$TMP_KEY\"; }",
			"trap cleanup EXIT",
			`echo ${shellEscape(keyBase64)} | base64 -d > "$TMP_KEY"`,
			"chmod 600 \"$TMP_KEY\"",
			`mkdir -p ${targetPathEscaped}`,
			`rsync -a --numeric-ids --delete -e "ssh -i $TMP_KEY -p ${sourcePort} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" ${sourceUser}@${sourceHost}:${sourcePathEscaped}/ ${targetPathEscaped}/`,
		]
			.map(bashLine)
			.join("");

		await execAsync(command);
		emitLog(onData, "Rsync transfer completed.");
		return;
	}

	emitSection(onData, "No rsync transfer needed: Dokploy -> Dokploy.");
};

const migrateVolumes = async (lookup: ServiceLookup, onData?: (data: string) => void) => {
	if (lookup.volumeNames.length === 0) {
		emitSection(onData, "No volume mounts detected, skipping volume copy.");
		return;
	}

	emitSection(onData, "Volume migration plan:", `${lookup.volumeNames.length} volume(s)`);

	for (const volumeName of lookup.volumeNames) {
		emitSection(onData, "Migrating volume", volumeName);
		const [sourcePath, targetPath] = await Promise.all([
			getSourceVolumeMountpoint(lookup.sourceServerId, volumeName),
			getTargetVolumeMountpoint(lookup.targetServerId, volumeName),
		]);

		emitLog(onData, `Source volume mountpoint: ${sourcePath}`);
		emitLog(onData, `Target volume mountpoint: ${targetPath}`);

		await prepareTargetDirectory(lookup.targetServerId, targetPath, onData);
		await syncDirectoryBetweenServers({
			sourceServerId: lookup.sourceServerId,
			sourcePath,
			targetServerId: lookup.targetServerId,
			targetPath,
			onData,
		});
		emitLog(onData, `Volume copied: ${volumeName}`);
	}
};

const migrateManagedDirectory = async (
	lookup: ServiceLookup,
	sourcePath: string | null,
	targetPath: string | null,
	label: string,
	onData?: (data: string) => void,
) => {
	if (!sourcePath || !targetPath) {
		emitSection(onData, `No ${label} to migrate, skipping.`);
		return;
	}

	emitSection(onData, `Migrating ${label}`);
	emitLog(onData, `Source ${label} path: ${sourcePath}`);
	emitLog(onData, `Target ${label} path: ${targetPath}`);
	await prepareTargetDirectory(lookup.targetServerId, targetPath, onData);
	await syncDirectoryBetweenServers({
		sourceServerId: lookup.sourceServerId,
		sourcePath,
		targetServerId: lookup.targetServerId,
		targetPath,
		onData,
	});
	emitLog(onData, `Copied ${label}`);
};

const updateServiceServerId = async (
	lookup: ServiceLookup,
	serverId: string | null,
) => {
	switch (lookup.type) {
		case "application":
			await updateApplication(lookup.id, { serverId });
			break;
		case "compose":
			await updateCompose(lookup.id, { serverId });
			break;
		case "postgres":
			await updatePostgresById(lookup.id, { serverId });
			break;
		case "mysql":
			await updateMySqlById(lookup.id, { serverId });
			break;
		case "mariadb":
			await updateMariadbById(lookup.id, { serverId });
			break;
		case "mongo":
			await updateMongoById(lookup.id, { serverId });
			break;
		case "redis":
			await updateRedisById(lookup.id, { serverId });
			break;
		case "libsql":
			await updateLibsqlById(lookup.id, { serverId });
			break;
	}
};

const deployMigratedService = async (
	lookup: ServiceLookup,
	onData?: (data: string) => void,
) => {
	onData?.(`Deploying ${lookup.name} on ${lookup.targetServerName}`);

	switch (lookup.type) {
		case "application":
			await deployApplication({
				applicationId: lookup.id,
				titleLog: "Service migration",
				descriptionLog: `Migrated from ${lookup.sourceServerName} to ${lookup.targetServerName}`,
				onData,
			});
			break;
		case "compose":
			await deployCompose({
				composeId: lookup.id,
				titleLog: "Service migration",
				descriptionLog: `Migrated from ${lookup.sourceServerName} to ${lookup.targetServerName}`,
				onData,
			});
			break;
		case "postgres":
			await deployPostgres(lookup.id, onData);
			break;
		case "mysql":
			await deployMySql(lookup.id, onData);
			break;
		case "mariadb":
			await deployMariadb(lookup.id, onData);
			break;
		case "mongo":
			await deployMongo(lookup.id, onData);
			break;
		case "redis":
			await deployRedis(lookup.id, onData);
			break;
		case "libsql":
			await deployLibsql(lookup.id, onData);
			break;
	}
};

const stopComposeRuntimeOnly = async (
	lookup: ServiceLookup,
	serverId: string | null,
) => {
	const execute = async (command: string) => {
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	};

	if (lookup.composeType === "stack") {
		await execute(
			[
				`docker network disconnect ${shellEscape(lookup.appName)} dokploy-traefik >/dev/null 2>&1 || true`,
				`docker stack rm ${shellEscape(lookup.appName)}`,
			]
				.map(bashLine)
				.join(""),
		);
		return;
	}

	const { COMPOSE_PATH } = paths(!!serverId);
	const projectPath = path.join(COMPOSE_PATH, lookup.appName);
	await execute(
		[
			`docker network disconnect ${shellEscape(lookup.appName)} dokploy-traefik >/dev/null 2>&1 || true`,
			`if [ -d ${shellEscape(projectPath)} ]; then cd ${shellEscape(projectPath)} && env -i PATH="$PATH" docker compose -p ${shellEscape(lookup.appName)} down; fi`,
		]
			.map(bashLine)
			.join(""),
	);
};

const cleanupTargetRuntime = async (lookup: ServiceLookup) => {
	if (lookup.type === "compose") {
		await stopComposeRuntimeOnly(lookup, lookup.targetServerId);
		return;
	}

	if (lookup.targetServerId) {
		await execAsyncRemote(
			lookup.targetServerId,
			`docker service rm ${shellEscape(lookup.appName)} >/dev/null 2>&1 || true`,
		);
	} else {
		await execAsync(
			`docker service rm ${shellEscape(lookup.appName)} >/dev/null 2>&1 || true`,
		);
	}
};

const cleanupSourceRuntime = async (lookup: ServiceLookup) => {
	if (lookup.type === "compose") {
		await stopComposeRuntimeOnly(lookup, lookup.sourceServerId);
		return;
	}

	if (lookup.sourceServerId) {
		await execAsyncRemote(
			lookup.sourceServerId,
			`docker service rm ${shellEscape(lookup.appName)} >/dev/null 2>&1 || true`,
		);
	} else {
		await execAsync(
			`docker service rm ${shellEscape(lookup.appName)} >/dev/null 2>&1 || true`,
		);
	}
};

export const migrateServiceBetweenServers = async ({
	serviceType,
	serviceId,
	targetServerId,
	onData,
}: {
	serviceType: MigratableServiceType;
	serviceId: string;
	targetServerId: string;
	onData?: (data: string) => void;
}) => {
	emitSection(onData, "Loading migration context...");
	const lookup = await buildMigrationLookup(
		serviceType,
		serviceId,
		targetServerId,
	);

	emitSection(onData, "Migration context resolved.");
	emitLog(onData, `Service type: ${lookup.type}`);
	emitLog(onData, `Service id: ${lookup.id}`);
	emitLog(onData, `App name: ${lookup.appName}`);
	emitLog(
		onData,
		`Source endpoint: ${formatEndpoint(lookup.sourceServerId, lookup.sourceServerName)}`,
	);
	emitLog(
		onData,
		`Target endpoint: ${formatEndpoint(lookup.targetServerId, lookup.targetServerName)}`,
	);
	emitLog(onData, `Service status: ${lookup.status}`);
	emitLog(onData, `Total mounts: ${lookup.mounts.length}`);
	emitLog(onData, `Volume mounts: ${lookup.volumeNames.length}`);
	emitLog(
		onData,
		`File mounts present: ${lookup.filesPath ? "yes" : "no"}`,
	);
	emitLog(
		onData,
		`Drop code copy required: ${lookup.codePath ? "yes" : "no"}`,
	);

	const targetFilesPath = lookup.filesPath
		? getFilesBasePath(serviceType, lookup.targetServerId, lookup.appName)
		: null;
	const targetCodePath = lookup.codePath
		? getDropCodePath(lookup.targetServerId, lookup.appName)
		: null;

	emitSection(onData, "Starting data migration phase...");
	await migrateVolumes(lookup, onData);
	await migrateManagedDirectory(
		lookup,
		lookup.filesPath,
		targetFilesPath,
		"managed files",
		onData,
	);
	await migrateManagedDirectory(
		lookup,
		lookup.codePath,
		targetCodePath,
		"drop source code",
		onData,
	);
	emitSection(onData, "Data migration phase completed.");

	emitSection(
		onData,
		"Updating service server assignment",
		`${formatEndpoint(lookup.sourceServerId, lookup.sourceServerName)} -> ${formatEndpoint(lookup.targetServerId, lookup.targetServerName)}`,
	);
	await updateServiceServerId(lookup, lookup.targetServerId);
	emitLog(onData, "Service serverId updated.");
	let migrated = false;

	try {
		emitSection(onData, "Starting target deployment...");
		await deployMigratedService(lookup, onData);
		migrated = true;
		emitLog(onData, "Target deployment completed.");
		emitSection(onData, "Cleaning up source runtime...");
		await cleanupSourceRuntime(lookup);
		emitLog(onData, "Source runtime cleanup completed.");
		emitSection(onData, `Migration completed for ${lookup.name}`);
		return lookup;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		emitLog(onData, `Migration failed: ${message}`);
		emitSection(onData, "Starting rollback...");

		if (migrated) {
			emitSection(onData, "Cleaning up target runtime after failed migration...");
			await cleanupTargetRuntime(lookup).catch(() => undefined);
			emitLog(onData, "Target runtime cleanup attempted.");
		}

		emitSection(
			onData,
			"Restoring previous service server assignment",
			formatEndpoint(lookup.sourceServerId, lookup.sourceServerName),
		);
		await updateServiceServerId(lookup, lookup.sourceServerId).catch(
			() => undefined,
		);
		emitLog(onData, "Rollback completed. Source data was preserved.");
		throw error;
	}
};
