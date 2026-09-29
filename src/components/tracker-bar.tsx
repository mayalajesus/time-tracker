import { IconTooltip } from "@/components/icon-tooltip";
import { Card } from "@heroui/react/card";
import { ComboBox } from "@heroui/react/combo-box";
import { EmptyState } from "@heroui/react/empty-state";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { ListBox } from "@heroui/react/list-box";
import { Separator } from "@heroui/react/separator";
import { ToggleButton } from "@heroui/react/toggle-button";
import { ToggleButtonGroup } from "@heroui/react/toggle-button-group";
import { Toolbar } from "@heroui/react/toolbar";
import { toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { useFavoriteTasks } from "@/lib/use-favorite-tasks";
import { favoriteTaskKey, type FavoriteTask } from "@/lib/favorite-tasks";
import { Star, StarFill, Xmark, Square } from "@gravity-ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { BillableIndicator } from "@/components/billable-indicator";
import { FormAlert } from "@/components/form-feedback";
import { formatOverlapConflict } from "@/components/overlap-confirmation";
import { ProjectFormModal, type CreatedProjectSelection } from "@/components/project-form-modal";
import { ProjectSelect } from "@/components/project-select";
import { TimerActionButton } from "@/components/timer-action-button";
import { TimerDurationEditor } from "@/components/timer-duration-editor";
import { useI18n } from "@/lib/i18n";
import { useStore, useTimerTicker } from "@/lib/store";
import { focusTimerTaskInput } from "@/lib/timer-input";

export function TrackerBar() {
  const {
    timer,
    entries,
    projects,
    can,
    startTimer,
    updateTimer,
    setTimerElapsed,
    pauseTimer,
    resumeTimer,
    stopTimer,
  } = useStore();
  const { favorites, isFavorite, toggleFavorite } = useFavoriteTasks();
  const { elapsed } = useTimerTicker();
  const { locale, t, error } = useI18n();
  const [task, setTask] = useState("");
  const taskInputRef = useRef<HTMLInputElement>(null);
  const projectTriggerRef = useRef<HTMLDivElement>(null);
  const [projectValidationVisible, setProjectValidationVisible] = useState(false);
  const [activeTask, setActiveTask] = useState(timer.task);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [billable, setBillable] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectInitialName, setProjectInitialName] = useState("");
  const [pendingCreatedProject, setPendingCreatedProject] =
    useState<CreatedProjectSelection | null>(null);
  const active = timer.status !== "idle";
  const taskSuggestions = useMemo(() => {
    const uniqueTasks = new Map<string, string>();

    entries.forEach((entry) => {
      const entryTask = entry.task.trim();
      if (!entryTask) return;

      const normalizedTask = entryTask.toLocaleLowerCase(locale);
      if (!uniqueTasks.has(normalizedTask)) uniqueTasks.set(normalizedTask, entryTask);
    });

    return Array.from(uniqueTasks.values()).sort((left, right) =>
      left.localeCompare(right, locale, { sensitivity: "base" }),
    );
  }, [entries, locale]);

  useEffect(() => {
    setActiveTask(active ? timer.task : "");
  }, [active, timer.task]);

  const updateActiveTimer = (patch: Parameters<typeof updateTimer>[0]) => {
    const result = updateTimer(patch);
    setTimerError(result.success ? null : result.error);
  };

  useEffect(() => {
    if (!pendingCreatedProject) return;
    if (!projects.some((project) => project.id === pendingCreatedProject.id)) return;

    if (timer.status !== "idle") {
      const result = updateTimer({ projectId: pendingCreatedProject.id });
      setTimerError(result.success ? null : result.error);
    } else {
      setProjectId(pendingCreatedProject.id);
      setBillable(pendingCreatedProject.billable);
    }
    setPendingCreatedProject(null);
  }, [pendingCreatedProject, projects, timer.status, updateTimer]);

  const updateTaskValue = (value: string) => {
    taskInputRef.current?.setCustomValidity("");
    if (!active) {
      setTask(value);
      return;
    }

    setActiveTask(value);
    if (value.trim()) updateActiveTimer({ task: value });
  };

  const currentTask = {
    task: active ? activeTask : task,
    projectId: active ? timer.projectId : projectId,
    billable: active ? timer.billable : billable,
  };
  const selectFavorite = (favorite: FavoriteTask) => {
    if (active) return;
    if (
      !projects.some((project) => project.id === favorite.projectId && project.status === "active")
    )
      return;
    setTask(favorite.task);
    setProjectId(favorite.projectId);
    setBillable(favorite.billable);
    setTimerError(null);
    setProjectValidationVisible(false);
    taskInputRef.current?.setCustomValidity("");
    taskInputRef.current?.focus();
  };

  return (
    <div className="space-y-3" data-tracker-bar>
      {favorites.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t("Favorite tasks")}
        >
          {favorites.map((favorite) => {
            const project = projects.find((item) => item.id === favorite.projectId);
            const unavailable = !project || project.status !== "active";
            return (
              <div
                key={favoriteTaskKey(favorite)}
                className="inline-flex max-w-full items-center rounded-full bg-default"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-w-0 rounded-full px-3"
                  isDisabled={active || unavailable}
                  aria-label={t("Use favorite {task}, {project}", {
                    task: favorite.task,
                    project: project?.name ?? t("Project unavailable"),
                  })}
                  onPress={() => selectFavorite(favorite)}
                >
                  <StarFill className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                  <span className="max-w-48 truncate">{favorite.task}</span>
                  <span className="max-w-32 truncate text-xs text-muted">
                    {unavailable ? t("Project unavailable") : project?.name}
                  </span>
                </Button>
                <IconTooltip>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    className="size-7 min-w-7 rounded-full"
                    aria-label={t("Remove {task} from favorites", { task: favorite.task })}
                    onPress={() => toggleFavorite(favorite)}
                  >
                    <Xmark className="size-3" />
                  </Button>
                </IconTooltip>
              </div>
            );
          })}
        </div>
      ) : null}
      <Card className="w-full gap-0 p-1.5" variant="default">
        <Toolbar
          aria-label={t("Timer")}
          data-status={timer.status}
          orientation="horizontal"
          className="grid-flow-row w-full max-w-full gap-1 grid-cols-1 sm:grid-flow-col sm:grid-cols-[minmax(0,1fr)_auto_minmax(11rem,15rem)_auto_auto_auto]"
        >
          <ComboBox
            isRequired
            allowsCustomValue
            className="min-w-0"
            fullWidth
            inputValue={active ? activeTask : task}
            menuTrigger="input"
            name="timer-task"
            variant="secondary"
            onInputChange={updateTaskValue}
            onSelectionChange={(key) => {
              if (key !== null) updateTaskValue(String(key));
            }}
          >
            <Label className="sr-only">{t("What are you working on?")}</Label>
            <ComboBox.InputGroup className="w-full">
              <Input
                ref={taskInputRef}
                data-timer-task-input
                className="rounded-s-[calc(var(--radius)*3)] !pe-3"
                placeholder={t("What are you working on?")}
                variant="secondary"
                onBlur={() => {
                  if (!active) return;
                  if (activeTask.trim()) {
                    updateActiveTimer({ task: activeTask });
                  } else {
                    setActiveTask(timer.task);
                    setTimerError(t("A task is required."));
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <ComboBox.Trigger aria-label={t("What are you working on?")} className="hidden" />
            </ComboBox.InputGroup>
            <ComboBox.Popover className="max-h-60">
              <ListBox
                aria-label={t("Tasks")}
                renderEmptyState={() => <EmptyState>{t("No tasks found")}</EmptyState>}
              >
                {taskSuggestions.map((suggestion) => (
                  <ListBox.Item key={suggestion} id={suggestion} textValue={suggestion}>
                    {suggestion}
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <div className="min-w-0">
            <Label className="sr-only">{t("Project")}</Label>
            <ProjectSelect
              required
              triggerRef={projectTriggerRef}
              validationMessage={
                projectValidationVisible && !(active ? timer.projectId : projectId)
                  ? t("Select a project before starting the timer.")
                  : null
              }
              onValidationDismiss={() => setProjectValidationVisible(false)}
              ariaLabel={t("Project")}
              value={(active ? timer.projectId : projectId) ?? "none"}
              allowArchivedId={active ? timer.projectId : null}
              variant="secondary"
              showClientName
              {...(can("manage-projects")
                ? {
                    onCreateProject: (initialName: string) => {
                      setProjectInitialName(initialName);
                      setProjectFormOpen(true);
                    },
                  }
                : {})}
              onChange={(value) => {
                setProjectValidationVisible(false);
                const nextProjectId = value === "none" || value === "all" ? null : value;
                if (active) {
                  updateActiveTimer({ projectId: nextProjectId });
                } else {
                  setProjectId(nextProjectId);
                  setBillable(
                    nextProjectId === null
                      ? false
                      : (projects.find((project) => project.id === nextProjectId)?.billable ??
                          false),
                  );
                }
              }}
            />
          </div>

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <TimerDurationEditor
            elapsed={elapsed}
            isReadOnly={!active}
            onElapsedChange={(seconds) => {
              const result = setTimerElapsed(seconds);
              setTimerError(result.success ? null : result.error);
            }}
          />

          <Toolbar aria-label={t("Timer")} className="shrink-0 gap-1">
            <IconTooltip>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="size-9 min-w-9"
                aria-label={t(
                  isFavorite(currentTask) ? "Remove from favorites" : "Add to favorites",
                )}
                aria-pressed={isFavorite(currentTask)}
                onPress={() => toggleFavorite(currentTask)}
              >
                {isFavorite(currentTask) ? (
                  <StarFill className="size-4 text-warning" />
                ) : (
                  <Star className="size-4" />
                )}
              </Button>
            </IconTooltip>
            <TimerActionButton
              status={timer.status}
              onPress={() => {
                if (timer.status === "idle") {
                  if (!task.trim()) {
                    setProjectValidationVisible(false);
                    setTimerError(null);
                    focusTimerTaskInput(t("A task is required."));
                    return;
                  }
                  if (!projectId) {
                    setTimerError(null);
                    projectTriggerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
                    setProjectValidationVisible(true);
                    return;
                  }
                  const result = startTimer(task, projectId, billable);
                  setTimerError(result.success ? null : result.error);
                  return;
                }

                if (timer.status === "running") pauseTimer();
                else {
                  const result = resumeTimer();
                  setTimerError(result.success ? null : result.error);
                }
              }}
            />

            {timer.status !== "idle" ? (
              <ToggleButtonGroup
                aria-label={t("Timer")}
                size="sm"
                className="shrink-0 gap-0.5"
                selectionMode="multiple"
              >
                <IconTooltip>
                  <ToggleButton
                    aria-label={t("Stop")}
                    className="size-9 min-h-9 min-w-9"
                    isIconOnly
                    isSelected={false}
                    onPress={() => {
                      const result = stopTimer();
                      if (!result.success) {
                        setTimerError(result.error);
                        return;
                      }
                      if (result.warning) {
                        toast.info(t("Overlapping time"), {
                          description: result.conflict
                            ? formatOverlapConflict(result.conflict, locale)
                            : error(result.warning),
                        });
                      }
                      setTask("");
                      setTimerError(null);
                      setActiveTask("");
                      setProjectId(null);
                    }}
                  >
                    <Square aria-hidden="true" />
                  </ToggleButton>
                </IconTooltip>
              </ToggleButtonGroup>
            ) : null}

            <Separator orientation="vertical" className="hidden h-6 sm:block" />

            <ToggleButtonGroup
              aria-label={t("Timer")}
              size="sm"
              className="shrink-0 gap-0.5"
              selectionMode="multiple"
            >
              <IconTooltip>
                <ToggleButton
                  aria-label={t("Billable")}
                  className="size-9 min-h-9 min-w-9"
                  isIconOnly
                  isSelected={active ? timer.billable : billable}
                  onChange={(selected: boolean) => {
                    if (active) updateActiveTimer({ billable: selected });
                    else setBillable(selected);
                  }}
                >
                  <BillableIndicator
                    billable={active ? timer.billable : billable}
                    mode="icon"
                    size="md"
                  />
                </ToggleButton>
              </IconTooltip>
            </ToggleButtonGroup>
          </Toolbar>
        </Toolbar>
      </Card>

      {timerError ? (
        <FormAlert title={t("We couldn't update the timer")} description={error(timerError)} />
      ) : null}

      <ProjectFormModal
        isOpen={projectFormOpen}
        initialName={projectInitialName}
        onOpenChange={(open) => {
          setProjectFormOpen(open);
          if (!open) setProjectInitialName("");
        }}
        onCreated={setPendingCreatedProject}
      />
    </div>
  );
}
