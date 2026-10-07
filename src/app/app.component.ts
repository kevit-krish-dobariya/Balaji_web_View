import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { combineLatest } from 'rxjs';
import { ThemeService } from './services/theme.service';
import { ToastService } from './services/toast.service';
import { OrderService } from './services/order.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  readonly vm$ = combineLatest({
    isDarkMode: this.themeService.isDarkMode$,
    toastVisible: this.toastService.visible$,
    toastMessage: this.toastService.message$,
    authState: this.authService.authState$,
  });

  constructor(
    private readonly themeService: ThemeService,
    private readonly toastService: ToastService,
    private readonly orderService: OrderService,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.authService.verify();

    const navEntry = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const isReload = navEntry?.type === 'reload';
    if (!isReload) {
      this.orderService.clearOrder();
    }
  }
}
