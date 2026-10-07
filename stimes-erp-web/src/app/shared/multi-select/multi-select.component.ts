import { Component, ElementRef, Input, OnChanges, SimpleChanges, forwardRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Type-to-filter multi-select dropdown, sibling of FilterSelectComponent but for picking several
// values at once (e.g. multiple drivers/vehicles in a report filter) - a native <select multiple>
// needs ctrl/cmd-click, which isn't discoverable, and can't be filtered by typing.
@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [CommonModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MultiSelectComponent),
    multi: true
  }],
  template: `
    <div class="multi-select" [class.disabled]="disabled()">
      <input
        type="text"
        [value]="isOpen() ? searchText() : displayText()"
        [disabled]="disabled()"
        [placeholder]="placeholder"
        (focus)="onFocus($event)"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()" />
      @if (selectedValues().length > 0) {
        <button type="button" class="clear-btn" tabindex="-1" (mousedown)="$event.preventDefault(); clearAll()">✕</button>
      }
      @if (isOpen()) {
        <ul class="options" [style.top.px]="dropdownTop()" [style.left.px]="dropdownLeft()" [style.min-width.px]="dropdownWidth()">
          @if (filteredOptions().length > 1) {
            <li class="option select-all" [class.active]="allFilteredSelected()"
                (mousedown)="$event.preventDefault(); toggleSelectAllFiltered()">
              <input type="checkbox" [checked]="allFilteredSelected()" tabindex="-1" />
              <span>{{ allFilteredSelected() ? 'Clear' : 'Select all' }}{{ searchText().trim() ? ' (' + filteredOptions().length + ' filtered)' : '' }}</span>
            </li>
          }
          @for (opt of filteredOptions(); track valueOf(opt)) {
            <li class="option" [class.active]="isSelected(opt)"
                (mousedown)="$event.preventDefault(); toggleOption(opt)">
              <input type="checkbox" [checked]="isSelected(opt)" tabindex="-1" />
              <span>{{ labelOf(opt) }}</span>
            </li>
          }
          @if (filteredOptions().length === 0) {
            <li class="option empty">No matches</li>
          }
        </ul>
      }
    </div>
  `,
  styleUrl: './multi-select.component.scss'
})
export class MultiSelectComponent implements ControlValueAccessor, OnChanges {
  @Input() options: any[] = [];
  // Mirrors the @Input above into a signal - a plain class property isn't a tracked dependency,
  // so filteredOptions() (an Angular computed()) would otherwise keep returning its memoized value
  // forever once options changes, only recomputing whenever searchText happens to change too.
  private optionsSignal = signal<any[]>([]);
  @Input() valueKey = 'value';
  @Input() labelKey = 'label';
  @Input() placeholder = '-Select-';

  searchText = signal('');
  isOpen = signal(false);
  disabled = signal(false);
  selectedValues = signal<any[]>([]);

  // Cards/tables throughout this app clip their contents with overflow:hidden/auto (needed for
  // rounded corners and horizontal scroll) - an absolutely-positioned dropdown stays trapped inside
  // that clipping box no matter its z-index. Fixed positioning escapes it (its containing block is
  // the viewport, since none of those ancestors set transform/filter/will-change), but fixed doesn't
  // auto-align to the input like absolute does, so the coordinates are computed here instead.
  dropdownTop = signal(0);
  dropdownLeft = signal(0);
  dropdownWidth = signal(0);

  private onChange: (value: any[]) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private elRef: ElementRef<HTMLElement>) {}

  private positionDropdown(): void {
    const input = this.elRef.nativeElement.querySelector('input');
    if (!input) return;
    const rect = input.getBoundingClientRect();
    this.dropdownTop.set(rect.bottom + 4);
    this.dropdownLeft.set(rect.left);
    this.dropdownWidth.set(rect.width);
  }

  // options often arrives asynchronously (a lookup call still in flight) after writeValue() has
  // already run - nothing to re-resolve here (unlike the single-select's text label), the checked
  // state just re-evaluates itself against whatever options land.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) this.optionsSignal.set(this.options);
  }

  filteredOptions = computed(() => {
    const options = this.optionsSignal();
    const term = this.searchText().trim().toLowerCase();
    if (!term) return options;
    return options.filter(opt => String(this.labelOf(opt)).toLowerCase().includes(term));
  });

  displayText(): string {
    const values = this.selectedValues();
    if (values.length === 0) return '';
    if (values.length === 1) {
      const match = this.options.find(opt => String(this.valueOf(opt)) === String(values[0]));
      return match ? String(this.labelOf(match)) : '1 selected';
    }
    return `${values.length} selected`;
  }

  valueOf(opt: any): any {
    return opt?.[this.valueKey];
  }

  labelOf(opt: any): any {
    return opt?.[this.labelKey];
  }

  isSelected(opt: any): boolean {
    const v = String(this.valueOf(opt));
    return this.selectedValues().some(sv => String(sv) === v);
  }

  // "Select all" always applies to the currently-filtered list, not every option - so typing to
  // narrow the list down first (e.g. a branch name) then selecting all of just that filtered set
  // is the whole point, matching how the checkbox list above it is also filter-scoped.
  allFilteredSelected(): boolean {
    const filtered = this.filteredOptions();
    return filtered.length > 0 && filtered.every(opt => this.isSelected(opt));
  }

  toggleSelectAllFiltered(): void {
    const filtered = this.filteredOptions();
    const filteredKeys = new Set(filtered.map(opt => String(this.valueOf(opt))));
    const current = this.selectedValues();

    const next = this.allFilteredSelected()
      ? current.filter(sv => !filteredKeys.has(String(sv)))
      : [...current.filter(sv => !filteredKeys.has(String(sv))), ...filtered.map(opt => this.valueOf(opt))];

    this.selectedValues.set(next);
    this.onChange(next);
    this.onTouched();
  }

  onFocus(event: FocusEvent): void {
    this.isOpen.set(true);
    this.searchText.set('');
    this.positionDropdown();
    (event.target as HTMLInputElement).select();
  }

  onInput(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
    this.isOpen.set(true);
    this.positionDropdown();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const first = this.filteredOptions()[0];
      if (first) this.toggleOption(first);
    }
  }

  toggleOption(opt: any): void {
    const v = this.valueOf(opt);
    const key = String(v);
    const current = this.selectedValues();
    const next = current.some(sv => String(sv) === key)
      ? current.filter(sv => String(sv) !== key)
      : [...current, v];
    this.selectedValues.set(next);
    this.onChange(next);
    this.onTouched();
  }

  clearAll(): void {
    this.selectedValues.set([]);
    this.searchText.set('');
    this.onChange([]);
    this.onTouched();
  }

  onBlur(): void {
    // Delay so a mousedown on an option (which preventDefault()s to avoid stealing focus first)
    // still registers as a click before the list closes.
    setTimeout(() => {
      this.isOpen.set(false);
      this.searchText.set('');
      this.onTouched();
    }, 150);
  }

  writeValue(value: any[] | null): void {
    this.selectedValues.set(value ?? []);
  }

  registerOnChange(fn: (value: any[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
