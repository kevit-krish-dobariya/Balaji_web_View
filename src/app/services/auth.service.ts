import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type AuthState = 'pending' | 'authorized' | 'unauthorized';

interface DecryptedPayload {
  dealerId: string;
  contactNumber: string;
  retailerId: string;
  retailerName: string;
  dealerName: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _authState = new BehaviorSubject<AuthState>('pending');
  readonly authState$ = this._authState.asObservable();

  contactNumber: string | null = null;

  constructor(private readonly http: HttpClient) {}

  decryptUrlParams(): Observable<void> {
    const rawToken = new URLSearchParams(window.location.search).get(
      'aK7mQ2xP',
    );
    const token = rawToken ? rawToken.replace(/ /g, '+') : rawToken;
    if (!token) {
      return of(undefined);
    }

    return this.http
      .post<{
        dealerId: string;
        contactNumber: string;
        retailerId: string;
        name: string;
        distributorName: string;
      }>(
        `${environment.apiUrl}/custom/utility/decrypt-payload`,
        { encryptedPayload: token },
      )
      .pipe(
        map(
          (response): DecryptedPayload => ({
            dealerId: response.dealerId,
            contactNumber: response.contactNumber,
            retailerId: response.retailerId,
            retailerName: response.name,
            dealerName: response.distributorName,
          }),
        ),
        tap((payload) => {
          sessionStorage.setItem('dealerId', payload.dealerId);
          sessionStorage.setItem('contactNumber', payload.contactNumber);
          sessionStorage.setItem('retailerId', payload.retailerId);
          sessionStorage.setItem('retailerName', payload.retailerName);
          sessionStorage.setItem('dealerName', payload.dealerName);
        }),
        map(() => undefined),
        catchError((err) => {
          console.error('decrypt call failed', err);
          return of(undefined);
        }),
      );
  }

  verify(): void {
    if (!/\bWA(4A|iOS)\//i.test(navigator.userAgent)) {
      this._authState.next('unauthorized');
      return;
    }

    const contactNumber = sessionStorage.getItem('contactNumber');
    this.contactNumber = contactNumber;
    this._authState.next(contactNumber ? 'authorized' : 'unauthorized');
  }

  clearContactNumber(): void {
    sessionStorage.removeItem('contactNumber');
    this.contactNumber = null;
  }
}
