import type { Keybinding, KeybindingsManager } from "@earendil-works/pi-tui";

type KeybindingReader = Pick<KeybindingsManager, "getKeys">;

export function resolveReachableActionKeyLabels(
  keybindings: KeybindingReader,
  actionGroups: readonly (Keybinding | readonly Keybinding[])[],
  reservedKeys: readonly string[] = []
): string[][] {
  const claimed = new Set(reservedKeys);

  return actionGroups.map((group) => {
    const actions = Array.isArray(group) ? group : [group];
    const labels = [
      ...new Set(actions.flatMap((action) => keybindings.getKeys(action as Keybinding))),
    ].filter((key) => !claimed.has(key));

    for (const key of labels) claimed.add(key);
    return labels;
  });
}

export function formatActionKeyLabels(labels: readonly string[]): string {
  return labels.length > 0 ? labels.join("/") : "(unbound)";
}
