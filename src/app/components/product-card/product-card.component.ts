import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { Product } from '../../products.data';
import { ProductGroup } from '../../models/product-group.model';
import { OrderService } from '../../services/order.service';

@Component({
  selector: 'app-product-card',
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent implements AfterViewInit, OnDestroy {
  @Input() group!: ProductGroup;
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;

  protected cardFocused = false;
  protected playingFromMid = false;
  protected videoInView = false;
  private visibilityObserver?: IntersectionObserver;
  private autoPreviewTimer?: ReturnType<typeof setTimeout>;

  constructor(
    public orderService: OrderService,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
  ) {}

  ngAfterViewInit(): void {
    if (!this.group.isVideo) {
      return;
    }
    // Only create the <video> (and let it load) once the card is actually
    // near the viewport — avoids every product in a long list loading at once.
    this.visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.videoInView = true;
          this.cdr.markForCheck();
          this.visibilityObserver?.disconnect();
          // Wait a tick for *ngIf to actually create the <video> element.
          setTimeout(() => this.playInitialPreview(), 0);
        }
      },
      { rootMargin: '300px 0px' },
    );
    this.visibilityObserver.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.visibilityObserver?.disconnect();
    this.clearAutoPreviewTimer();
  }

  private playInitialPreview(): void {
    const video = this.videoRef?.nativeElement;
    // No poster to fall back on, so play ~1s on load to force a real decoded
    // frame to show instead of a blank box — skip if the user already
    // focused an input before this fires.
    if (!video || this.cardFocused) {
      return;
    }
    // The first ~1.5s of these clips is just an intro/transition frame —
    // skip straight to where the actual product packet appears.
    video.currentTime = 0.01;
    video.play().catch(() => {});
    this.autoPreviewTimer = setTimeout(() => {
      if (!this.cardFocused) {
        video.pause();
      }
    }, 1000);
  }

  private clearAutoPreviewTimer(): void {
    if (this.autoPreviewTimer) {
      clearTimeout(this.autoPreviewTimer);
      this.autoPreviewTimer = undefined;
    }
  }

  productTrackBy(_index: number, product: Product): string {
    return product.productId;
  }

  get focusedGroupProduct(): Product | null {
    const fp = this.orderService.focusedProduct;
    return fp && this.group.products.includes(fp) ? fp : null;
  }

  get groupHasNewItem(): boolean {
    return this.group.products.some((p) => p.newItem);
  }

  onInputFocus(product: Product): void {
    this.orderService.onInputFocus(product);
    this.cdr.markForCheck();
    const video = this.videoRef?.nativeElement;
    if (!this.cardFocused) {
      this.cardFocused = true;
      this.clearAutoPreviewTimer();
      if (video) {
        this.playingFromMid = false;
        video.currentTime = 0;
        video.play();
      }
    }
  }

  onInputBlur(): void {
    this.orderService.onInputBlur();
    setTimeout(() => {
      if (
        !this.orderService.focusedProduct ||
        !this.group.products.includes(this.orderService.focusedProduct)
      ) {
        this.cardFocused = false;
        this.cdr.markForCheck();
        const video = this.videoRef?.nativeElement;
        if (video) {
          this.playingFromMid = true;
          video.currentTime = video.duration / 2;
          video.play();
        }
        this.correctScrollOnOvershoot();
      }
    }, 0);
  }

  // The WebView scrolls the page ~100px further down of its own accord
  // sometime during/after the keyboard-close transition, re-hiding this
  // card behind the sticky header. React to the actual 'scroll' event and
  // correct once — only one watcher is ever active app-wide, it unhooks
  // itself the instant it corrects (so it never fights normal scrolling
  // afterward), and the rect check is rAF-throttled to avoid forcing a
  // layout read on every raw scroll tick.
  private correctScrollOnOvershoot(): void {
    ProductCardComponent.cancelPendingScrollWatch?.();

    const header = document.querySelector('.header') as HTMLElement | null;
    const headerHeight = header?.getBoundingClientRect().height ?? 170;
    let rafId: number | null = null;

    const cleanup = () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timeoutId);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (ProductCardComponent.cancelPendingScrollWatch === cleanup) {
        ProductCardComponent.cancelPendingScrollWatch = undefined;
      }
    };

    const check = () => {
      rafId = null;
      if (this.cardFocused) {
        return;
      }
      const rect = this.elementRef.nativeElement.getBoundingClientRect();
      if (rect.top < headerHeight) {
        window.scrollBy(0, rect.top - headerHeight - 8);
        cleanup(); // corrected — stop watching immediately
      }
    };

    const onScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(check);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    check(); // in case the overshoot already happened before we attached this
    const timeoutId = setTimeout(cleanup, 600);
    ProductCardComponent.cancelPendingScrollWatch = cleanup;
  }

  private static cancelPendingScrollWatch?: () => void;

  onVideoEnded(): void {
    const video = this.videoRef?.nativeElement;
    if (video && this.playingFromMid) {
      this.playingFromMid = false;
      video.pause();
      video.currentTime = 0;
    }
  }
}
