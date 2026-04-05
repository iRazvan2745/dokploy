"use client";

import type {
	DraggableLocation,
	DroppableProvided,
	DropResult,
} from "@hello-pangea/dnd";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Services } from "@/pages/dashboard/project/[projectId]/environment/[environmentId]";
import { api } from "@/utils/api";
import { KanbanCard } from "./kanban-card";

// Status columns for kanban
const KANBAN_COLUMNS = [
	{ id: "idle", label: "TO DO", color: "bg-gray-500" },
	{ id: "running", label: "IN PROGRESS", color: "bg-blue-500" },
	{ id: "done", label: "TESTING", color: "bg-yellow-500" },
	{ id: "error", label: "DONE", color: "bg-green-500" },
] as const;

type KanbanStatus = (typeof KANBAN_COLUMNS)[number]["id"];

interface KanbanCategory {
	kanbanCategoryId: string;
	name: string;
	order: number;
}

interface KanbanRowProps {
	category: KanbanCategory | null; // null means "Uncategorized"
	services: Services[];
	environmentId: string;
	onDragEnd: (result: DropResult) => void;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
}

const KanbanRow = ({
	category,
	services,
	environmentId,
	onDragEnd,
	isCollapsed,
	onToggleCollapse,
}: KanbanRowProps) => {
	// Group services by status
	const servicesByColumn = useMemo(() => {
		const grouped: Record<KanbanStatus, Services[]> = {
			idle: [],
			running: [],
			done: [],
			error: [],
		};

		for (const service of services) {
			const status = service.status || "idle";
			if (status in grouped) {
				grouped[status].push(service);
			} else {
				grouped.idle.push(service);
			}
		}

		// Sort by kanbanOrder within each column
		for (const status of Object.keys(grouped) as KanbanStatus[]) {
			grouped[status].sort((a, b) => {
				// Use kanbanOrder if available, otherwise fallback to createdAt
				const orderA = (a as any).kanbanOrder ?? 0;
				const orderB = (b as any).kanbanOrder ?? 0;
				return orderA - orderB;
			});
		}

		return grouped;
	}, [services]);

	const categoryName = category?.name || "Uncategorized";
	const serviceCount = services.length;

	return (
		<div className="border rounded-lg bg-background mb-4">
			{/* Row Header */}
			<div
				className="flex items-center justify-between px-4 py-3 border-b bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
				onClick={onToggleCollapse}
			>
				<div className="flex items-center gap-2">
					<span className="font-semibold text-sm">{categoryName}</span>
					<span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
						{serviceCount}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						onClick={(e) => {
							e.stopPropagation();
							onToggleCollapse();
						}}
					>
						{isCollapsed ? "▼" : "▲"}
					</button>
				</div>
			</div>

			{/* Kanban Columns */}
			{!isCollapsed && (
				<div className="p-4">
					<div className="grid grid-cols-4 gap-4 min-w-[800px]">
						{KANBAN_COLUMNS.map((column) => (
							<Droppable
								key={column.id}
								droppableId={`${category?.kanbanCategoryId || "uncategorized"}:${column.id}`}
							>
								{(provided: DroppableProvided, snapshot) => (
									<div
										ref={provided.innerRef}
										{...provided.droppableProps}
										className={`bg-muted/30 rounded-lg p-3 min-h-[200px] transition-colors ${
											snapshot.isDraggingOver ? "bg-muted/60" : ""
										}`}
									>
										{/* Column Header */}
										<div className="flex items-center gap-2 mb-3">
											<div className={`w-2 h-2 rounded-full ${column.color}`} />
											<span className="text-xs font-medium text-muted-foreground uppercase">
												{column.label}
											</span>
											<span className="text-xs text-muted-foreground">
												({servicesByColumn[column.id].length})
											</span>
										</div>

										{/* Cards */}
										<div className="space-y-2">
											{servicesByColumn[column.id].map((service, index) => (
												<Draggable
													key={service.id}
													draggableId={service.id}
													index={index}
												>
													{(provided, snapshot) => (
														<KanbanCard
															service={service}
															provided={provided}
															snapshot={snapshot}
															environmentId={environmentId}
														/>
													)}
												</Draggable>
											))}
										</div>
										{provided.placeholder}
									</div>
								)}
							</Droppable>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

interface KanbanBoardProps {
	services: Services[];
	kanbanCategories: KanbanCategory[];
	environmentId: string;
}

export const KanbanBoard = ({
	services,
	kanbanCategories,
	environmentId,
}: KanbanBoardProps) => {
	const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
	const utils = api.useUtils();

	// Group services by category
	const servicesByCategory = useMemo(() => {
		const grouped: Record<string, Services[]> = {
			uncategorized: [],
		};

		// Initialize groups for each category
		for (const category of kanbanCategories) {
			grouped[category.kanbanCategoryId] = [];
		}

		// Group services
		for (const service of services) {
			const categoryId = (service as any).kanbanCategoryId;
			if (categoryId && grouped[categoryId]) {
				grouped[categoryId].push(service);
			} else {
				grouped.uncategorized.push(service);
			}
		}

		return grouped;
	}, [services, kanbanCategories]);

	// Get ordered categories
	const orderedCategories = useMemo(() => {
		const sorted = [...kanbanCategories].sort((a, b) => a.order - b.order);
		return sorted;
	}, [kanbanCategories]);

	const toggleRow = (categoryId: string) => {
		setCollapsedRows((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(categoryId)) {
				newSet.delete(categoryId);
			} else {
				newSet.add(categoryId);
			}
			return newSet;
		});
	};

	// Reorder mutations for each service type
	const reorderMutations = {
		application: api.application.reorder.useMutation(),
		compose: api.compose.reorder.useMutation(),
		postgres: api.postgres.reorder.useMutation(),
		mysql: api.mysql.reorder.useMutation(),
		mariadb: api.mariadb.reorder.useMutation(),
		mongo: api.mongo.reorder.useMutation(),
		redis: api.redis.reorder.useMutation(),
		libsql: api.libsql.reorder.useMutation(),
	};

	const handleDragEnd = async (result: DropResult) => {
		if (!result.destination) return;

		const { source, destination, draggableId } = result;

		// Parse droppable IDs: "categoryId:status"
		const [sourceCategoryId, sourceStatus] = source.droppableId.split(":");
		const [destCategoryId, destStatus] = destination.droppableId.split(":");

		// Find the service
		const service = services.find((s) => s.id === draggableId);
		if (!service) return;

		// Calculate new kanban order
		const newOrder = destination.index;

		// Convert category ID
		const newCategoryId =
			destCategoryId === "uncategorized" ? null : destCategoryId;

		try {
			// Call the appropriate reorder mutation based on service type
			const mutation = reorderMutations[service.type];
			if (mutation) {
				const serviceIdKey = `${service.type}Id` as const;
				await mutation.mutateAsync({
					[serviceIdKey]: service.id,
					kanbanCategoryId: newCategoryId,
					kanbanOrder: newOrder,
				} as any);

				// Invalidate queries to refresh data
				await utils.environment.one.invalidate({
					environmentId,
				});

				toast.success(`${service.name} moved successfully`);
			}
		} catch (error) {
			toast.error(
				`Failed to move ${service.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	return (
		<DragDropContext onDragEnd={handleDragEnd}>
			<div className="space-y-4">
				{/* Uncategorized row (always shown if there are services) */}
				{(servicesByCategory.uncategorized?.length > 0 ||
					orderedCategories.length === 0) && (
					<KanbanRow
						category={null}
						services={servicesByCategory.uncategorized || []}
						environmentId={environmentId}
						onDragEnd={handleDragEnd}
						isCollapsed={collapsedRows.has("uncategorized")}
						onToggleCollapse={() => toggleRow("uncategorized")}
					/>
				)}

				{/* Category rows */}
				{orderedCategories.map((category) => (
					<KanbanRow
						key={category.kanbanCategoryId}
						category={category}
						services={servicesByCategory[category.kanbanCategoryId] || []}
						environmentId={environmentId}
						onDragEnd={handleDragEnd}
						isCollapsed={collapsedRows.has(category.kanbanCategoryId)}
						onToggleCollapse={() => toggleRow(category.kanbanCategoryId)}
					/>
				))}
			</div>
		</DragDropContext>
	);
};
