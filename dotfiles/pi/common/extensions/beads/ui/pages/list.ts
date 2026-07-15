import { DynamicBorder, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { toKebabCase, type Task, type TaskStatus } from "../../models/task.ts";
import type { TaskUpdate } from "../../backend/api.ts";
import {
  DESCRIPTION_PART_SEPARATOR,
  buildListRowModel,
  decodeDescription,
} from "../../models/list-item.ts";
import {
  buildListPrimaryHelpText,
  buildListSecondaryHelpText,
  resolveListIntent,
  TaskMutationCoordinator,
} from "../../controllers/list.ts";
import { KEYBOARD_HELP_PADDING_X, formatKeyboardHelp } from "../components/keyboard-help.ts";
import { SelectListWithColumns } from "../components/select-list-with-columns.ts";

const DEFAULT_TERMINAL_ROWS = 24;
const MAX_TERMINAL_ROWS = 500;
const MAX_VISIBLE_TASKS = 10;
const DEFAULT_DESCRIPTION_ROWS = 7;
const TASK_LIST_ROW_LAYOUT = {
  valueMaxWidth: 60,
  valueColumnWidth: 62,
};

export interface ListPageConfig {
  title: string;
  subtitle?: string;
  tasks: Task[];
  allowPriority?: boolean;
  allowSearch?: boolean;
  filterTerm?: string;
  priorities: string[];
  priorityHotkeys?: Record<string, string>;
  closeKey: string;
  cycleStatus: (status: TaskStatus) => TaskStatus;
  cycleTaskType: (current: string | undefined) => string;
  onUpdateTask: (ref: string, update: TaskUpdate) => Promise<void>;
  onWork: (task: Task) => Promise<void>;
  onInsert: (task: Task) => void;
  onEdit: (
    ref: string,
    task: Task | undefined
  ) => Promise<{ updatedTask: Task | null; closeList: boolean }>;
  onCreate: () => Promise<Task | null>;
}

function truncateDescription(desc: string | undefined, maxLines: number): string[] {
  if (!desc || !desc.trim()) return ["(no description)"];
  const allLines = desc.split(/\r?\n/);
  const lines = allLines.slice(0, maxLines);
  if (allLines.length > maxLines) lines.push("...");
  return lines;
}

function matchesFilter(task: Task, term: string): boolean {
  const lower = term.toLowerCase();
  return (
    task.title.toLowerCase().includes(lower) ||
    (task.description ?? "").toLowerCase().includes(lower) ||
    (task.id ?? "").toLowerCase().includes(lower) ||
    toKebabCase(task.status).includes(lower)
  );
}

function buildHeaderText(
  theme: any,
  title: string,
  subtitle: string | undefined,
  searching: boolean,
  searchBuffer: string,
  filterTerm: string
): string {
  if (searching) return theme.fg("muted", theme.bold(`Search: ${searchBuffer}_`));
  if (filterTerm) return theme.fg("muted", theme.bold(`${title} [filter: ${filterTerm}]`));

  const subtitlePart = subtitle ? theme.fg("dim", ` • ${subtitle}`) : "";
  return `${theme.fg("muted", theme.bold(title))}${subtitlePart}`;
}

export async function showTaskList(
  ctx: ExtensionCommandContext,
  config: ListPageConfig
): Promise<void> {
  const { title, subtitle, tasks, allowPriority = true, allowSearch = true } = config;

  const displayTasks = [...tasks];
  const mutationCoordinator = new TaskMutationCoordinator();
  let filterTerm = config.filterTerm || "";
  let rememberedSelectedRef: string | undefined;

  while (true) {
    const visible = filterTerm
      ? displayTasks.filter((i) => matchesFilter(i, filterTerm))
      : displayTasks;

    if (visible.length === 0 && filterTerm) {
      ctx.ui.notify(`No matches for "${filterTerm}"`, "warning");
      filterTerm = "";
      continue;
    }

    const getMaxLabelWidth = () =>
      Math.max(0, ...displayTasks.map((i) => visibleWidth(buildListRowModel(i).label)));

    let selectedRef: string | undefined;
    const result = await ctx.ui.custom<"cancel" | "select" | "create">(
      (tui: any, theme: any, keybindings: any, done: any) => {
        const container = new Container();
        let searching = false;
        let searchBuffer = "";
        let descScroll = 0;
        let disposed = false;

        const headerContainer = new Container();
        const listAreaContainer = new Container();
        const footerContainer = new Container();
        container.addChild(headerContainer);
        container.addChild(listAreaContainer);
        container.addChild(footerContainer);

        const titleText = new Text("", 1, 0);

        const META_SUMMARY_SEPARATOR = " ";
        const accentMarker = "__ACCENT_MARKER__";
        const accentedMarker = theme.fg("accent", accentMarker);
        const markerIndex = accentedMarker.indexOf(accentMarker);
        const accentPrefix = markerIndex >= 0 ? accentedMarker.slice(0, markerIndex) : "";
        const accentSuffix =
          markerIndex >= 0 ? accentedMarker.slice(markerIndex + accentMarker.length) : "\x1b[0m";
        const applyAccentWithAnsi = (text: string) => {
          const normalized = text.replaceAll(DESCRIPTION_PART_SEPARATOR, META_SUMMARY_SEPARATOR);
          if (!accentPrefix) return theme.fg("accent", normalized);
          return `${accentPrefix}${normalized.replace(/\x1b\[0m/g, `\x1b[0m${accentPrefix}`)}${accentSuffix}`;
        };

        const styleDescription = (text: string) => {
          const { meta, summary } = decodeDescription(text);
          if (!summary) return theme.fg("muted", meta);
          return `${theme.fg("muted", meta)}${META_SUMMARY_SEPARATOR}${summary}`;
        };

        const getItems = () => {
          const filtered = filterTerm
            ? displayTasks.filter((i) => matchesFilter(i, filterTerm))
            : displayTasks;
          const maxLabelWidth = getMaxLabelWidth();
          return filtered.map((task) => {
            const row = buildListRowModel(task, { maxLabelWidth });
            return {
              value: row.ref,
              label: row.label,
              description: row.description,
            };
          });
        };

        const selectListTheme = {
          selectedPrefix: (t: string) => theme.fg("accent", t),
          selectedText: (t: string) => applyAccentWithAnsi(t),
          description: (t: string) => styleDescription(t),
          scrollInfo: (t: string) => theme.fg("dim", t),
          noMatch: (t: string) => theme.fg("warning", t),
        };

        let items = getItems();
        let selectList = new SelectListWithColumns(
          items,
          Math.min(items.length, MAX_VISIBLE_TASKS),
          selectListTheme,
          keybindings,
          TASK_LIST_ROW_LAYOUT
        );

        if (rememberedSelectedRef) {
          const rememberedIndex = items.findIndex((i) => i.value === rememberedSelectedRef);
          if (rememberedIndex >= 0) selectList.setSelectedIndex(rememberedIndex);
        }

        selectList.onSelectionChange = () => {
          const selected = selectList.getSelectedItem();
          if (selected) rememberedSelectedRef = selected.value;
          updateDescPreview();
          tui.requestRender();
        };
        selectList.onSelect = () => {
          const sel = selectList.getSelectedItem();
          if (sel) {
            selectedRef = sel.value;
            rememberedSelectedRef = sel.value;
          }
          done("select");
        };
        selectList.onCancel = () => {
          if (filterTerm) {
            filterTerm = "";
            rebuildAndRender();
          } else {
            done("cancel");
          }
        };

        const renderListArea = (showPreview = true) => {
          while (listAreaContainer.children.length > 0) {
            listAreaContainer.removeChild(listAreaContainer.children[0]);
          }
          listAreaContainer.addChild(selectList);
          if (showPreview) {
            listAreaContainer.addChild(new Spacer(1));
            listAreaContainer.addChild(itemPreviewContainer);
          }
        };

        const wrapText = (text: string, width: number): string[] => {
          if (text.length === 0) return [""];
          return wrapTextWithAnsi(text, Math.max(1, width));
        };

        const previewTitleText = new Text("", 0, 0);
        const descTextComponent = new Text("", 0, 0);
        const itemPreviewContainer = new Container();
        itemPreviewContainer.addChild(previewTitleText);
        itemPreviewContainer.addChild(descTextComponent);

        let lastWidth = 80;
        let descriptionRows = DEFAULT_DESCRIPTION_ROWS;

        const getWrappedDescription = (): string[] => {
          const selected = selectList.getSelectedItem();
          const task = selected ? displayTasks.find((i) => i.ref === selected.value) : undefined;
          if (!task) return [""];

          return truncateDescription(task.description, 100).flatMap((line) =>
            wrapText(line, lastWidth)
          );
        };

        const renderDescription = () => {
          const wrapped = getWrappedDescription();
          const maxScroll = Math.max(0, wrapped.length - descriptionRows);
          descScroll = Math.max(0, Math.min(descScroll, maxScroll));
          const visibleLines = wrapped.slice(descScroll, descScroll + descriptionRows);
          while (visibleLines.length < descriptionRows) visibleLines.push("");
          descTextComponent.setText(visibleLines.join("\n"));
        };

        const updateDescPreview = (resetScroll = true) => {
          const selected = selectList.getSelectedItem();
          const task = selected ? displayTasks.find((i) => i.ref === selected.value) : undefined;
          if (resetScroll) descScroll = 0;
          previewTitleText.setText(task ? theme.fg("accent", theme.bold(task.title)) : "");
          renderDescription();
        };
        if (items[0]) updateDescPreview();

        headerContainer.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));
        headerContainer.addChild(titleText);

        const helpText = new Text("", KEYBOARD_HELP_PADDING_X, 0);
        const shortcutsText = new Text(
          formatKeyboardHelp(theme, buildListSecondaryHelpText()),
          KEYBOARD_HELP_PADDING_X,
          0
        );

        footerContainer.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));
        footerContainer.addChild(helpText);
        footerContainer.addChild(shortcutsText);
        footerContainer.addChild(new DynamicBorder((s: string) => theme.fg("dim", s)));

        renderListArea();

        const refreshDisplay = () => {
          titleText.setText(
            buildHeaderText(theme, title, subtitle, searching, searchBuffer, filterTerm)
          );
          helpText.setText(
            formatKeyboardHelp(
              theme,
              buildListPrimaryHelpText({
                searching,
                filtered: !!filterTerm,
                allowPriority,
                allowSearch,
                closeKey: config.closeKey,
                priorities: config.priorities,
                priorityHotkeys: config.priorityHotkeys,
                keybindings,
              })
            )
          );
        };
        refreshDisplay();

        const moveSelection = (delta: number) => {
          if (items.length === 0) return;
          const selected = selectList.getSelectedItem();
          const currentIndex = selected ? items.findIndex((i) => i.value === selected.value) : 0;
          const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
          const nextIndex = (normalizedIndex + delta + items.length) % items.length;
          selectList.setSelectedIndex(nextIndex);
          updateDescPreview();
          container.invalidate();
          tui.requestRender();
        };

        const getSelectedTask = (): Task | undefined => {
          const selected = selectList.getSelectedItem();
          if (!selected) return undefined;
          rememberedSelectedRef = selected.value;
          return displayTasks.find((i) => i.ref === selected.value);
        };

        const withSelectedTask = (run: (task: Task) => void): void => {
          const task = getSelectedTask();
          if (!task) return;
          run(task);
        };

        const notifyMutationError = (error: unknown) => {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        };

        const startTaskMutation = (
          task: Task,
          update: TaskUpdate,
          applyPersistedUpdate: () => void
        ) => {
          if (mutationCoordinator.isInFlight(task.ref)) {
            ctx.ui.notify(`Task ${task.ref} is still saving`, "warning");
            return;
          }

          void mutationCoordinator
            .run(
              task.ref,
              () => config.onUpdateTask(task.ref, update),
              () => {
                applyPersistedUpdate();
                if (!disposed) rebuildAndRender();
              },
              notifyMutationError
            )
            .catch(notifyMutationError);
        };

        const rebuildAndRender = () => {
          items = getItems();
          const prevSelected = selectList.getSelectedItem();

          selectList = new SelectListWithColumns(
            items,
            Math.min(items.length, MAX_VISIBLE_TASKS),
            selectListTheme,
            keybindings,
            TASK_LIST_ROW_LAYOUT
          );

          selectList.onSelectionChange = () => {
            const selected = selectList.getSelectedItem();
            if (selected) rememberedSelectedRef = selected.value;
            updateDescPreview();
            tui.requestRender();
          };
          selectList.onSelect = () => {
            const sel = selectList.getSelectedItem();
            if (sel) {
              selectedRef = sel.value;
              rememberedSelectedRef = sel.value;
            }
            done("select");
          };
          selectList.onCancel = () => {
            if (filterTerm) {
              filterTerm = "";
              rebuildAndRender();
            } else {
              done("cancel");
            }
          };

          renderListArea();

          if (prevSelected) {
            const newIdx = items.findIndex((i) => i.value === prevSelected.value);
            if (newIdx >= 0) selectList.setSelectedIndex(newIdx);
          }

          refreshDisplay();
          updateDescPreview();
          container.invalidate();
          tui.requestRender();
        };

        return {
          render: (w: number) => {
            lastWidth = w;
            const terminalRowsValue = tui.terminal?.rows;
            const terminalRows =
              typeof terminalRowsValue === "number" &&
              Number.isFinite(terminalRowsValue) &&
              terminalRowsValue > 0
                ? Math.min(Math.floor(terminalRowsValue), MAX_TERMINAL_ROWS)
                : DEFAULT_TERMINAL_ROWS;

            const headerLines = headerContainer.render(w);
            const footerLines = footerContainer.render(w);
            const chromeRows = headerLines.length + footerLines.length;
            if (terminalRows < chromeRows) {
              const footerBudget = Math.min(terminalRows, footerLines.length);
              const headerBudget = terminalRows - footerBudget;
              return [
                ...headerLines.slice(0, headerBudget),
                ...footerLines.slice(footerLines.length - footerBudget),
              ].map((line: string) => truncateToWidth(line, w));
            }

            const contentBudget = terminalRows - chromeRows;
            const targetContentRows = Math.max(
              0,
              Math.ceil((terminalRows * 2) / 3) - chromeRows
            );
            const previewChromeRows = 1 + previewTitleText.render(w).length;

            let visibleTaskRows = Math.max(
              1,
              Math.min(items.length || 1, MAX_VISIBLE_TASKS)
            );
            selectList.setMaxVisible(visibleTaskRows);
            let listRows = selectList.render(w).length;
            while (
              visibleTaskRows > 1 &&
              listRows + previewChromeRows + DEFAULT_DESCRIPTION_ROWS > contentBudget
            ) {
              visibleTaskRows -= 1;
              selectList.setMaxVisible(visibleTaskRows);
              listRows = selectList.render(w).length;
            }
            if (listRows > contentBudget) {
              visibleTaskRows = 0;
              selectList.setMaxVisible(0);
              listRows = 0;
            }

            const showPreview = contentBudget - listRows >= previewChromeRows;
            const renderedPreviewChromeRows = showPreview ? previewChromeRows : 0;
            const maxDescriptionRows = Math.max(
              0,
              contentBudget - listRows - renderedPreviewChromeRows
            );
            const rowsNeededForTarget = Math.max(
              DEFAULT_DESCRIPTION_ROWS,
              targetContentRows - listRows - renderedPreviewChromeRows
            );
            descriptionRows = showPreview
              ? Math.min(maxDescriptionRows, rowsNeededForTarget)
              : 0;
            updateDescPreview(false);
            renderListArea(showPreview);

            const lines = container.render(w);
            return lines.map((line: string) => truncateToWidth(line, w));
          },
          invalidate: () => container.invalidate(),
          dispose: () => {
            disposed = true;
          },
          handleInput: (data: string) => {
            const intent = resolveListIntent(data, {
              searching,
              filtered: !!filterTerm,
              allowSearch,
              allowPriority,
              closeKey: config.closeKey,
              priorities: config.priorities,
              priorityHotkeys: config.priorityHotkeys,
              keybindings,
            });

            switch (intent.type) {
              case "cancel":
                done("cancel");
                return;

              case "searchStart":
                searching = true;
                searchBuffer = "";
                refreshDisplay();
                container.invalidate();
                tui.requestRender();
                return;

              case "searchCancel":
                searching = false;
                searchBuffer = "";
                refreshDisplay();
                container.invalidate();
                tui.requestRender();
                return;

              case "searchApply":
                filterTerm = searchBuffer.trim();
                searching = false;
                rebuildAndRender();
                refreshDisplay();
                return;

              case "searchBackspace":
                searchBuffer = searchBuffer.slice(0, -1);
                refreshDisplay();
                container.invalidate();
                tui.requestRender();
                return;

              case "searchAppend":
                searchBuffer += intent.value;
                refreshDisplay();
                container.invalidate();
                tui.requestRender();
                return;

              case "moveSelection":
                moveSelection(intent.delta);
                return;

              case "work":
                withSelectedTask((task) => {
                  done("cancel");
                  void config.onWork(task).catch(notifyMutationError);
                });
                return;

              case "edit":
                withSelectedTask((task) => {
                  if (mutationCoordinator.isInFlight(task.ref)) {
                    ctx.ui.notify(`Task ${task.ref} is still saving`, "warning");
                    return;
                  }
                  selectedRef = task.ref;
                  done("select");
                });
                return;

              case "toggleStatus":
                withSelectedTask((task) => {
                  const newStatus = config.cycleStatus(task.status);
                  startTaskMutation(task, { status: newStatus }, () => {
                    task.status = newStatus;
                  });
                });
                return;

              case "setPriority":
                withSelectedTask((task) => {
                  if (task.priority === intent.priority) return;
                  startTaskMutation(task, { priority: intent.priority }, () => {
                    task.priority = intent.priority;
                  });
                });
                return;

              case "scrollDescription":
                withSelectedTask((task) => {
                  const maxScroll = Math.max(
                    0,
                    getWrappedDescription().length - descriptionRows
                  );
                  if (intent.delta > 0 && descScroll < maxScroll) {
                    descScroll++;
                  } else if (intent.delta < 0 && descScroll > 0) {
                    descScroll--;
                  }
                  renderDescription();
                  container.invalidate();
                  tui.requestRender();
                });
                return;

              case "toggleType":
                withSelectedTask((task) => {
                  const newType = config.cycleTaskType(task.taskType);
                  startTaskMutation(task, { taskType: newType }, () => {
                    task.taskType = newType;
                  });
                });
                return;

              case "create":
                done("create");
                return;

              case "insert":
                withSelectedTask((task) => {
                  done("cancel");
                  config.onInsert(task);
                });
                return;

              case "delegate":
                selectList.handleInput(data);
                tui.requestRender();
                return;
            }
          },
        };
      }
    );

    if (result === "cancel") return;

    if (result === "create") {
      const createdTask = await config.onCreate();
      if (createdTask) {
        displayTasks.unshift(createdTask);
        rememberedSelectedRef = createdTask.ref;
      }
      continue;
    }

    if (result === "select" && selectedRef) {
      rememberedSelectedRef = selectedRef;
      const currentTask = displayTasks.find((i) => i.ref === selectedRef);
      const editResult = await config.onEdit(selectedRef, currentTask);
      if (editResult.updatedTask) {
        const idx = displayTasks.findIndex((i) => i.ref === selectedRef);
        if (idx !== -1) displayTasks[idx] = editResult.updatedTask;
      }
      if (editResult.closeList) return;
    }
  }
}
