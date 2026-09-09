import { Component } from '@angular/core';
import { ConfirmDialogService } from '../services/confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [],
  template: `
    @if (dialog.request(); as req) {
      <div class="confirm-backdrop" (click)="dialog.respond(false)">
        <div class="confirm-box" (click)="$event.stopPropagation()">
          <p class="confirm-message">{{ req.message }}</p>
          <div class="confirm-actions">
            @if (req.mode === 'confirm') {
              <button type="button" class="confirm-cancel" (click)="dialog.respond(false)">Cancel</button>
            }
            <button type="button" class="confirm-ok" (click)="dialog.respond(true)">OK</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      background: rgba(28, 32, 39, 0.45);
    }
    .confirm-box {
      width: min(380px, 90vw);
      background: #fff;
      border-radius: 10px;
      padding: 22px 22px 16px;
      box-shadow: 0 20px 44px -12px rgba(0, 0, 0, 0.4);
    }
    .confirm-message {
      margin: 0 0 18px;
      color: #1c2027;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-line;
    }
    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .confirm-actions button {
      padding: 8px 18px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 0;
    }
    .confirm-cancel {
      background: #f1f2f4;
      color: #1c2027;
    }
    .confirm-cancel:hover { background: #e5e7eb; }
    .confirm-ok {
      background: #7a1f3d;
      color: #fff;
    }
    .confirm-ok:hover { background: #5e1730; }
  `]
})
export class ConfirmDialogComponent {
  constructor(public dialog: ConfirmDialogService) {}
}
