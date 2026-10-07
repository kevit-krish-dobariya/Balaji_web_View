import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { OrderService } from '../../services/order.service';
import { OrderPreviewRow } from '../../models/product-group.model';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-order-preview',
  templateUrl: './order-preview.component.html',
  styleUrls: ['./order-preview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderPreviewComponent implements OnInit {
  previewRows: OrderPreviewRow[] = [];
  isLoading = true;
  isSubmitting = false;
  showConsentModal = false;
  consentChecked = false;

  previewGrandAmt = 0;
  previewGrandQty = 0;
  previewGrandGst = 0;
  previewGrandGstTotal = 0;
  subTotal = 0;
  grandTotalRounded = 0;

  constructor(
    public orderService: OrderService,
    private readonly router: Router,
    private readonly toastService: ToastService,
    private readonly authService: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Wait for products to finish loading before building preview rows.
    // This prevents a false empty-cart redirect on page reload.
    this.orderService.loading$
      .pipe(
        filter((loading) => !loading),
        take(1),
      )
      .subscribe(() => {
        this.previewRows = this.orderService.buildPreviewRows();
        this.isLoading = false;
        if (this.previewRows.length === 0) {
          this.navigateToOrder();
          return;
        }
        this.previewGrandAmt = this.previewRows.reduce(
          (sum, r) => sum + r.amount,
          0,
        );
        this.previewGrandQty = this.previewRows.reduce(
          (sum, r) => sum + r.boxBunchQty + r.pattiQty + r.packetQty,
          0,
        );
        this.previewGrandGst = this.previewRows.reduce(
          (sum, r) => sum + r.gstAmount,
          0,
        );
        this.previewGrandGstTotal = this.previewRows.reduce(
          (sum, r) => sum + r.amount + r.gstAmount,
          0,
        );
        this.subTotal = this.previewGrandAmt + this.previewGrandGst;
        this.grandTotalRounded = Math.round(this.subTotal);
        this.cdr.markForCheck();
      });
  }

  backToList(): void {
    this.navigateToOrder();
  }

  onSubmit(): void {
    this.consentChecked = false;
    this.showConsentModal = true;
  }

  cancelSubmit(): void {
    this.showConsentModal = false;
    this.consentChecked = false;
  }

  private navigateToOrder(): void {
    const contactNumber = this.authService.contactNumber;
    this.router.navigate(['/order'], {
      queryParams: contactNumber ? { contactNumber } : {},
    });
  }

  confirmSubmit(): void {
    if (!this.consentChecked) return;
    this.showConsentModal = false;
    this.isSubmitting = true;
    this.orderService.submitOrder().subscribe({
      next: () => {
        this.authService.clearContactNumber();
        this.orderService.clearOrder();
        this.router.navigate(['/order']).then(() => {
          window.location.href = `https://wa.me/${environment.whatsappNumber}`;
        });
      },
      error: (err) => {
        console.error('Order submission failed', err);
        this.isSubmitting = false;
        this.toastService.show('Failed to submit order. Please try again.');
      },
    });
  }
}
