import {
  truncateToWidth,
  visibleWidth,
  type Component,
  type KeybindingsManager,
  type SelectItem,
  type SelectListTheme,
} from "@earendil-works/pi-tui";

// Local variant of pi-tui SelectList with configurable value/description column layout.

const normalizeToSingleLine = (text: string): string => text.replace(/[\r\n]+/g, " ").trim();

export interface SelectListColumnLayout {
  valueMaxWidth?: number;
  valueColumnWidth?: number;
  minDescriptionWidth?: number;
  minWidthForDescription?: number;
}

interface ResolvedSelectListColumnLayout {
  valueMaxWidth: number;
  valueColumnWidth: number;
  minDescriptionWidth: number;
  minWidthForDescription: number;
}

const DEFAULT_COLUMN_LAYOUT: ResolvedSelectListColumnLayout = {
  valueMaxWidth: 30,
  valueColumnWidth: 32,
  minDescriptionWidth: 10,
  minWidthForDescription: 40,
};

export class SelectListWithColumns implements Component {
  private items: SelectItem[] = [];
  private filteredItems: SelectItem[] = [];
  private selectedIndex = 0;
  private maxVisible = 5;
  private theme: SelectListTheme;
  private layout: ResolvedSelectListColumnLayout;
  private keybindings: Pick<KeybindingsManager, "matches">;

  public onSelect?: (item: SelectItem) => void;
  public onCancel?: () => void;
  public onSelectionChange?: (item: SelectItem) => void;

  constructor(
    items: SelectItem[],
    maxVisible: number,
    theme: SelectListTheme,
    keybindings: Pick<KeybindingsManager, "matches">,
    layout: SelectListColumnLayout = {}
  ) {
    this.items = items;
    this.filteredItems = items;
    this.maxVisible = maxVisible;
    this.theme = theme;
    this.keybindings = keybindings;
    this.layout = {
      ...DEFAULT_COLUMN_LAYOUT,
      ...layout,
    };
  }

  setSelectedIndex(index: number): void {
    this.selectedIndex = Math.max(0, Math.min(index, this.filteredItems.length - 1));
  }

  invalidate(): void {
    // No cached state.
  }

  render(width: number): string[] {
    const lines: string[] = [];

    if (this.filteredItems.length === 0) {
      lines.push(truncateToWidth(this.theme.noMatch("  No matching commands"), width, ""));
      return lines;
    }

    const startIndex = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(this.maxVisible / 2),
        this.filteredItems.length - this.maxVisible
      )
    );
    const endIndex = Math.min(startIndex + this.maxVisible, this.filteredItems.length);

    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filteredItems[i];
      if (!item) continue;

      const isSelected = i === this.selectedIndex;
      const descriptionSingleLine = item.description
        ? normalizeToSingleLine(item.description)
        : undefined;
      const displayValue = item.label || item.value;
      const prefix = isSelected ? "→ " : "  ";

      if (!descriptionSingleLine || width <= this.layout.minWidthForDescription) {
        lines.push(this.renderValueOnlyLine(prefix, displayValue, width, isSelected));
        continue;
      }

      const prefixWidth = visibleWidth(prefix);
      const maxValueWidth = Math.max(
        0,
        Math.min(this.layout.valueMaxWidth, width - prefixWidth - 4)
      );
      const truncatedValue = truncateToWidth(displayValue, maxValueWidth, "");
      const valueWidth = visibleWidth(truncatedValue);
      const spacing = " ".repeat(Math.max(1, this.layout.valueColumnWidth - valueWidth));
      const descriptionStart = prefixWidth + valueWidth + spacing.length;
      const descriptionWidth = Math.max(0, width - descriptionStart - 2);

      if (descriptionWidth <= this.layout.minDescriptionWidth) {
        lines.push(this.renderValueOnlyLine(prefix, displayValue, width, isSelected));
        continue;
      }

      const truncatedDesc = truncateToWidth(descriptionSingleLine, descriptionWidth, "");
      if (isSelected) {
        lines.push(
          truncateToWidth(
            this.theme.selectedText(`${prefix}${truncatedValue}${spacing}${truncatedDesc}`),
            width,
            ""
          )
        );
      } else {
        lines.push(
          truncateToWidth(
            `${prefix}${truncatedValue}${this.theme.description(spacing + truncatedDesc)}`,
            width,
            ""
          )
        );
      }
    }

    if (startIndex > 0 || endIndex < this.filteredItems.length) {
      const scrollText = `  (${this.selectedIndex + 1}/${this.filteredItems.length})`;
      lines.push(
        truncateToWidth(
          this.theme.scrollInfo(truncateToWidth(scrollText, Math.max(0, width - 2), "")),
          width,
          ""
        )
      );
    }

    return lines;
  }

  handleInput(keyData: string): void {
    if (this.keybindings.matches(keyData, "tui.select.up")) {
      this.selectedIndex =
        this.selectedIndex === 0 ? this.filteredItems.length - 1 : this.selectedIndex - 1;
      this.notifySelectionChange();
      return;
    }

    if (this.keybindings.matches(keyData, "tui.select.down")) {
      this.selectedIndex =
        this.selectedIndex === this.filteredItems.length - 1 ? 0 : this.selectedIndex + 1;
      this.notifySelectionChange();
      return;
    }

    if (this.keybindings.matches(keyData, "tui.select.confirm")) {
      const selectedItem = this.filteredItems[this.selectedIndex];
      if (selectedItem && this.onSelect) this.onSelect(selectedItem);
      return;
    }

    if (this.keybindings.matches(keyData, "tui.select.cancel")) {
      if (this.onCancel) this.onCancel();
    }
  }

  getSelectedItem(): SelectItem | null {
    const item = this.filteredItems[this.selectedIndex];
    return item || null;
  }

  private renderValueOnlyLine(
    prefix: string,
    displayValue: string,
    width: number,
    isSelected: boolean
  ): string {
    const maxWidth = Math.max(0, width - visibleWidth(prefix));
    const line = truncateToWidth(`${prefix}${truncateToWidth(displayValue, maxWidth, "")}`, width, "");
    return isSelected ? truncateToWidth(this.theme.selectedText(line), width, "") : line;
  }

  private notifySelectionChange(): void {
    const selectedItem = this.filteredItems[this.selectedIndex];
    if (selectedItem && this.onSelectionChange) this.onSelectionChange(selectedItem);
  }
}
