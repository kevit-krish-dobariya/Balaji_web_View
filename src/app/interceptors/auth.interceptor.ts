import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    if (!req.url.startsWith(environment.apiUrl)) {
      return next.handle(req);
    }
    const token = req.url.includes('/custom/utility/decrypt-payload')
      ? environment.decryptApiToken
      : environment.apiToken;
    const authReq = req.clone({
      setHeaders: { Authorization: token },
    });
    return next.handle(authReq);
  }
}
