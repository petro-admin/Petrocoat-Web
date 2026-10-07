import { Component, forwardRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

// Native <input type="date"> renders its displayed text in the browser/OS locale (MM/DD/YYYY on a
// US-locale machine, DD/MM/YYYY elsewhere) - that can't be overridden with CSS or the date pipe.
// This always displays and accepts DD-MM-YYYY regardless of locale, while still emitting/accepting
// the same yyyy-MM-dd ISO string every date field in this app already uses (formControlName and
// [(ngModel)] both work via ControlValueAccessor). A native date input is kept, fully transparent,
// stacked on top of the visible text box purely so its calendar popup is still available - picking
// a date there updates the DD-MM-YYYY text the same as typing does.
@Component({
  selector: 'app-date-input',
  standalone: true,
  imports: [CommonModule],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => DateInputComponent),
    multi: true
  }],
  template: `
    <div class="date-input-wrap">
      <input
        type="text"
        class="date-text"
        placeholder="dd-mm-yyyy"
        maxlength="10"
        [value]="displayValue()"
        [disabled]="disabled()"
        (input)="onTextInput($any($event.target).value)"
        (blur)="onBlur()" />
      <input
        type="date"
        class="date-native"
        tabindex="-1"
        [value]="isoValue()"
        [disabled]="disabled()"
        (change)="onNativePick($any($event.target).value)" />
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .date-input-wrap { position: relative; width: 100%; }
    .date-text {
      width: 100%;
      box-sizing: border-box;
      padding: 9px 30px 9px 10px;
      border: 1px solid var(--border-strong, #d0d5dd);
      border-radius: var(--radius-sm, 6px);
      font-size: 13px;
      font-family: inherit;
      color: var(--ink, #263b3b);
      background: var(--surface, #fff);

      &:focus {
        outline: none;
        border-color: var(--accent, #bf5b3f);
        box-shadow: 0 0 0 2px var(--accent-light, rgba(191, 91, 63, .15));
      }

      &:disabled { color: var(--ink-muted, #98a2b3); background: var(--surface-sunken, #f4f5f7); cursor: not-allowed; }
    }
    /* The native date input's own text (which would render in the browser's locale, e.g.
       MM/DD/YYYY) is made invisible via color:transparent - opacity:0 would also hide its
       calendar-icon indicator, which is the one part of it we actually want visible so there's
       a clickable affordance, same as every native date input normally shows. */
    .date-native {
      position: absolute; inset: 0; left: auto; width: 26px;
      cursor: pointer; padding: 0; border: 0; background: transparent; color: transparent;

      &::-webkit-calendar-picker-indicator { opacity: 1; cursor: pointer; }
    }

    /* Same reasoning as FilterSelectComponent's own @media print block - a parent page's print
       CSS can't reach into this component's encapsulated template, so the clean-text treatment
       has to live here once instead of being redone per page. */
    @media print {
      .date-text { border: none; background: transparent; padding: 2px 0; }
      .date-native { display: none; }
    }
  `]
})
export class DateInputComponent implements ControlValueAccessor {
  isoValue = signal('');        // yyyy-MM-dd, the canonical value the rest of the app works with
  displayValue = signal('');    // dd-MM-yyyy, what the text box shows/accepts
  disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    const iso = this.extractIso(value ?? '');
    this.isoValue.set(iso);
    this.displayValue.set(this.isoToDisplay(iso));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  onTextInput(raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    this.displayValue.set(formatted);

    if (digits.length === 8) {
      const iso = this.displayToIso(formatted);
      if (iso) {
        this.isoValue.set(iso);
        this.onChange(iso);
      }
    }
  }

  onBlur(): void {
    this.onTouched();
    // Revert to the last valid value if what's left in the box isn't a complete, valid date -
    // otherwise a half-typed value would silently disagree with the still-unchanged form value.
    const iso = this.displayToIso(this.displayValue());
    if (!iso) this.displayValue.set(this.isoToDisplay(this.isoValue()));
  }

  onNativePick(value: string): void {
    const iso = this.extractIso(value);
    this.isoValue.set(iso);
    this.displayValue.set(this.isoToDisplay(iso));
    this.onChange(iso);
    this.onTouched();
  }

  private extractIso(value: string): string {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? '');
    return match ? match[1] : '';
  }

  private isoToDisplay(iso: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
    return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
  }

  private displayToIso(display: string): string {
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(display ?? '');
    if (!match) return '';
    const [, dd, mm, yyyy] = match;
    const day = Number(dd), month = Number(mm);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${yyyy}-${mm}-${dd}`;
  }
}
