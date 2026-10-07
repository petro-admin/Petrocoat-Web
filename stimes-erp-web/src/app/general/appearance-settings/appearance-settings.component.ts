import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, AppTheme, AccentKey, SidebarMode, Corners, TextSize } from '../../core/services/theme.service';

@Component({
  selector: 'app-appearance-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './appearance-settings.component.html',
  styleUrl: './appearance-settings.component.scss'
})
export class AppearanceSettingsComponent {
  themeOptions: { value: AppTheme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' }
  ];

  sidebarOptions: { value: SidebarMode; label: string; description: string }[] = [
    { value: 'match', label: 'Match page', description: 'Follows light / dark mode' },
    { value: 'dark', label: 'Dark', description: 'Always dark' },
    { value: 'accent', label: 'Accent colour', description: 'Filled with your accent' }
  ];

  cornerOptions: { value: Corners; label: string }[] = [
    { value: 'sharp', label: 'Sharp' },
    { value: 'default', label: 'Default' },
    { value: 'rounded', label: 'Rounded' }
  ];

  textSizeOptions: { value: TextSize; label: string }[] = [
    { value: 'compact', label: 'Compact' },
    { value: 'default', label: 'Default' },
    { value: 'large', label: 'Large' }
  ];

  constructor(public theme: ThemeService) {}

  setTheme(value: AppTheme): void { this.theme.setTheme(value); }
  setAccent(value: AccentKey): void { this.theme.setAccent(value); }
  setCustomColor(value: string): void { this.theme.setCustomColor(value); }
  setSidebarMode(value: SidebarMode): void { this.theme.setSidebarMode(value); }
  setCorners(value: Corners): void { this.theme.setCorners(value); }
  setTextSize(value: TextSize): void { this.theme.setTextSize(value); }

  resetToDefault(): void { this.theme.resetToDefault(); }
}
