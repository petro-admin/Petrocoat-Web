import { Injectable, computed, effect, signal } from '@angular/core';
import { AuthService } from './auth.service';

export type AppTheme = 'light' | 'dark' | 'system';
export type AccentKey =
  | 'navy' | 'blue' | 'sky' | 'indigo' | 'emerald' | 'teal' | 'lime' | 'violet' | 'fuchsia'
  | 'pink' | 'rose' | 'red' | 'orange' | 'amber' | 'brown' | 'graphite' | 'slate' | 'custom';
export type SidebarMode = 'match' | 'dark' | 'accent';
export type Corners = 'sharp' | 'default' | 'rounded';
export type TextSize = 'compact' | 'default' | 'large';

export interface AccentSwatch {
  key: AccentKey;
  label: string;
  color: string;
  dark: string;
  light: string;
}

// 'orange' matches the app's original hardcoded brand color (#bf5b3f) - the default, so a user
// who never touches this picker sees exactly the same shell they always have.
const ACCENTS: AccentSwatch[] = [
  { key: 'navy', label: 'Navy', color: '#1e3a5f', dark: '#152943', light: '#e8edf3' },
  { key: 'blue', label: 'Blue', color: '#2563eb', dark: '#1d4ed8', light: '#e8effe' },
  { key: 'sky', label: 'Sky', color: '#0284c7', dark: '#0369a1', light: '#dff3fc' },
  { key: 'indigo', label: 'Indigo', color: '#4f46e5', dark: '#4338ca', light: '#e8e7fd' },
  { key: 'emerald', label: 'Emerald', color: '#059669', dark: '#047857', light: '#e3f5ee' },
  { key: 'teal', label: 'Teal', color: '#0d9488', dark: '#0f766e', light: '#e1f5f3' },
  { key: 'lime', label: 'Lime', color: '#65a30d', dark: '#4d7c0f', light: '#ecf7de' },
  { key: 'violet', label: 'Violet', color: '#7c3aed', dark: '#6d28d9', light: '#f0e9fd' },
  { key: 'fuchsia', label: 'Fuchsia', color: '#c026d3', dark: '#a21caf', light: '#f8e2fb' },
  { key: 'pink', label: 'Pink', color: '#db2777', dark: '#be185d', light: '#fce7f3' },
  { key: 'rose', label: 'Rose', color: '#be123c', dark: '#9f1239', light: '#fbe6ea' },
  { key: 'red', label: 'Red', color: '#dc2626', dark: '#b91c1c', light: '#fde8e8' },
  { key: 'orange', label: 'Orange', color: '#bf5b3f', dark: '#a84d34', light: '#fdece5' },
  { key: 'amber', label: 'Amber', color: '#d97706', dark: '#b45309', light: '#fdf0e0' },
  { key: 'brown', label: 'Brown', color: '#92400e', dark: '#78350f', light: '#f5e6d8' },
  { key: 'graphite', label: 'Graphite', color: '#374151', dark: '#1f2937', light: '#eceef0' },
  { key: 'slate', label: 'Slate', color: '#475569', dark: '#334155', light: '#e9edf2' }
];

