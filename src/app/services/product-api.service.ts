import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Product } from '../products.data';
import { environment } from '../../environments/environment';

export interface ProductsResponse {
  totalCount: number;
  success: boolean;
  products: Product[];
}

export interface OrderUnit {
  unitType: 'Packet' | 'Patti' | 'Box Bunch';
  quantity: number;
}

export interface OrderProduct {
  productCode: string;
  productName: string;
  units: OrderUnit[];
}

export interface CreateOrderPayload {
  retailerId: string;
  dealerId: string;
  products: OrderProduct[];
  source: string;
}

export interface SubmitOrderResponse {
  status: string;
  order_Name: string;
  order_ID: string;
}

export interface OrderAcknowledgementItem {
  item_name: string;
  box_qty: number;
  patti_qty: number;
  pkt_qty: number;
  amount_inr: number;
}

export interface OrderAcknowledgementPayload {
  name: string;
  distributorName: string;
  orderNumber: string;
  orderDate: string;
  contactNumber: string;
  total_amount_inr: number;
  items: OrderAcknowledgementItem[];
}

@Injectable({ providedIn: 'root' })
export class ProductApiService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  fetchProducts(dealerId: string): Observable<ProductsResponse> {
    return this.http.post<ProductsResponse>(
      `${this.baseUrl}/custom/balaji/products`,
      { dealerId },
    );
  }

  submitOrder(payload: CreateOrderPayload): Observable<SubmitOrderResponse> {
    return this.http.post<SubmitOrderResponse>(
      `${this.baseUrl}/custom/balaji/order`,
      payload,
    );
  }

  generateOrderAcknowledgement(
    payload: OrderAcknowledgementPayload,
  ): Observable<unknown> {
    return this.http.post<unknown>(
      `${this.baseUrl}/custom/balaji/pdf/acknowledgement`,
      payload,
    );
  }
}
