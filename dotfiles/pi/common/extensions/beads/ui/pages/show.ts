import { DynamicBorder, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type KeybindingsManager,
} from "@earendil-works/pi-tui";
import {
  buildPrimaryHelpText,
  buildSecondaryHelpText,
  FormSaveCoordinator,
  getHeaderStatus,
  isSameDraft,
  normalizeDraft,
  type FormDraft,
  type FormFocus,
  type FormMode,
  type HeaderStatus,
} from "../../controllers/show.ts";
import {
  buildTaskIdentityText,
  buildTaskListTextParts,
  formatTaskTypeCode,
  type Task,
  type TaskStatus,
} from "../../models/task.ts";
import {
  buildTaskContext,
  type TaskContextField,
} from "../../lib/task-context.ts";
import { BlurEditorField } from "../components/blur-editor.ts";
import { KEYBOARD_HELP_PADDING_X, formatKeyboardHelp } from "../components/keyboard-help.ts";

export type TaskFormAction = "back" | "close_list";

export interface TaskFormResult {
  action: TaskFormAction;
}

interface ShowTaskFormOptions {
  mode: FormMode;
  subtitle: string;
  task: Task;
  closeKey: string;
  cycleStatus: (status: TaskStatus) => TaskStatus;
  cycleTaskType: (taskType: string | undefined) => string;
  parsePriorityKey: (data: string) => string | null;
  priorities: string[];
  priorityHotkeys?: Record<string, string>;
  onSave: (draft: FormDraft) => Promise<boolean>;
}

function buildPageTitle(theme: any, subtitle: string, status?: HeaderStatus): string {
  const base = `${theme.fg("muted", theme.bold("Tasks"))}${theme.fg("dim", ` • ${subtitle}`)}`;
  if (!status) return base;

  const marker = status.icon ? theme.fg(status.color, status.icon) : "•";
  return `${base} ${marker} ${theme.fg(status.color, status.message)}`;
}

function buildSelectedTaskLine(
  mode: FormMode,
  theme: any,
  rowIdentity: string,
  rowMeta: string,
  priority: string | undefined,
  taskType: string | undefined
): string {
  if (mode === "create") {
    const identity = buildTaskIdentityText(priority, "new");
    return `${theme.fg("accent", SELECTED_ITEM_PREFIX)}${identity} ${formatTaskTypeCode(taskType)}`;
  }

  return `${theme.fg("accent", SELECTED_ITEM_PREFIX)}${rowIdentity} ${rowMeta}`;
}

function fieldLabel(theme: any, label: string, focused: boolean): string {
  const color = focused ? "accent" : "muted";
  return theme.fg(color, theme.bold(`  ${label}`));
}

const SELECTED_ITEM_PREFIX = "› ";
const DEFAULT_TERMINAL_ROWS = 24;
const MAX_TERMINAL_ROWS = 500;
const MIN_DESCRIPTION_FIELD_HEIGHT = 2;

class FixedHeightField implements Component {
  private child: Component;
  private height: number;

  constructor(child: Component, height: number) {
    this.child = child;
    this.height = height;
  }

  setHeight(height: number): void {
    this.height = Math.max(1, Math.floor(height));
  }

  invalidate(): void {
    this.child.invalidate();
  }

  render(width: number): string[] {
    const lines = this.child.render(width);

    if (lines.length === this.height) return lines;

    if (lines.length < this.height) {
      return [...lines, ...Array(this.height - lines.length).fill(" ".repeat(Math.max(0, width)))];
    }

    if (this.height <= 1) {
      return [lines[lines.length - 1] || ""];
    }

    const bottomLine = lines[lines.length - 1] || "";
    const bodyLines = lines.slice(0, lines.length - 1);
    const viewportHeight = this.height - 1;

    const cursorIndex = bodyLines.findIndex((line) => line.includes("\x1b[7m"));

    let start = Math.max(0, bodyLines.length - viewportHeight);
    if (cursorIndex >= 0) {
      if (cursorIndex < start) {
        start = cursorIndex;
      } else if (cursorIndex >= start + viewportHeight) {
        start = cursorIndex - viewportHeight + 1;
      }
    }

    const clippedBody = bodyLines.slice(start, start + viewportHeight);
    if (clippedBody.length < viewportHeight) {
      clippedBody.push(
        ...Array(viewportHeight - clippedBody.length).fill(" ".repeat(Math.max(0, width)))
      );
    }

    return [...clippedBody, bottomLine];
  }

