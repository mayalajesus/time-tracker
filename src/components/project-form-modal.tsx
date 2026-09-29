import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { ColorSwatchPicker } from "@heroui/react/color-swatch-picker";
import { Dropdown } from "@heroui/react/dropdown";
import { EmptyState } from "@heroui/react/empty-state";
import { FieldError } from "@heroui/react/field-error";
import { Form } from "@heroui/react/form";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { Modal } from "@heroui/react/modal";
import { useFilter, parseColor } from "@heroui/react/rac";
import { SearchField } from "@heroui/react/search-field";
import { Tag } from "@heroui/react/tag";
import { TagGroup } from "@heroui/react/tag-group";
import { TextField } from "@heroui/react/textfield";
import { ToggleButton } from "@heroui/react/toggle-button";
import { ToggleButtonGroup } from "@heroui/react/toggle-button-group";
import { Typography } from "@heroui/react/typography";
import { toast } from "@heroui/react/toast";
import { ChevronDown } from "@gravity-ui/icons";
import { useEffect, useMemo, useState } from "react";
import { BillableIndicator } from "@/components/billable-indicator";
import { FormAlert } from "@/components/form-feedback";
import { ModalLayout } from "@/components/modal-layout";
import { ModalSelect } from "@/components/modal-select";
import { ModalTriggerRegistration } from "@/components/overlay-trigger-registration";
import { getSessionDefaultAvatarUrl } from "@/lib/default-avatar";
import type { Project } from "@/lib/domain";
import { useI18n } from "@/lib/i18n";
import { defaultProjectColor, projectColorOptions, projectColorValue } from "@/lib/project-colors";
import { useStore } from "@/lib/store";

export interface CreatedProjectSelection {
  id: string;
  billable: boolean;
}

interface ProjectFormModalProps {
  isOpen: boolean;
  project?: Project | null;
  initialName?: string;
  onOpenChange: (isOpen: boolean) => void;
  onCreated?: (project: CreatedProjectSelection) => void;
}

