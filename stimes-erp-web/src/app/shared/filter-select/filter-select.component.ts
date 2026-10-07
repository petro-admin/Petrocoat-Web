import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, forwardRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Type-to-filter dropdown for reactive forms (formControlName-compatible via ControlValueAccessor).
// A native <select> can't be filtered by typing, and an <input list="..."> + <datalist> doesn't
// reliably fire a change event when a suggestion is picked - this fires selection explicitly on
// click/Enter instead, so it's never missed.
@Component({
  selector: 'app-filter-select',
  standalone: true,
  imports: [CommonModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => FilterSelectComponent),
    multi: true
  }],
  template: `
    <div class="filter-select" [class.disabled]="disabled()">
      <input
        type="text"
        [value]="searchText()"
        [disabled]="disabled()"
        [placeholder]="placeholder"
        (focus)="onFocus($event)"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()" />
      @if (isOpen()) {
        <ul class="options" [style.top.px]="dropdownTop()" [style.left.px]="dropdownLeft()" [style.min-width.px]="dropdownWidth()">
          @if (allowClear) {
            <li class="option clear" (mousedown)="$event.preventDefault(); selectOption(null)">{{ placeholder }}</li>
          }
          @for (opt of filteredOptions(); track valueOf(opt)) {
            <li class="option" [class.active]="valueOf(opt) === currentValue"
                (mousedown)="$event.preventDefault(); selectOption(opt)">
              {{ labelOf(opt) }}
            </li>
          }
          @if (filteredOptions().length === 0) {
            <li class="option empty">No matches</li>
          }
        </ul>
      }
    </div>
  `,
  styleUrl: './filter-select.component.scss'
})
export class FilterSelectComponent implements ControlValueAccessor, OnChanges {
  @Input() options: any[] = [];
  // Mirrors the @Input above into a signal - a plain class property isn't a tracked dependency,
  // so filteredOptions() (an Angular computed()) would otherwise keep returning its memoized value
  // forever once options changes, only recomputing whenever searchText happens to change too.
  private optionsSignal = signal<any[]>([]);
  @Input() valueKey = 'value';
  @Input() labelKey = 'label';
  @Input() placeholder = '-Select-';
  @Input() allowClear = true;
  @Output() valueChange = new EventEmitter<any>();

  searchText = signal('');
  isOpen = signal(false);
  disabled = signal(false);
  currentValue: any = null;

  // Cards/tables throughout this app clip their contents with overflow:hidden/auto (needed for
  // rounded corners and horizontal scroll) - an absolutely-positioned dropdown stays trapped inside
  // that clipping box no matter its z-index. Fixed positioning escapes it (its containing block is
  // the viewport, since none of those ancestors set transform/filter/will-change), but fixed doesn't
  // auto-align to the input like absolute does, so the coordinates are computed here instead.
  dropdownTop = signal(0);
  dropdownLeft = signal(0);
  dropdownWidth = signal(0);

  private onChange: (value: any) => void = () => {};
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
  // already run - re-resolve the display label once the real options land, but only while the
  // user isn't actively typing/browsing the list.
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.optionsSignal.set(this.options);
      if (!this.isOpen()) this.searchText.set(this.labelForValue(this.currentValue));
    }
  }

  filteredOptions = computed(() => {
    const options = this.optionsSignal();
    const term = this.searchText().trim().toLowerCase();
    if (!term) return options;
    return options.filter(opt => String(this.labelOf(opt)).toLowerCase().includes(term));
  });

  valueOf(opt: any): any {
    return opt?.[this.valueKey];
  }

  labelOf(opt: any): any {
    return opt?.[this.labelKey];
  }

  private labelForValue(value: any): string {
    if (value === null || value === undefined || value === '') return '';
    const match = this.options.find(opt => String(this.valueOf(opt)) === String(value));
    return match ? String(this.labelOf(match)) : '';
  }

  onFocus(event: FocusEvent): void {
    this.isOpen.set(true);
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
      // Pressing Enter on an emptied box used to fall through to "select the first option in the
      // list" - indistinguishable from the user wanting to clear it back to blank.
      if (this.allowClear && this.searchText().trim() === '') {
        this.selectOption(null);
        return;
      }
      const first = this.filteredOptions()[0];
      if (first) this.selectOption(first);
    }
  }

  selectOption(opt: any | null): void {
    this.currentValue = opt ? this.valueOf(opt) : null;
    this.searchText.set(opt ? String(this.labelOf(opt)) : '');
    this.isOpen.set(false);
    this.onChange(this.currentValue);
    this.onTouched();
    this.valueChange.emit(this.currentValue);
    this.elRef.nativeElement.querySelector('input')?.blur();
  }

  onBlur(): void {
    // Delay so a mousedown on an option (which preventDefault()s to avoid stealing focus first)
    // still registers as a click before the list closes.
    setTimeout(() => {
      this.isOpen.set(false);
      // Backspacing the text to empty and clicking away used to just snap back to the old
      // selection's label, with no way to actually clear the value short of reopening the list and
      // clicking the explicit clear entry - treat an emptied box as "clear" too.
      if (this.allowClear && this.searchText().trim() === '') {
        this.selectOption(null);
      } else {
        this.searchText.set(this.labelForValue(this.currentValue));
      }
      this.onTouched();
    }, 150);
  }

  writeValue(value: any): void {
    this.currentValue = value;
    this.searchText.set(this.labelForValue(value));
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
