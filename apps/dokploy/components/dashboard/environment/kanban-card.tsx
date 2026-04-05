"use client";

import type {
	DraggableProvided,
	DraggableStateSnapshot,
} from "@hello-pangea/dnd";
import { CircuitBoard, GlobeIcon, ServerIcon } from "lucide-react";
import Link from "next/link";
import {
	LibsqlIcon,
	MariadbIcon,
	MongodbIcon,
	MysqlIcon,
	PostgresqlIcon,
	RedisIcon,
} from "@/components/icons/data-tools-icons";
import { StatusTooltip } from "@/components/shared/status-tooltip";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Services } from "@/pages/dashboard/project/[projectId]/environment/[environmentId]";

interface KanbanCardProps {
	service: Services;
	provided: DraggableProvided;
	snapshot: DraggableStateSnapshot;
	environmentId: string;
}

const getServiceIcon = (type: Services["type"]) => {
	switch (type) {
		case "application":
			return <GlobeIcon className="h-5 w-5" />;
		case "compose":
			return <CircuitBoard className="h-5 w-5" />;
		case "postgres":
			return <PostgresqlIcon className="h-5 w-5" />;
		case "mysql":
			return <MysqlIcon className="h-5 w-5" />;
		case "mariadb":
			return <MariadbIcon className="h-5 w-5" />;
		case "mongo":
			return <MongodbIcon className="h-5 w-5" />;
		case "redis":
			return <RedisIcon className="h-5 w-5" />;
		case "libsql":
			return <LibsqlIcon className="h-5 w-5" />;
		default:
			return <GlobeIcon className="h-5 w-5" />;
	}
};

export const KanbanCard = ({
	service,
	provided,
	snapshot,
	environmentId,
}: KanbanCardProps) => {
	const projectId = service.id.split("-")[0] || "";

	return (
		<div
			ref={provided.innerRef}
			{...provided.draggableProps}
			{...provided.dragHandleProps}
			style={{
				...provided.draggableProps.style,
			}}
			className={cn(
				"transition-all",
				snapshot.isDragging ? "opacity-90 rotate-2 scale-105" : "",
			)}
		>
			<Link
				href={`/dashboard/project/${projectId}/environment/${environmentId}/services/${service.type}/${service.id}`}
				className="block"
			>
				<Card className="p-3 hover:bg-accent transition-colors cursor-pointer group">
					<div className="flex items-start justify-between gap-2">
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">
									{getServiceIcon(service.type)}
								</span>
								<span className="font-medium text-sm truncate">
									{service.name}
								</span>
							</div>
							{service.description && (
								<p className="text-xs text-muted-foreground truncate mt-1">
									{service.description}
								</p>
							)}
							{service.serverName && (
								<div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
									<ServerIcon className="h-3 w-3" />
									<span className="truncate">{service.serverName}</span>
								</div>
							)}
						</div>
						<StatusTooltip status={service.status} />
					</div>
				</Card>
			</Link>
		</div>
	);
};