export function ProjectFormModal({
  isOpen,
  project = null,
  initialName = "",
  onOpenChange,
  onCreated,
}: ProjectFormModalProps) {
  const { clients, members, preferencesByUserId, today, currentUserId, addProject, updateProject } =
    useStore();
  const { t, error } = useI18n();
  const { contains } = useFilter({ sensitivity: "base" });
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectColor, setProjectColor] = useState(defaultProjectColor);
  const [projectBillable, setProjectBillable] = useState(false);
  const [assignedMemberIds, setAssignedMemberIds] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setName(project?.name ?? initialName);
    setClientId(project?.clientId ?? "");
    setProjectColor(projectColorValue(project?.color));
    setProjectBillable(project?.billable ?? false);
    setAssignedMemberIds(project?.memberIds ?? [currentUserId]);
    setMemberQuery("");
    setFormError(null);
  }, [currentUserId, initialName, isOpen, project]);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );
  const assignedMemberIdSet = useMemo(() => new Set(assignedMemberIds), [assignedMemberIds]);
  const assignedMembers = useMemo(
    () => activeMembers.filter((member) => assignedMemberIdSet.has(member.id)),
    [activeMembers, assignedMemberIdSet],
  );
  const memberSearchResults = useMemo(() => {
    const query = memberQuery.trim();

    return activeMembers
      .filter(
        (member) =>
          member.id !== currentUserId &&
          !assignedMemberIdSet.has(member.id) &&
          (query.length === 0 || contains(member.name, query) || contains(member.email, query)),
      )
      .slice(0, 50);
  }, [activeMembers, assignedMemberIdSet, contains, currentUserId, memberQuery]);

  const setOpen = (open: boolean) => {
    if (!open) {
      setMemberQuery("");
      setFormError(null);
    }
    onOpenChange(open);
  };

  const addMember = (memberId: string) => {
    setAssignedMemberIds((current) =>
      current.includes(memberId) ? current : [...current, memberId],
    );
    setMemberQuery("");
  };

  const saveProject = () => {
    if (!name.trim() || !clientId) return;

    const result = project
      ? updateProject(project.id, {
          name: name.trim(),
          clientId,
          billable: projectBillable,
          color: projectColor,
          memberIds: assignedMemberIds,
        })
      : addProject({
          name: name.trim(),
          clientId,
          billable: projectBillable,
          status: "active",
          color: projectColor,
          lastActivity: today,
          memberIds: assignedMemberIds,
        });

    if (!result.success) {
      setFormError(error(result.error));
      return;
    }

    toast.success(t(project ? "Project updated" : "Project is ready"), {
      description: name.trim(),
    });
    if (!project && result.id) onCreated?.({ id: result.id, billable: projectBillable });
    setOpen(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={setOpen}>
      <ModalTriggerRegistration />
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <ModalLayout.Header>{t(project ? "Edit project" : "New project")}</ModalLayout.Header>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                saveProject();
              }}
            >
              <ModalLayout.Body>
                {formError ? (
                  <FormAlert title={t("We couldn't create this project")} description={formError} />
                ) : null}

                <div className="flex min-w-0 items-end gap-3">
                  <TextField
                    isRequired
                    fullWidth
                    className="min-w-0 flex-1"
                    name="project-name"
                    value={name}
                    validate={(value) => (value.trim() ? null : t("Project name is required"))}
                    onChange={(value) => {
                      setName(value);
                      setFormError(null);
                    }}
                  >
                    <Label>{t("Name")}</Label>
                    <Input variant="secondary" placeholder={t("e.g. Brand refresh")} />
                    <FieldError />
                  </TextField>

                  <ToggleButtonGroup
                    aria-label={t("Billable")}
                    size="sm"
                    className="shrink-0 gap-0.5"
                    selectionMode="multiple"
                  >
                    <ToggleButton
                      aria-label={t("Billable")}
                      className="size-9 min-h-9 min-w-9"
                      isIconOnly
                      isSelected={projectBillable}
                      onChange={(selected: boolean) => setProjectBillable(selected)}
                    >
                      <BillableIndicator billable={projectBillable} mode="icon" size="md" />
                    </ToggleButton>
                  </ToggleButtonGroup>
                </div>

                <div className="space-y-2">
                  <Label>{t("Project color")}</Label>
                  <ColorSwatchPicker
                    aria-label={t("Project color")}
                    value={parseColor(projectColorValue(projectColor))}
                    onChange={(color) =>
                      setProjectColor(typeof color === "string" ? color : color.toString("hex"))
                    }
                    size="md"
                  >
                    {projectColorOptions.map((option) => (
                      <ColorSwatchPicker.Item
                        key={option.id}
                        color={parseColor(option.value)}
                        aria-label={t(option.label)}
                      >
                        <ColorSwatchPicker.Swatch />
                        <ColorSwatchPicker.Indicator />
                      </ColorSwatchPicker.Item>
                    ))}
                  </ColorSwatchPicker>
                </div>

                <ModalSelect
                  label={t("Client")}
                  value={clientId || "none"}
                  options={[
                    { id: "none", label: t("Select a client"), isDisabled: true },
                    ...clients.map((client) => ({ id: client.id, label: client.name })),
                  ]}
                  onChange={(value) => {
                    setClientId(value === "none" ? "" : value);
                    setFormError(null);
                  }}
                />

                <div className="space-y-2">
                  <Label>{t("Project members")}</Label>
                  <Dropdown>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={t("Add project members")}
                      className="h-9 w-full justify-between gap-2 px-3"
                    >
                      <span className="truncate text-sm">{t("Add members")}</span>
                      <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
                    </Button>
                    <Dropdown.Popover
                      className="w-[var(--trigger-width)] max-w-[calc(100vw-2rem)] min-w-0"
                      onOpenChange={(open) => {
                        if (!open) setMemberQuery("");
                      }}
                    >
                      <div className="flex flex-col gap-2 p-2">
                        <SearchField
                          autoFocus
                          aria-label={t("Search members")}
                          name="new-project-member-search"
                          value={memberQuery}
                          onChange={setMemberQuery}
                          variant="secondary"
                        >
                          <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder={`${t("Search members")}...`} />
                            <SearchField.ClearButton />
                          </SearchField.Group>
                        </SearchField>
                        {memberSearchResults.length === 0 ? (
                          <EmptyState>{t("No matching active members")}</EmptyState>
                        ) : (
                          <Dropdown.Menu
                            aria-label={t("Active members")}
                            selectionMode="single"
                            onAction={(key) => addMember(String(key))}
                            className="max-h-60 overflow-y-auto"
                          >
                            {memberSearchResults.map((member) => (
                              <Dropdown.Item
                                key={member.id}
                                id={member.id}
                                textValue={`${member.name} ${member.email}`}
                              >
                                <Avatar size="sm" className="shrink-0">
                                  <Avatar.Fallback>{member.initials}</Avatar.Fallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <Typography type="body-sm" truncate>
                                    {member.name}
                                  </Typography>
                                </div>
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        )}
                      </div>
                    </Dropdown.Popover>
                  </Dropdown>
                  <div className="pt-1">
                    <TagGroup
                      aria-label={t("Selected members")}
                      size="sm"
                      onRemove={(keys) => {
                        const removedIds = new Set(Array.from(keys, String));
                        removedIds.delete(currentUserId);
                        setAssignedMemberIds((current) =>
                          current.filter((id) => !removedIds.has(id)),
                        );
                      }}
                    >
                      <Label>{t("Selected members")}</Label>
                      <TagGroup.List
                        items={assignedMembers}
                        renderEmptyState={() => (
                          <EmptyState className="p-1">{t("No members selected")}</EmptyState>
                        )}
                      >
                        {(member) => (
                          <Tag key={member.id} id={member.id} textValue={member.name}>
                            <Avatar className="size-4 shrink-0" size="sm">
                              <Avatar.Image
                                alt={member.name}
                                src={
                                  preferencesByUserId[member.id]?.avatarUrl ??
                                  getSessionDefaultAvatarUrl(member.id)
                                }
                              />
                              <Avatar.Fallback>{member.initials}</Avatar.Fallback>
                            </Avatar>
                            <span className="max-w-40 truncate">{member.name}</span>
                            <Tag.RemoveButton
                              aria-label={t("Remove {name}", { name: member.name })}
                              {...(member.id === currentUserId ? { className: "hidden" } : {})}
                              isDisabled={member.id === currentUserId}
                            />
                          </Tag>
                        )}
                      </TagGroup.List>
                    </TagGroup>
                  </div>
                </div>
              </ModalLayout.Body>
              <ModalLayout.Footer>
                <Button slot="close" type="button" variant="secondary">
                  {t("Cancel")}
                </Button>
                <Button type="submit" isDisabled={!name.trim() || !clientId}>
                  {t(project ? "Save changes" : "Create project")}
                </Button>
              </ModalLayout.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
