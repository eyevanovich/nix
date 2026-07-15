import {
  Editor,
  Text,
  truncateToWidth,
  type Component,
  type EditorTheme,
  type Focusable,
} from "@earendil-works/pi-tui";

interface BlurEditorFieldOptions {
  stripTopBorder?: boolean;
  blurredBorderColor?: (str: string) => string;
  paddingX?: number;
  indentX?: number;
}

export class BlurEditorField implements Component, Focusable {
  onChange?: (text: string) => void;

  private editor: Editor;
  private _focused = false;
  private previewText: Text;
  private stripTopBorder: boolean;
  private blurredBorderColor: (str: string) => string;
  private paddingX: number;
  private indentX: number;

  constructor(tui: any, theme: EditorTheme, options: BlurEditorFieldOptions = {}) {
    const paddingX = Math.max(0, Math.floor(options.paddingX ?? 1));

    this.editor = new Editor(tui, theme);
    this.editor.setPaddingX(paddingX);
    this.previewText = new Text("", paddingX, 0);
    this.stripTopBorder = options.stripTopBorder ?? true;
    this.blurredBorderColor = options.blurredBorderColor ?? theme.borderColor;
    this.paddingX = paddingX;
    this.indentX = Math.max(0, options.indentX ?? 0);

    this.editor.onChange = (text: string) => {
      this.onChange?.(text);
    };
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.editor.focused = value;
  }

  set disableSubmit(value: boolean) {
    this.editor.disableSubmit = value;
  }

  setText(text: string): void {
    this.editor.setText(text);
  }

  getText(): string {
    return this.editor.getText();
  }

  insertTextAtCursor(text: string): void {
    this.editor.insertTextAtCursor(text);
  }

  invalidate(): void {
    this.editor.invalidate();
    this.previewText.invalidate();
  }

  render(width: number): string[] {
    const availableWidth = Math.max(0, Math.floor(width));
    const indentWidth = Math.min(this.indentX, availableWidth);
    const innerWidth = availableWidth - indentWidth;
    const indent = " ".repeat(indentWidth);
    const withIndent = (lines: string[]) =>
      lines.map((line) => truncateToWidth(`${indent}${line}`, availableWidth));

    if (innerWidth <= this.paddingX * 2 + 1) {
      const blank = " ".repeat(availableWidth);
      return [blank, blank];
    }

    if (!this.focused) {
      this.previewText.setText(this.editor.getText());
      const contentLines = this.previewText.render(innerWidth);
      const lines = contentLines.length > 0 ? contentLines : [" ".repeat(innerWidth)];
      const borderLine = this.blurredBorderColor("─".repeat(innerWidth));
      return withIndent([...lines, borderLine]);
    }

    const lines = this.editor.render(innerWidth);
    const visibleLines = !this.stripTopBorder || lines.length <= 1 ? lines : lines.slice(1);
    return withIndent(visibleLines);
  }

  handleInput(data: string): void {
    if (!this.focused) return;
    this.editor.handleInput(data);
  }
}