// Derives a dark shade (mixed toward black) and a pale tint (mixed toward white) from any hex
// color the user picks in the native color input - the preset swatches above ship pre-picked
// dark/light pairs by hand, but a freely-chosen custom color needs its pair computed on the fly.
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mixHex(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r + (target[0] - r) * amount)}${toHex(g + (target[1] - g) * amount)}${toHex(b + (target[2] - b) * amount)}`;
}

function deriveAccentShades(hex: string): { color: string; dark: string; light: string } {
  return { color: hex, dark: mixHex(hex, [0, 0, 0], 0.22), light: mixHex(hex, [255, 255, 255], 0.86) };
}

const CORNER_PRESETS: Record<Corners, { sm: string; md: string; lg: string }> = {
  sharp: { sm: '2px', md: '4px', lg: '6px' },
  default: { sm: '6px', md: '10px', lg: '12px' },
  rounded: { sm: '10px', md: '16px', lg: '20px' }
};

// A single non-standard `zoom` on <html> (see styles.scss) scales every screen's text AND spacing
// together, since the app's stylesheets are written in px, not rem - rewriting every component to
// rem just to make a root font-size change cascade wasn't practical for what is a cosmetic setting.
const TEXT_ZOOM: Record<TextSize, string> = { compact: '0.9', default: '1', large: '1.125' };

interface StoredAppearance {
  theme: AppTheme;
  accent: AccentKey;
  customColor: string;
  sidebarMode: SidebarMode;
  corners: Corners;
  textSize: TextSize;
}

const DEFAULTS: StoredAppearance = { theme: 'light', accent: 'orange', customColor: '#bf5b3f', sidebarMode: 'dark', corners: 'default', textSize: 'default' };

// One project-wide appearance setting (like a browser's own appearance settings page) that
// restyles the whole app at once - see styles.scss's `:root` / `:root[data-theme="dark"]` tokens,
// which every component's own SCSS inherits instead of hardcoding its own values. Each module's
// own brand accent (Payroll, Accounts, Fleet, ...) stays untouched by the accent picker below -
// only the shared shell/app-chrome tokens respond to it, by design.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  // Scoped per logged-in user (not one shared key) - this is a shared/kiosk-style ERP terminal,
  // so the Dark theme one person picked shouldn't greet the next person who logs in on the same
  // PC. Each user gets their own saved appearance; signing in as someone else loads theirs
  // instead, the same way the rest of the app's per-user settings already work.
  private readonly storagePrefix = 'stimes-erp-appearance';
  private lastUserCode: number | null;

  readonly accentPalette = ACCENTS;

  theme = signal<AppTheme>(DEFAULTS.theme);
  accent = signal<AccentKey>(DEFAULTS.accent);
  // The color behind accent 'custom' - kept even while a preset accent is selected, so reopening
  // the native color input shows the last color you picked rather than resetting.
  customColor = signal<string>(DEFAULTS.customColor);
  sidebarMode = signal<SidebarMode>(DEFAULTS.sidebarMode);
  corners = signal<Corners>(DEFAULTS.corners);
  textSize = signal<TextSize>(DEFAULTS.textSize);

  private systemPrefersDark = signal(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);

  // What's actually painted - 'system' resolves live against the OS/browser preference instead of
  // being baked in once, so flipping the OS theme updates the app immediately if that's selected.
  resolvedTheme = computed<'light' | 'dark'>(() =>
    this.theme() === 'system' ? (this.systemPrefersDark() ? 'dark' : 'light') : this.theme() as 'light' | 'dark');

  constructor(private auth: AuthService) {
    this.lastUserCode = this.currentUserCode();
    this.readStored(this.lastUserCode);

    window.matchMedia?.('(prefers-color-scheme: dark)')
      .addEventListener('change', event => this.systemPrefersDark.set(event.matches));

    // Logging out and a different user logging back in doesn't reload the page (see
    // AuthService.login/logout), so without this the new user would keep seeing whoever was
    // logged in before them until a manual refresh. Only reacts when the user actually changes -
    // the constructor call above already handled the initial load.
    effect(() => {
      const userCode = this.currentUserCode();
      if (userCode !== this.lastUserCode) {
        this.lastUserCode = userCode;
        this.readStored(userCode);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      document.documentElement.setAttribute('data-theme', this.resolvedTheme());
      this.applyAccent();
      this.applySidebarMode();
      this.applyCorners();
      this.applyTextSize();
      this.persist();
    });
  }

  private currentUserCode(): number | null {
    return this.auth.currentUser()?.userCode ?? null;
  }

  private storageKeyFor(userCode: number | null): string {
    return userCode ? `${this.storagePrefix}-user-${userCode}` : `${this.storagePrefix}-guest`;
  }

  setTheme(theme: AppTheme): void { this.theme.set(theme); }
  setAccent(accent: AccentKey): void { this.accent.set(accent); }
  // Picking any color from the native color input both stores it and switches accent to 'custom'
  // in one call, so the picker's own onchange only needs to call this - not two separate setters.
  setCustomColor(hex: string): void { this.customColor.set(hex); this.accent.set('custom'); }
  setSidebarMode(mode: SidebarMode): void { this.sidebarMode.set(mode); }
  setCorners(corners: Corners): void { this.corners.set(corners); }
  setTextSize(size: TextSize): void { this.textSize.set(size); }

  resetToDefault(): void {
    this.theme.set(DEFAULTS.theme);
    this.accent.set(DEFAULTS.accent);
    this.customColor.set(DEFAULTS.customColor);
    this.sidebarMode.set(DEFAULTS.sidebarMode);
    this.corners.set(DEFAULTS.corners);
    this.textSize.set(DEFAULTS.textSize);
  }

  private findAccent(key: AccentKey): AccentSwatch {
    if (key === 'custom') return { key: 'custom', label: 'Custom', ...deriveAccentShades(this.customColor()) };
    return ACCENTS.find(a => a.key === key) ?? ACCENTS.find(a => a.key === 'orange')!;
  }

  private applyAccent(): void {
    const a = this.findAccent(this.accent());
    const root = document.documentElement.style;
    root.setProperty('--shell-accent', a.color);
    root.setProperty('--shell-accent-dark', a.dark);
    root.setProperty('--shell-accent-light', a.light);
    root.setProperty('--shell-hover-tint-accent', a.light);
    // Every module's own :host used to hardcode its own --accent/--accent-dark/--accent-light
    // brand color; those were removed the same way the neutral tokens were, so setting the
    // generic tokens here recolors every form's buttons/highlights app-wide, not just the shell.
    root.setProperty('--accent', a.color);
    root.setProperty('--accent-dark', a.dark);
    root.setProperty('--accent-light', a.light);
  }

  private applySidebarMode(): void {
    const root = document.documentElement.style;
    const mode = this.sidebarMode();

    if (mode === 'match') {
      root.setProperty('--shell-sidebar-bg', 'var(--shell-panel-bg)');
      root.setProperty('--shell-sidebar-ink', 'var(--shell-ink)');
      root.setProperty('--shell-sidebar-hover-bg', 'var(--shell-hover-tint)');
      root.setProperty('--shell-sidebar-ink-muted', 'var(--shell-ink-faint)');
    } else if (mode === 'accent') {
      const a = this.findAccent(this.accent());
      root.setProperty('--shell-sidebar-bg', a.dark);
      root.setProperty('--shell-sidebar-ink', '#ffffff');
      root.setProperty('--shell-sidebar-hover-bg', a.color);
      root.setProperty('--shell-sidebar-ink-muted', 'rgba(255,255,255,.65)');
    } else {
      // 'dark' - the original always-dark rail; let the CSS-defined --shell-sidebar-* tokens
      // stand instead of overriding them.
      root.removeProperty('--shell-sidebar-bg');
      root.removeProperty('--shell-sidebar-ink');
      root.removeProperty('--shell-sidebar-hover-bg');
      root.removeProperty('--shell-sidebar-ink-muted');
    }
  }

  private applyCorners(): void {
    const preset = CORNER_PRESETS[this.corners()];
    const root = document.documentElement.style;
    root.setProperty('--radius-sm', preset.sm);
    root.setProperty('--radius-md', preset.md);
    root.setProperty('--radius-lg', preset.lg);
  }

  private applyTextSize(): void {
    document.documentElement.style.setProperty('--app-zoom', TEXT_ZOOM[this.textSize()]);
  }

  private persist(): void {
    try {
      const value: StoredAppearance = {
        theme: this.theme(), accent: this.accent(), customColor: this.customColor(),
        sidebarMode: this.sidebarMode(), corners: this.corners(), textSize: this.textSize()
      };
      localStorage.setItem(this.storageKeyFor(this.currentUserCode()), JSON.stringify(value));
    } catch { /* private browsing, etc. */ }
  }

  private readStored(userCode: number | null): void {
    try {
      const raw = localStorage.getItem(this.storageKeyFor(userCode));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredAppearance>;
        this.theme.set(parsed.theme ?? DEFAULTS.theme);
        this.accent.set(parsed.accent ?? DEFAULTS.accent);
        this.customColor.set(parsed.customColor ?? DEFAULTS.customColor);
        this.sidebarMode.set(parsed.sidebarMode ?? DEFAULTS.sidebarMode);
        this.corners.set(parsed.corners ?? DEFAULTS.corners);
        this.textSize.set(parsed.textSize ?? DEFAULTS.textSize);
        return;
      }
    } catch { /* ignore */ }
    // No saved appearance for this user yet - reset to the app's defaults rather than leaving
    // whichever previous user's values were sitting in the signals (this is also what makes a
    // brand-new user see the plain default look instead of inheriting the last person's pick).
    this.theme.set(DEFAULTS.theme);
    this.accent.set(DEFAULTS.accent);
    this.customColor.set(DEFAULTS.customColor);
    this.sidebarMode.set(DEFAULTS.sidebarMode);
    this.corners.set(DEFAULTS.corners);
    this.textSize.set(DEFAULTS.textSize);
  }
}
