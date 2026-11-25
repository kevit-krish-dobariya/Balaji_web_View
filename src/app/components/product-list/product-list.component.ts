import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
} from '@angular/core';
import { combineLatest } from 'rxjs';
import { Router } from '@angular/router';
import { OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';
import { ProductGroup } from '../../models/product-group.model';

// How many product cards (and their videos/images) are instantiated up
// front. Rendering the whole catalog at once means every near-viewport
// card's video starts fetching simultaneously, which is what made
// everything feel slow to load — showing a first batch immediately and
// growing it as the user scrolls lets already-loaded products be used
// right away while the rest keeps loading in the background.
const BATCH_SIZE = 12;

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductListComponent {
  readonly vm$ = combineLatest({
    productGroups: this.orderService.productGroups$,
    grandQty: this.orderService.grandQty$,
    loading: this.orderService.loading$,
    error: this.orderService.error$,
  });

  private visibleCount = BATCH_SIZE;
  private lastGroupsRef: ProductGroup[] | null = null;

  constructor(
    public orderService: OrderService,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  showPreview(): void {
    const contactNumber = this.authService.contactNumber;
    this.router.navigate(['/preview'], {
      queryParams: contactNumber ? { contactNumber } : {},
    });
  }

  groupTrackBy(_index: number, group: ProductGroup): string {
    return group.flavorEn;
  }

  // Resets the reveal count whenever the filtered list itself changes
  // (new search/segment/cart-mode selection) so switching filters doesn't
  // leave a stale "load more" position from the previous list.
  visibleGroups(groups: ProductGroup[]): ProductGroup[] {
    if (groups !== this.lastGroupsRef) {
      this.lastGroupsRef = groups;
      this.visibleCount = BATCH_SIZE;
    }
    return groups.slice(0, this.visibleCount);
  }

  get hasMoreGroups(): boolean {
    return !!this.lastGroupsRef && this.visibleCount < this.lastGroupsRef.length;
  }

  loadMore(): void {
    this.visibleCount += BATCH_SIZE;
    this.cdr.markForCheck();
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (!this.hasMoreGroups) {
      return;
    }
    const nearBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 800;
    if (nearBottom) {
      this.loadMore();
    }
  }
}
