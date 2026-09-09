import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  message: string;
  mode: 'confirm' | 'alert';
  resolve: (value: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  request = signal<ConfirmRequest | null>(null);

  confirm(message: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.request.set({ message, mode: 'confirm', resolve });
    });
  }

  notify(message: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.request.set({ message, mode: 'alert', resolve: () => resolve() });
    });
  }

  respond(value: boolean): void {
    this.request()?.resolve(value);
    this.request.set(null);
  }
}
