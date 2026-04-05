"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/utils/api";

interface KanbanCategoryManagerProps {
	environmentId: string;
}

export const KanbanCategoryManager = ({
	environmentId,
}: KanbanCategoryManagerProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const [newCategoryName, setNewCategoryName] = useState("");
	const [editingCategory, setEditingCategory] = useState<{
		kanbanCategoryId: string;
		name: string;
	} | null>(null);

	const utils = api.useUtils();

	const { data: categories = [] } =
		api.kanbanCategories.byEnvironmentId.useQuery({
			environmentId,
		});

	const createMutation = api.kanbanCategories.create.useMutation({
		onSuccess: () => {
			utils.kanbanCategories.byEnvironmentId.invalidate({ environmentId });
			setNewCategoryName("");
			setIsOpen(false);
			toast.success("Category created successfully");
		},
		onError: (error) => {
			toast.error(`Failed to create category: ${error.message}`);
		},
	});

	const updateMutation = api.kanbanCategories.update.useMutation({
		onSuccess: () => {
			utils.kanbanCategories.byEnvironmentId.invalidate({ environmentId });
			setEditingCategory(null);
			toast.success("Category updated successfully");
		},
		onError: (error) => {
			toast.error(`Failed to update category: ${error.message}`);
		},
	});

	const deleteMutation = api.kanbanCategories.delete.useMutation({
		onSuccess: () => {
			utils.kanbanCategories.byEnvironmentId.invalidate({ environmentId });
			utils.environment.one.invalidate({ environmentId });
			toast.success("Category deleted successfully");
		},
		onError: (error) => {
			toast.error(`Failed to delete category: ${error.message}`);
		},
	});

	const handleCreate = () => {
		if (!newCategoryName.trim()) {
			toast.error("Category name is required");
			return;
		}
		createMutation.mutate({
			name: newCategoryName.trim(),
			environmentId,
		});
	};

	const handleUpdate = () => {
		if (!editingCategory || !editingCategory.name.trim()) {
			toast.error("Category name is required");
			return;
		}
		updateMutation.mutate({
			kanbanCategoryId: editingCategory.kanbanCategoryId,
			name: editingCategory.name.trim(),
		});
	};

	const handleDelete = (kanbanCategoryId: string) => {
		if (
			confirm(
				"Are you sure you want to delete this category? Services in this category will be moved to Uncategorized.",
			)
		) {
			deleteMutation.mutate({ kanbanCategoryId });
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<PlusIcon className="h-4 w-4 mr-2" />
					Manage Categories
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Manage Kanban Categories</DialogTitle>
					<DialogDescription>
						Create, edit, or delete categories for organizing your services.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* Create new category */}
					<div className="flex gap-2">
						<Input
							placeholder="New category name"
							value={newCategoryName}
							onChange={(e) => setNewCategoryName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleCreate();
								}
							}}
						/>
						<Button onClick={handleCreate} disabled={createMutation.isPending}>
							<PlusIcon className="h-4 w-4 mr-2" />
							Add
						</Button>
					</div>

					{/* Existing categories */}
					<div className="space-y-2">
						<Label>Existing Categories</Label>
						{categories.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No categories yet. Create one above.
							</p>
						) : (
							<div className="space-y-2">
								{categories.map((category) => (
									<div
										key={category.kanbanCategoryId}
										className="flex items-center justify-between p-2 border rounded-md"
									>
										{editingCategory?.kanbanCategoryId ===
										category.kanbanCategoryId ? (
											<div className="flex gap-2 flex-1">
												<Input
													value={editingCategory.name}
													onChange={(e) =>
														setEditingCategory({
															...editingCategory,
															name: e.target.value,
														})
													}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															handleUpdate();
														}
													}}
													autoFocus
												/>
												<Button
													size="sm"
													onClick={handleUpdate}
													disabled={updateMutation.isPending}
												>
													Save
												</Button>
												<Button
													size="sm"
													variant="ghost"
													onClick={() => setEditingCategory(null)}
												>
													Cancel
												</Button>
											</div>
										) : (
											<>
												<span className="flex-1">{category.name}</span>
												<div className="flex gap-1">
													<Button
														size="icon"
														variant="ghost"
														className="h-8 w-8"
														onClick={() =>
															setEditingCategory({
																kanbanCategoryId: category.kanbanCategoryId,
																name: category.name,
															})
														}
													>
														<PencilIcon className="h-4 w-4" />
													</Button>
													<Button
														size="icon"
														variant="ghost"
														className="h-8 w-8 text-destructive"
														onClick={() =>
															handleDelete(category.kanbanCategoryId)
														}
														disabled={deleteMutation.isPending}
													>
														<Trash2Icon className="h-4 w-4" />
													</Button>
												</div>
											</>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => setIsOpen(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
