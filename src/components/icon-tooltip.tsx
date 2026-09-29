import { Tooltip } from "@heroui/react/tooltip";
import type { ReactElement } from "react";

export function IconTooltip({ children }: { children: ReactElement<{ "aria-label"?: string }> }) {
  return (
    <Tooltip delay={350}>
      {children}
      <Tooltip.Content showArrow>{children.props["aria-label"]}</Tooltip.Content>
    </Tooltip>
  );
}