  handleInput(data: string): void {
    const childWithInput = this.child as Component & { handleInput?: (input: string) => void };
    childWithInput.handleInput?.(data);
  }
}

class ReservedText implements Component {
  private text = "";
  private paddingX: number;

  constructor(paddingX = 1) {
    this.paddingX = paddingX;
  }

  setText(text: string): void {
    this.text = text;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const innerWidth = Math.max(0, width - this.paddingX * 2);
    const left = " ".repeat(this.paddingX);
    const right = " ".repeat(this.paddingX);

    if (!this.text || this.text.trim().length === 0) {
      return [`${left}${" ".repeat(innerWidth)}${right}`];
    }

    const contentLines = wrapTextWithAnsi(this.text, Math.max(1, innerWidth));
    return contentLines.map((content) => {
      const truncated = truncateToWidth(content, innerWidth);
      const trailingPadding = Math.max(0, innerWidth - visibleWidth(truncated));
      return `${left}${truncated}${" ".repeat(trailingPadding)}${right}`;
    });
  }
}

export function buildReadOnlyTaskContext(task: Task, mode: FormMode): TaskContextField[] {
  if (mode === "create") return [];
  return buildTaskContext(task).filter(
    ({ key }) => !["status", "priority", "type", "description"].includes(key)
  );
}

