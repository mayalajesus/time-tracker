export interface FavoriteTask {
  task: string;
  projectId: string;
  billable: boolean;
}

export function favoriteTaskKey(task: { task: string; projectId: string | null }) {
  return JSON.stringify([task.projectId, task.task.trim().toLowerCase()]);
}

export function isFavoriteTasks(value: unknown): value is Record<string, FavoriteTask[]> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(value).length <= 100000 &&
    Object.values(value).every(
      (items: unknown) =>
        Array.isArray(items) &&
        items.length <= 100 &&
        items.every((item: unknown) =>
          Boolean(
            item &&
            typeof item === "object" &&
            "task" in item &&
            typeof item.task === "string" &&
            item.task.trim().length > 0 &&
            item.task.length <= 500 &&
            "projectId" in item &&
            typeof item.projectId === "string" &&
            item.projectId.length > 0 &&
            "billable" in item &&
            typeof item.billable === "boolean",
          ),
        ),
    ),
  );
}
