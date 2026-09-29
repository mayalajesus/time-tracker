export function focusTimerTaskInput(requiredMessage: string) {
  const input = document.querySelector<HTMLInputElement>("[data-timer-task-input]");
  if (!input) return;

  input.focus();
  input.setCustomValidity(input.value.trim() ? "" : requiredMessage);
  if (!input.value.trim()) input.reportValidity();
}
