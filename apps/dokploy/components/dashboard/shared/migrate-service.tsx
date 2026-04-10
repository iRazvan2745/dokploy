import { ArrowRightLeft, ServerIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { DrawerLogs } from "@/components/shared/drawer-logs";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { type LogLine, parseLogs } from "../docker/logs/utils";

type MigratableServiceType =
	| "application"
	| "compose"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "libsql";

interface Server {
	serverId: string;
	name: string;
	serverType: string;
	serverStatus: string;
	sshKeyId: string | null;
}

interface Props {
	serviceId: string;
	serviceName: string;
	serviceType: MigratableServiceType;
	currentServerId?: string | null;
	onSuccess?: () => unknown | Promise<unknown>;
}

export const MOCK_SERVER = {
	serverId: "blahblahblah",
	name: "If this is here it means no servers are eligible",
	description: "Fallback server used for local testing or empty states",
	ipAddress: "127.0.0.1",
	port: 22,
	username: "mock-user",
	appName: "mock-app-development",
	enableDockerCleanup: false,
	createdAt: new Date().toISOString(),
	organizationId: "mock-org-id",
	serverStatus: "active" as const, // Cast as const to match literal types
	serverType: "deploy" as const,
	command: "echo 'Hello from Mock'",
	sshKeyId: "mock-ssh-key-id",
	metricsConfig: {
		server: {
			type: "Remote" as const,
			refreshRate: 60,
			port: 4500,
			token: "mock-token",
			urlCallback: "",
			cronJob: "",
			retentionDays: 2,
			thresholds: {
				cpu: 80,
				memory: 80,
			},
		},
		containers: {
			refreshRate: 60,
			services: {
				include: ["*"],
				exclude: [],
			},
		},
	},
};

export const MigrateService = ({
	serviceId,
	serviceName,
	serviceType,
	currentServerId,
	onSuccess,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedTargetServerId, setSelectedTargetServerId] = useState("");
	const [isMigrating, setIsMigrating] = useState(false);
	const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
	const [filteredLogs, setFilteredLogs] = useState<LogLine[]>([]);
	const { data: servers } = api.server.all.useQuery();

	const targetServers =
		(servers?.filter(
			(server) =>
				server.serverId !== currentServerId &&
				server.serverType === "deploy" &&
				server.serverStatus === "active" &&
				!!server.sshKeyId,
		) as Server[] | undefined) ?? [];

	const otherServersCount =
		servers?.filter((server) => server.serverId !== currentServerId).length ??
		0;
	const targetCount = targetServers.length;

	api.serviceMigration.migrateWithLogs.useSubscription(
		{
			serviceId,
			serviceType,
			targetServerId: selectedTargetServerId,
		},
		{
			enabled: isMigrating && !!selectedTargetServerId,
			onData(log) {
				if (!isLogDrawerOpen) {
					setIsLogDrawerOpen(true);
				}

				if (log === "Migration finished successfully") {
					setIsMigrating(false);
					toast.success("Service migrated successfully");
					setIsOpen(false);
					void onSuccess?.();
				}

				setFilteredLogs((prev) => [...prev, ...parseLogs(log)]);
			},
			onError(error) {
				setIsMigrating(false);
				toast.error(error.message || "Service migration failed");
			},
		},
	);

	return (
		<>
			<Dialog
				open={isOpen}
				onOpenChange={(value) => {
					setIsOpen(value);
					if (!value) {
						setSelectedTargetServerId("");
						setFilteredLogs([]);
						setIsMigrating(false);
					}
				}}
			>
				<Card className="bg-background">
					<CardHeader>
						<CardTitle className="text-xl flex items-center gap-2">
							<ArrowRightLeft className="h-5 w-5 text-primary" />
							Container Migration
						</CardTitle>
						<CardDescription>
							Move {serviceName} to another server using rsync over SSH. The
							service must be stopped before starting the migration.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<AlertBlock type="info">
							Using the Dokploy server is not recommended, please keep them
							separate.
						</AlertBlock>
						<div className="flex flex-col gap-2">
							<h3 className="text-base font-semibold">Available targets</h3>
							<p className="text-sm text-muted-foreground">
								{targetCount > 0
									? `${targetCount} migration target${targetCount === 1 ? "" : "s"} available.`
									: "No eligible migration targets are currently available."}
							</p>
						</div>
						<DialogTrigger asChild>
							<Button
								variant="outline"
								className="w-full sm:w-fit"
								disabled={targetCount === 0}
							>
								<ArrowRightLeft className="mr-2 h-4 w-4" />
								Migrate Container
							</Button>
						</DialogTrigger>
					</CardContent>
				</Card>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Migrate Service</DialogTitle>
						<DialogDescription>
							Migrate {serviceName} to another remote server.
						</DialogDescription>
					</DialogHeader>

					<AlertBlock type="warning">
						The service must already be stopped. Volumes are copied with rsync
						over SSH.
					</AlertBlock>

					<div className="grid gap-2">
						<span className="text-sm font-medium">Target Server</span>
						<Select
							value={selectedTargetServerId}
							onValueChange={setSelectedTargetServerId}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a target server" />
							</SelectTrigger>
							<SelectContent>
								{targetServers.map((server) => (
									<SelectItem key={server.serverId} value={server.serverId}>
										<div className="flex items-center gap-2">
											<ServerIcon className="size-4" />
											<span>{server.name}</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{targetServers.length === 0 && (
							<AlertBlock>
								{otherServersCount > 0
									? "No eligible target servers found. Migration only supports other active deploy servers with SSH keys configured."
									: "No other servers found in this organization."}
							</AlertBlock>
						)}
					</div>

					<DialogFooter>
						<Button
							onClick={() => {
								setFilteredLogs([]);
								setIsMigrating(true);
								setIsLogDrawerOpen(true);
							}}
							disabled={!selectedTargetServerId || isMigrating}
							isLoading={isMigrating}
						>
							Start Migration
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<DrawerLogs
				isOpen={isLogDrawerOpen}
				onClose={() => setIsLogDrawerOpen(false)}
				filteredLogs={filteredLogs}
			/>
		</>
	);
};