export async function showTaskForm(
  ctx: ExtensionCommandContext,
  options: ShowTaskFormOptions
): Promise<TaskFormResult> {
  const {
    mode,
    subtitle,
    task,
    closeKey,
    cycleStatus,
    cycleTaskType,
    parsePriorityKey,
    priorities,
    priorityHotkeys,
    onSave,
  } = options;

  let taskTypeValue = task.taskType;
  let titleValue = task.title;
  let descValue = task.description ?? "";
  let statusValue = task.status;
  let priorityValue = task.priority;

  return ctx.ui.custom<TaskFormResult>((tui: any, theme: any, keybindings: KeybindingsManager, done: any) => {
    const container = new Container();
    const headerContainer = new Container();
    const formContainer = new Container();
    const contextContainer = new Container();
    const footerContainer = new Container();

    container.addChild(headerContainer);
    container.addChild(formContainer);
    container.addChild(contextContainer);
    container.addChild(footerContainer);

    const pageTitleText = new Text("", 1, 0);
    const selectedTaskText = new Text("", 0, 0);
    const titleLabel = new Text("", 0, 0);
    const descLabel = new Text("", 0, 0);
    const helpText = new ReservedText(KEYBOARD_HELP_PADDING_X);
    const shortcutsText = new ReservedText(KEYBOARD_HELP_PADDING_X);

    let focus: FormFocus = mode === "create" ? "title" : "nav";
    let tuiFocused = false;
    let saveIndicator: "saving" | "saved" | "error" | undefined;
    let saveIndicatorTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const saveCoordinator = new FormSaveCoordinator();

    const editorTheme = {
      borderColor: (s: string) => theme.fg("accent", s),
      selectList: {
        selectedPrefix: (t: string) => theme.fg("accent", t),
        selectedText: (t: string) => theme.fg("accent", t),
        description: (t: string) => theme.fg("muted", t),
        scrollInfo: (t: string) => theme.fg("dim", t),
        noMatch: (t: string) => theme.fg("warning", t),
      },
    };

    const titleEditor = new BlurEditorField(tui, editorTheme, {
      stripTopBorder: true,
      blurredBorderColor: (s: string) => theme.fg("muted", s),
      paddingX: 2,
      indentX: 2,
    });
    titleEditor.setText(titleValue);
    titleEditor.disableSubmit = true;
    titleEditor.onChange = (text: string) => {
      const normalized = text.replace(/\r?\n/g, " ");
      if (normalized !== text) {
        titleEditor.setText(normalized);
        return;
      }
      titleValue = normalized;
    };

    const descEditor = new BlurEditorField(tui, editorTheme, {
      stripTopBorder: true,
      blurredBorderColor: (s: string) => theme.fg("muted", s),
      paddingX: 2,
      indentX: 2,
    });
    const titleCompactField = new FixedHeightField(titleEditor, 2);
    const descEditorField = new FixedHeightField(descEditor, MIN_DESCRIPTION_FIELD_HEIGHT);
    descEditor.setText(descValue);
    descEditor.disableSubmit = true;
    descEditor.onChange = (text: string) => {
      descValue = text;
    };

    const currentDraft = (): FormDraft => ({
      title: titleValue,
      description: descValue,
      status: statusValue,
      priority: priorityValue,
      taskType: taskTypeValue,
    });

    let lastSavedDraft: FormDraft = currentDraft();

    const triggerSave = async () => {
      if (!saveCoordinator.canStart) return;

      const draft = currentDraft();
      if (isSameDraft(draft, lastSavedDraft)) return;

      if (saveIndicatorTimer) clearTimeout(saveIndicatorTimer);
      saveIndicator = "saving";
      renderLayout();

      const outcome = await saveCoordinator.run(() => onSave(draft));
      if (disposed || outcome.kind === "ignored") return;

      if (outcome.kind === "failed") {
        saveIndicator = "error";
        ctx.ui.notify(
          outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
          "error"
        );
      } else if (!outcome.value) {
        saveIndicator = undefined;
      } else {
        lastSavedDraft = normalizeDraft(draft);
        saveIndicator = "saved";
      }
      renderLayout();

      if (saveIndicator === "saved" && !disposed) {
        saveIndicatorTimer = setTimeout(() => {
          if (disposed) return;
          saveIndicator = undefined;
          renderLayout();
        }, 5000);
      }
    };

    const renderLayout = () => {
      titleEditor.focused = tuiFocused && focus === "title";
      descEditor.focused = tuiFocused && focus === "desc";

      const rowParts = buildTaskListTextParts({
        ...task,
        title: titleValue,
        description: descValue,
        status: statusValue,
        priority: priorityValue,
        taskType: taskTypeValue,
      });

      const headerStatus = getHeaderStatus(saveIndicator, focus);
      pageTitleText.setText(buildPageTitle(theme, subtitle, headerStatus));
      selectedTaskText.setText(
        buildSelectedTaskLine(
          mode,
          theme,
          rowParts.identity,
          rowParts.meta,
          priorityValue,
          taskTypeValue
        )
      );
      titleLabel.setText(fieldLabel(theme, "Title", focus === "title"));
      descLabel.setText(fieldLabel(theme, "Description", focus === "desc"));

      const closeKeyLabel = closeKey === "\x18" ? "ctrl+x" : closeKey;
      helpText.setText(
        formatKeyboardHelp(theme, buildPrimaryHelpText(focus, keybindings, closeKeyLabel))
      );
      const secondaryHelp = buildSecondaryHelpText(focus, priorities, priorityHotkeys);
      shortcutsText.setText(secondaryHelp ? formatKeyboardHelp(theme, secondaryHelp) : "");

      container.invalidate();
      tui.requestRender();
    };

    headerContainer.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));
    headerContainer.addChild(pageTitleText);
    headerContainer.addChild(selectedTaskText);

    formContainer.addChild(new Spacer(1));
    formContainer.addChild(titleLabel);
    formContainer.addChild(titleEditor);
    formContainer.addChild(new Spacer(1));
    formContainer.addChild(descLabel);
    formContainer.addChild(descEditorField);

    if (mode === "edit") {
      const richFields = buildReadOnlyTaskContext(task, mode);
      if (richFields.length) {
        const richText = richFields
          .map(({ label, value, multiline }) =>
            multiline ? `${theme.bold(label)}:\n${value}` : `${theme.bold(label)}: ${value}`
          )
          .join("\n");
        contextContainer.addChild(new Spacer(1));
        contextContainer.addChild(new Text(richText, 2, 0));
      }
    }

    footerContainer.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));
    footerContainer.addChild(helpText);
    footerContainer.addChild(shortcutsText);
    footerContainer.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));

    renderLayout();

    const requestRender = () => {
      container.invalidate();
      tui.requestRender();
    };

    const matches = (data: string, action: Parameters<KeybindingsManager["matches"]>[1]) =>
      keybindings.matches(data, action);

    const handleTitleInput = (data: string) => {
      if (matches(data, "tui.input.submit")) {
        focus = "nav";
        void triggerSave();
        renderLayout();
        return;
      }

      if (matches(data, "tui.input.tab")) {
        focus = "desc";
        renderLayout();
        return;
      }

      titleEditor.handleInput(data);
      requestRender();
    };

    const handleDescInput = (data: string) => {
      if (matches(data, "tui.input.newLine")) {
        descEditor.insertTextAtCursor("\n");
        requestRender();
        return;
      }

      if (matches(data, "tui.input.submit") || matches(data, "tui.input.tab")) {
        focus = "nav";
        void triggerSave();
        renderLayout();
        return;
      }

      descEditor.handleInput(data);
      requestRender();
    };

    const handleNavInput = (data: string) => {
      if (matches(data, "tui.input.submit")) {
        void triggerSave();
        return;
      }

      if (matches(data, "tui.input.tab")) {
        focus = "title";
        renderLayout();
        return;
      }

      if (
        matches(data, "tui.select.cancel") ||
        matches(data, "tui.editor.cursorLeft") ||
        data === "q" ||
        data === "Q"
      ) {
        done({ action: "back" });
        return;
      }

      if (data === "t" || data === "T") {
        taskTypeValue = cycleTaskType(taskTypeValue);
        renderLayout();
        return;
      }

      if (data === " ") {
        statusValue = cycleStatus(statusValue);
        renderLayout();
        return;
      }

      const priority = parsePriorityKey(data);
      if (priority !== null) {
        priorityValue = priority;
        renderLayout();
      }
    };

    const component: Component & Focusable & { dispose(): void } = {
      get focused() {
        return tuiFocused;
      },
      set focused(value: boolean) {
        tuiFocused = value;
        renderLayout();
      },
      render: (w: number) => {
        const terminalRowsValue = tui.terminal?.rows;
        const terminalRows =
          typeof terminalRowsValue === "number" &&
          Number.isFinite(terminalRowsValue) &&
          terminalRowsValue > 0
            ? Math.min(Math.floor(terminalRowsValue), MAX_TERMINAL_ROWS)
            : DEFAULT_TERMINAL_ROWS;

        const bounded = (lines: string[]) =>
          lines.map((line: string) => truncateToWidth(line, w));
        const headerLines = headerContainer.render(w);
        const footerLines = footerContainer.render(w);
        const chromeRows = headerLines.length + footerLines.length;

        descEditorField.setHeight(MIN_DESCRIPTION_FIELD_HEIGHT);
        const minimumFormRows = formContainer.render(w).length;
        const normalLayoutFits = chromeRows + minimumFormRows <= terminalRows;

        if (focus !== "nav" && !normalLayoutFits) {
          const activeLabelLines = (focus === "title" ? titleLabel : descLabel).render(w);
          const activeEditorLines =
            focus === "title" ? titleCompactField.render(w) : descEditorField.render(w);
          const activeRows = activeLabelLines.length + activeEditorLines.length;

          if (activeRows + footerLines.length <= terminalRows) {
            let remainder = terminalRows - activeRows - footerLines.length;
            const compactHeaderLines = headerLines.slice(0, remainder);
            remainder -= compactHeaderLines.length;

            const inactiveLines =
              focus === "title"
                ? [...descLabel.render(w), ...descEditorField.render(w)]
                : [...titleLabel.render(w), ...titleCompactField.render(w)];
            const compactInactiveLines = inactiveLines.slice(0, remainder);
            const formLines =
              focus === "title"
                ? [...activeLabelLines, ...activeEditorLines, ...compactInactiveLines]
                : [...compactInactiveLines, ...activeLabelLines, ...activeEditorLines];

            return bounded([...compactHeaderLines, ...formLines, ...footerLines]);
          }

          let remainder = terminalRows;
          const cursorLineIndex = activeEditorLines.findIndex((line) =>
            line.includes("\x1b[7m")
          );
          const prioritizedEditorLines =
            cursorLineIndex < 0
              ? activeEditorLines
              : [
                  activeEditorLines[cursorLineIndex],
                  ...activeEditorLines.filter((_, index) => index !== cursorLineIndex),
                ];
          const compactEditorLines = prioritizedEditorLines.slice(0, remainder);
          remainder -= compactEditorLines.length;
          const compactLabelLines = activeLabelLines.slice(0, remainder);
          remainder -= compactLabelLines.length;
          const primaryHelpLines = helpText.render(w).slice(0, remainder);

          return bounded([...compactLabelLines, ...compactEditorLines, ...primaryHelpLines]);
        }

        if (terminalRows < chromeRows) {
          const footerBudget = Math.min(terminalRows, footerLines.length);
          const headerBudget = terminalRows - footerBudget;
          return bounded([
            ...headerLines.slice(0, headerBudget),
            ...footerLines.slice(footerLines.length - footerBudget),
          ]);
        }

        const contentBudget = terminalRows - chromeRows;
        const targetContentRows = Math.max(
          0,
          Math.ceil((terminalRows * 2) / 3) - chromeRows
        );

        descEditorField.setHeight(1);
        const minimumFormLines = formContainer.render(w);
        const nonDescriptionRows = Math.max(0, minimumFormLines.length - 1);
        const availableDescriptionRows = Math.max(1, contentBudget - nonDescriptionRows);
        const targetDescriptionRows = Math.max(
          MIN_DESCRIPTION_FIELD_HEIGHT,
          targetContentRows - nonDescriptionRows
        );
        descEditorField.setHeight(Math.min(availableDescriptionRows, targetDescriptionRows));

        const formLines = formContainer.render(w);
        const essentialLines = formLines.slice(0, contentBudget);
        const contextBudget = Math.max(0, contentBudget - essentialLines.length);
        const contextLines = contextContainer.render(w).slice(0, contextBudget);

        return bounded([...headerLines, ...essentialLines, ...contextLines, ...footerLines]);
      },
      invalidate: () => container.invalidate(),
      dispose: () => {
        disposed = true;
        tuiFocused = false;
        titleEditor.focused = false;
        descEditor.focused = false;
        saveCoordinator.dispose();
        if (saveIndicatorTimer) clearTimeout(saveIndicatorTimer);
      },
      handleInput: (data: string) => {
        if (saveCoordinator.isSaving) {
          ctx.ui.notify("Save in progress; wait for it to finish", "warning");
          return;
        }

        if (data === closeKey) {
          done({ action: "close_list" });
          return;
        }

        if (focus !== "nav" && matches(data, "tui.select.cancel")) {
          focus = "nav";
          renderLayout();
          return;
        }

        if (focus === "title") {
          handleTitleInput(data);
          return;
        }

        if (focus === "desc") {
          handleDescInput(data);
          return;
        }

        handleNavInput(data);
      },
    };
    return component;
  });
}
