import { useContext, useLayoutEffect } from "react";
import { TableStateContext } from "react-aria-components";

/** Mount inside a table cell while its inline editor is active. */
export function TableEditingMode() {
  const state = useContext(TableStateContext);
  const setKeyboardNavigationDisabled = state?.setKeyboardNavigationDisabled;

  useLayoutEffect(() => {
    // Grid cells capture arrow keys before input handlers can receive them.
    setKeyboardNavigationDisabled?.(true);
    return () => setKeyboardNavigationDisabled?.(false);
  }, [setKeyboardNavigationDisabled]);

  return null;
}
