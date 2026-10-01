export const passwordRequirements = [
  {
    label: "At least 8 characters",
    error: "Password must be at least 8 characters.",
    meets: (value: string) => value.length >= 8,
  },
  {
    label: "At least one uppercase letter",
    error: "Password must contain at least one uppercase letter.",
    meets: (value: string) => /[A-Z]/.test(value),
  },
  {
    label: "At least one number",
    error: "Password must contain at least one number.",
    meets: (value: string) => /[0-9]/.test(value),
  },
];
