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
          this.visibilityObserver?.disconnect();
          // On first load, every above-the-fold card's video is "in view"
          // at essentially the same moment, so without this they'd all
          // start fetching simultaneously and split the same limited
          // mobile-data pipe between them. Staggering lets the first one
          // start immediately and the rest follow shortly after, instead
          // of all of them loading slower together.
          ProductCardComponent.scheduleActivation(() => {
            this.videoInView = true;
            this.cdr.markForCheck();
            // Wait a tick for *ngIf to actually create the <video> element.
            setTimeout(() => this.playInitialPreview(), 0);
          });
        }
      },
      // Kept tight so far-off cards don't all start fetching their videos
      // at once and starve the ones actually about to be seen.
      { rootMargin: '120px 0px' },
    );
    this.visibilityObserver.observe(this.elementRef.nativeElement);
  }

  // Shared across every card: runs the first queued activation right away
  // and staggers any others queued around the same time, so a burst of
  // simultaneously-visible cards (e.g. on initial page load) doesn't have
  // them all start fetching their video at once.
  private static readonly ACTIVATION_STAGGER_MS = 180;
  private static pendingActivations: Array<() => void> = [];
  private static activationTimer: ReturnType<typeof setTimeout> | null = null;

  private static scheduleActivation(run: () => void): void {
    ProductCardComponent.pendingActivations.push(run);
    if (ProductCardComponent.activationTimer !== null) {
      return; // a drain loop is already running
    }
    const drain = () => {
      const next = ProductCardComponent.pendingActivations.shift();
      next?.();
      ProductCardComponent.activationTimer =
        ProductCardComponent.pendingActivations.length > 0
          ? setTimeout(drain, ProductCardComponent.ACTIVATION_STAGGER_MS)
          : null;
    };
    drain();
  }

  ngOnDestroy(): void {
    this.visibilityObserver?.disconnect();
    const video = this.videoRef?.nativeElement;
    if (video) {
      ProductCardComponent.pendingAutoplay.delete(video);
    }
  }

  private playInitialPreview(): void {
    const video = this.videoRef?.nativeElement;
    // No poster to fall back on, so play the complete clip once to show
    // real decoded motion instead of a blank/frozen box — skip if the
    // user already focused an input before this fires. It naturally stops
    // on the last frame at the end (no looping).
    if (!video || this.cardFocused) {
      return;
    }
    video.currentTime = 0.01;
    this.forcePlayMuted(video);
  }

  // Interacting with the image directly (not just a quantity field) also
  // replays the complete clip from the start — (click) covers mobile
  // webview taps, (mouseenter) covers hovering on a PC browser, where a
  // tap never happens at all.
  onImageInteraction(): void {
    const video = this.videoRef?.nativeElement;
    if (!video) {
      return;
    }
    this.playingFromMid = false;
    video.currentTime = 0.01;
    this.forcePlayMuted(video);
  }

  // Chrome's autoplay policy rejects this with NotAllowedError unless the
  // <video> is genuinely muted — setting `muted` as an HTML attribute on a
  // dynamically-created element (as *ngIf does here) doesn't reliably set
  // the underlying `.muted` JS property, which is what the browser's
  // autoplay check actually reads, so it's forced directly here instead.
  //
  // The WhatsApp iOS in-app browser (WKWebView) goes further and rejects
  // every play() — even a muted one — unless it happens inside a genuine
  // touch; a card scrolling into view has no such touch behind it. There's
  // no code-side way around that, so a rejected play() is queued and
  // retried by ensureAutoplayUnlockListener() on the next real touch/click
  // anywhere on the page.
  private forcePlayMuted(video: HTMLVideoElement): void {
    video.muted = true;
    video
      .play()
      .then(() => {
        ProductCardComponent.pendingAutoplay.delete(video);
      })
      .catch(() => {
        ProductCardComponent.ensureAutoplayUnlockListener();
        ProductCardComponent.pendingAutoplay.set(video, () =>
          this.forcePlayMuted(video),
        );
      });
  }

  // Shared across every card: on the next real touch/click anywhere on the
  // page, retries play() for every video still waiting on one. Registered
  // once for the whole app, since the gesture that satisfies the WebView's
  // policy is global, not tied to any particular product card.
  private static autoplayUnlockAttached = false;
  private static pendingAutoplay = new Map<HTMLVideoElement, () => void>();

  private static ensureAutoplayUnlockListener(): void {
    if (ProductCardComponent.autoplayUnlockAttached) {
      return;
    }
    ProductCardComponent.autoplayUnlockAttached = true;
    const retryPending = () => {
      for (const retry of Array.from(
        ProductCardComponent.pendingAutoplay.values(),
      )) {
        retry();
      }
    };
    // touchstart fires at the start of an ordinary scroll drag too, not
    // just on taps, so in practice a retry is never far behind a card
    // scrolling into view.
    document.addEventListener('touchstart', retryPending, { passive: true });
    document.addEventListener('click', retryPending);
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
    const previousSrc = this.orderService.getGroupImage(this.group);
    this.orderService.onInputFocus(product);
    const video = this.videoRef?.nativeElement;
    const firstFocus = !this.cardFocused;
    this.cardFocused = true;
    // Flush the [src] binding synchronously (instead of only scheduling a
    // future check via markForCheck) so video.src is already pointing at
    // the right clip (e.g. the zipper gif) by the time we touch the
    // element below — avoids us also having to set .src imperatively,
    // which was racing with Angular's own binding update and sometimes
    // leaving the explicit load()/play() below acting on the stale src.
    this.cdr.detectChanges();

    if (!video) {
      return;
    }

    const newSrc = this.orderService.getGroupImage(this.group);
    const sourceChanged = !!newSrc && newSrc !== previousSrc;

    if (!firstFocus && !sourceChanged) {
      return;
    }

    this.playingFromMid = false;

    if (sourceChanged) {
      // WebKit (the WhatsApp in-app browser on iOS) doesn't reliably pick
      // up a src swap from just the property assignment — play() can
      // silently keep running the old resource unless load() is called
      // explicitly to force it to pull in the new one.
      video.load();
    }
    video.currentTime = 0;
    this.forcePlayMuted(video);
  }

  onInputBlur(): void {
    this.orderService.onInputBlur();
    setTimeout(() => {
      const stillFocusedInThisGroup =
        this.orderService.focusedProduct &&
        this.group.products.includes(this.orderService.focusedProduct);
      if (stillFocusedInThisGroup) {
        return;
      }
      this.cardFocused = false;
      this.cdr.markForCheck();
      const video = this.videoRef?.nativeElement;
      if (video) {
        this.playingFromMid = true;
        // video.duration can still be NaN here if metadata hasn't loaded
        // yet (e.g. a very quick focus-then-blur) — assigning a
        // non-finite value to currentTime throws, so fall back to the
        // start rather than crashing this handler.
        video.currentTime = Number.isFinite(video.duration)
          ? video.duration / 2
          : 0;
        this.forcePlayMuted(video);
      }
      if (!this.orderService.focusedProduct) {
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
    const timeoutId = setTimeout(cleanup, 600);
    ProductCardComponent.cancelPendingScrollWatch = cleanup;
    check(); // in case the overshoot already happened before we attached this
  }

  private static cancelPendingScrollWatch?: () => void;

  // The clip's first half is the "packet opens" intro, the second half is
  // a settled/zoomed shot shown after a blur. That mid-point pause only
  // applies to the focused state (so typing a quantity holds on the intro
  // frame) — the idle preview plays the complete clip once, straight
  // through to the end, so this intentionally does nothing while idle.
  onVideoTimeUpdate(): void {
    const video = this.videoRef?.nativeElement;
    if (!video || this.playingFromMid || !this.cardFocused) {
      return;
    }
    if (video.currentTime >= video.duration / 2) {
      video.pause();
    }
  }

  onVideoEnded(): void {
    const video = this.videoRef?.nativeElement;
    if (video && this.playingFromMid) {
      // The "settling" second-half (shown after a blur) just finished —
      // reset and rest there; it plays again on the next focus/blur.
      this.playingFromMid = false;
      video.pause();
      video.currentTime = 0;
    }
  }
}
