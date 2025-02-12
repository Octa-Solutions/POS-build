import { Injectable, OnInit } from '@angular/core';
import { StorageService } from '../storage/storage.service';


export type Currency = {
  currency_id: number,
  currency_code: string,
  currency_name: string,
  currency_is_basic: boolean,
  currency_part_name: string,
  currency_precision: number,
  currency_rate: number,
  currency_tva_rate: number
}

@Injectable({
  providedIn: 'root'
})
export class CurrencyService implements OnInit {
  currency_list: Currency[] = [];

  constructor(private storage: StorageService) { }

  convertCurrency(old_price: number, from_currency_id: number, to_currency_id: number) {
    let material_currency = this.currency_list.find(currency => currency.currency_id == from_currency_id);
    let user_currency = this.currency_list.find(currency => currency.currency_id == to_currency_id);
    let converted_price = (old_price * (material_currency?.currency_rate || 1)) / (user_currency?.currency_rate || 1);
    return converted_price;
  }

  async ngOnInit(): Promise<void> {
    this.currency_list = await this.storage.get('currency_list')

  }
}
