import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { badgeStateColor } from "@/components/dashboard/application/logs/show";
import { ShowDockerModalLogs } from "@/components/dashboard/docker/logs/show-docker-modal-logs";
import { ShowDockerModalStackLogs } from "@/components/dashboard/docker/logs/show-docker-modal-stack-logs";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/utils/api";

interface Props {
	appName: string;
	appType: "stack" | "docker-compose";
	serverId?: string;
}

interface ContainerActionDialogItemProps {
	title: string;
	description: string;
	label: string;
	onConfirm: () => Promise<void>;
	disabled?: boolean;
	destructive?: boolean;
}

const ContainerActionDialogItem = ({
	title,
	description,
	label,
	onConfirm,
	disabled,
	destructive,
}: ContainerActionDialogItemProps) => {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<DropdownMenuItem
					className={destructive ? "text-red-500 hover:!text-red-600" : ""}
					disabled={disabled}
					onSelect={(event) => event.preventDefault()}
				>
					{label}
				</DropdownMenuItem>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						variant={destructive ? "destructive" : "default"}
						onClick={onConfirm}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};

export const ShowComposeContainers = ({
	appName,
	appType,
	serverId,
}: Props) => {
	const utils = api.useUtils();
	const isStack = appType === "stack";

	const { data: nativeContainers, isPending: isLoadingNative } =
		api.docker.getContainersByAppNameMatch.useQuery(
			{
				appName,
				appType,
				serverId,
			},
			{
				enabled: !!appName && !isStack,
			},
		);

	const { data: stackContainers, isPending: isLoadingStack } =
		api.docker.getStackContainersByAppName.useQuery(
			{
				appName,
				serverId,
			},
			{
				enabled: !!appName && isStack,
			},
		);

	const { mutateAsync: restartContainer } =
		api.docker.restartContainer.useMutation();
	const { mutateAsync: startContainer } = api.docker.startContainer.useMutation();
	const { mutateAsync: stopContainer } = api.docker.stopContainer.useMutation();
	const { mutateAsync: killContainer } = api.docker.killContainer.useMutation();

	const containers = isStack ? (stackContainers ?? []) : (nativeContainers ?? []);
	const isPending = isStack ? isLoadingStack : isLoadingNative;

	const refreshContainers = async () => {
		await Promise.all([
			utils.docker.getContainersByAppNameMatch.invalidate(),
			utils.docker.getStackContainersByAppName.invalidate(),
		]);
	};

	const runAction = async (
		action: () => Promise<unknown>,
		successMessage: string,
	) => {
		await action()
			.then(async () => {
				toast.success(successMessage);
				await refreshContainers();
			})
			.catch((error) => {
				toast.error(error.message);
			});
	};

	return (
		<Card className="bg-background">
			<CardHeader>
				<CardTitle className="text-xl">Containers</CardTitle>
				<CardDescription>
					Inspect each container in this compose and run basic lifecycle
					actions.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{isStack && (
					<div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
						Stack deployments expose task-level logs here. Start, stop, and kill
						remain stack or service-level operations.
					</div>
				)}
				<div className="rounded-md border">
					{isPending ? (
						<div className="flex h-[40vh] items-center justify-center gap-2 text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							<span>Loading containers...</span>
						</div>
					) : containers.length === 0 ? (
						<div className="flex h-[40vh] items-center justify-center text-muted-foreground">
							No containers found for this compose.
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>State</TableHead>
									<TableHead>{isStack ? "Current State" : "Status"}</TableHead>
									{isStack && <TableHead>Node</TableHead>}
									<TableHead>Container ID</TableHead>
									<TableHead className="w-[60px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{containers.map((container) => {
									const isRunning =
										container.state === "running" ||
										container.state === "ready";

									return (
										<TableRow key={container.containerId}>
											<TableCell className="font-medium">
												{container.name}
											</TableCell>
											<TableCell>
												<Badge variant={badgeStateColor(container.state)}>
													{container.state}
												</Badge>
											</TableCell>
											<TableCell>
												{"status" in container
													? (container.status ?? "Unknown")
													: (container.currentState ?? "Unknown")}
											</TableCell>
											{isStack && (
												<TableCell>
													{"node" in container ? container.node : "-"}
												</TableCell>
											)}
											<TableCell className="font-mono text-xs">
												{container.containerId}
											</TableCell>
											<TableCell>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															className="h-8 w-8"
														>
															<MoreHorizontal className="size-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuLabel>Actions</DropdownMenuLabel>
														{isStack ? (
															<ShowDockerModalStackLogs
																containerId={container.containerId}
																serverId={serverId}
															>
																View Logs
															</ShowDockerModalStackLogs>
														) : (
															<>
																<ShowDockerModalLogs
																	containerId={container.containerId}
																	serverId={serverId}
																>
																	View Logs
																</ShowDockerModalLogs>
																<DropdownMenuSeparator />
																<ContainerActionDialogItem
																	title="Restart Container"
																	description={`Restart ${container.name}?`}
																	label="Restart"
																	onConfirm={async () => {
																		await runAction(
																			() =>
																				restartContainer({
																					containerId: container.containerId,
																					serverId,
																				}),
																			"Container restarted successfully",
																		);
																	}}
																/>
																<ContainerActionDialogItem
																	title="Start Container"
																	description={`Start ${container.name}?`}
																	label="Start"
																	disabled={isRunning}
																	onConfirm={async () => {
																		await runAction(
																			() =>
																				startContainer({
																					containerId: container.containerId,
																					serverId,
																				}),
																			"Container started successfully",
																		);
																	}}
																/>
																<ContainerActionDialogItem
																	title="Stop Container"
																	description={`Stop ${container.name}?`}
																	label="Stop"
																	disabled={!isRunning}
																	onConfirm={async () => {
																		await runAction(
																			() =>
																				stopContainer({
																					containerId: container.containerId,
																					serverId,
																				}),
																			"Container stopped successfully",
																		);
																	}}
																/>
																<ContainerActionDialogItem
																	title="Kill Container"
																	description={`Force kill ${container.name}? This stops the process immediately.`}
																	label="Kill"
																	destructive
																	disabled={!isRunning}
																	onConfirm={async () => {
																		await runAction(
																			() =>
																				killContainer({
																					containerId: container.containerId,
																					serverId,
																				}),
																			"Container killed successfully",
																		);
																	}}
																/>
															</>
														)}
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
