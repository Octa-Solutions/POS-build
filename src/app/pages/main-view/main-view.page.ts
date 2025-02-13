import { Component, ElementRef, OnInit, ViewChild, WritableSignal, signal } from '@angular/core';
import { IonMenu, IonSearchbar, ModalController } from '@ionic/angular';
import { BoxesComponent } from 'src/app/components/boxes/boxes.component';
import { CheckoutItem, qntUpdateEvent } from 'src/app/components/checkout-item-list/checkout-item-list.component';
import { Material, MaterialGridComponent } from 'src/app/components/material-grid/material-grid.component';
import { TransactionHistoryComponent } from 'src/app/components/transaction-history/transaction-history.component';
import { ApiService } from 'src/app/services/api/api.service';
import { Currency } from 'src/app/services/currency/currency.service';
import { NotificationService } from 'src/app/services/notification/notification.service';
import { StorageService } from 'src/app/services/storage/storage.service';

type TransactionItem = { material_id: number, material_quantity: number, unit_id: number, unit_price: number, };

type MenuItem = {
  text: string,
  icon: string,
  visible: WritableSignal<boolean>,
  handler: Function,
  is_seperate_page?: boolean
}
type Category = {
  material_category_id: number,
  material_category_name: string
}

type Transaction = {
  transaction_item_list: TransactionItem[],
  account_id: number | string,
}

@Component({
  selector: 'app-main-view',
  templateUrl: './main-view.page.html',
  styleUrls: ['./main-view.page.scss'],
  standalone: false,
})
export class MainViewPage implements OnInit {
  @ViewChild('searchbar') searchbar: IonSearchbar | undefined;
  @ViewChild('MaterialGridComponent') MaterialGridComponent: MaterialGridComponent | undefined;
  @ViewChild('list_header', { read: ElementRef }) list_header: ElementRef | undefined;
  @ViewChild('list_footer', { read: ElementRef }) list_footer: ElementRef | undefined;
  @ViewChild('grid_header', { read: ElementRef }) grid_header: ElementRef | undefined;
  @ViewChild('grid_categs', { read: ElementRef }) grid_categs: ElementRef | undefined;
  @ViewChild('main_menu') main_menu: IonMenu | undefined;
  grid_header_height: number = 0;
  list_header_height: number = 0;
  list_footer_height: number = 0;
  material_grid_content_style: string = ``;
  checkout_list_style: string = ``;
  checkout_item_list: CheckoutItem[] = [];
  transaction_total: WritableSignal<number> = signal(0);
  search_by_barcode: boolean = true;
  search_value: string = '';
  category_list: Category[] = [{
    material_category_id: 0,
    material_category_name: ''
  }];
  active_category_id: WritableSignal<number | undefined> = signal(undefined);
  material_grid_style: string = '';
  is_refund_mode: WritableSignal<boolean> = signal(false);
  is_sales_mode: WritableSignal<boolean> = signal(true);
  opened_menu_page_index: WritableSignal<number> = signal(0);
  menu_item_list: MenuItem[] = [];
  constructor(
    private apiService: ApiService,
    private storage: StorageService,
    private notification: NotificationService,
    private modal: ModalController


  ) { }


  updateItemQuantity(index: number, new_quantity: number) {
    if (!new_quantity) {
      new_quantity = 0;
    }
    // update quantity
    this.checkout_item_list[index].material_quantity = new_quantity;

    // update item total price
    this.checkout_item_list[index].material_total_price = Number((this.checkout_item_list[index].material_quantity! * this.checkout_item_list[index].checkout_unit_price!).toFixed(3));

    // recalculate invoice total
    this.calculateTransactionTotal();
  }
  addNewItem(new_item: CheckoutItem) {
    new_item.material_quantity = 1;

    let item_price = new_item.selected_unit?.default_price;

    let material_currency_id = new_item.material_currency_id;
    let material_currency = this.currency_list.find(currency => currency.currency_id == material_currency_id);

    let user_default_currency = this.user_data.default_currency_id
    let user_currency = this.currency_list.find(currency => currency.currency_id == user_default_currency);

    if (material_currency_id != user_default_currency) {
      item_price = this.currencyService.convertCurrency(item_price, material_currency, user_currency);
    }

    new_item.material_total_price = item_price;
    new_item.checkout_unit_price = item_price
    this.checkout_item_list.push(JSON.parse(JSON.stringify(new_item)));
  }

  async addMaterialToCheckoutList(new_item: CheckoutItem) {
    let material_already_added_index = this.checkout_item_list.findIndex((item, i) => new_item.material_id == item.material_id && new_item.selected_unit?.unit_id == item.selected_unit?.unit_id);

    if (material_already_added_index != -1) {
      this.checkout_item_list[material_already_added_index].material_quantity! += 1;
      this.checkout_item_list[material_already_added_index].material_total_price = Number((this.checkout_item_list[material_already_added_index].material_quantity! * this.checkout_item_list[material_already_added_index].checkout_unit_price!).toFixed(3));
    } else {
      this.addNewItem(new_item);
    }
    this.calculateTransactionTotal();
    this.searchbar?.setFocus();
  }

  removeMaterialFromCheckoutList(index: number) {

    if (this.checkout_item_list[index].material_quantity! > 1) {
      this.checkout_item_list[index].material_quantity! -= 1;
      this.checkout_item_list[index].material_total_price = Number((this.checkout_item_list[index].material_quantity! * this.checkout_item_list[index].checkout_unit_price!).toFixed(3));
    }
    else {
      this.checkout_item_list.splice(index, 1);
    }
    this.calculateTransactionTotal();
  }

  editCheckoutItemQuantity(index: number, new_quantity: number) {
    this.checkout_item_list[index].material_quantity = new_quantity;
    this.checkout_item_list[index].material_total_price = this.checkout_item_list[index]!.checkout_unit_price! * new_quantity;
  }

  deleteItemFromList(index: number) {
    this.checkout_item_list.splice(index, 1);
    this.calculateTransactionTotal();
  }

  async pay() {
    await this.saveTransaction();
    this.printTransaction();
    this.searchbar?.setFocus()
    this.transaction_total.set(0);
    this.checkout_item_list = [];
  }

  async refund() {
    await this.saveRefundTransaction();
    this.printRefundTransaction();
    this.searchbar?.setFocus()
    this.transaction_total.set(0);
    this.checkout_item_list = [];
  }
  async saveTransaction() {

    let saved_transaction_list: Transaction[] = await this.storage.get('transaction_list') || [];
    let boxes: Box[] = await this.storage.get('boxes');
    let default_box_index = boxes.findIndex(box => box.currency_id == this.user_data.default_currency_id);
    let transaction_needed_data = this.checkout_item_list.map(({ material_id, material_quantity, selected_unit, checkout_unit_price }) => {
      if (!boxes[default_box_index]?.balance)
        boxes[default_box_index].balance = 0
      let new_balance = boxes[default_box_index].balance + material_quantity! * checkout_unit_price!;
      boxes[default_box_index].balance = Number(new_balance.toFixed(3));
      return {
        material_id: material_id!,
        material_quantity: material_quantity!,
        unit_id: selected_unit?.unit_id!,
        unit_price: checkout_unit_price!
      }
    });

    saved_transaction_list.push(
      {
        account_id: 0,
        transaction_item_list: transaction_needed_data,
      }
    );

    this.storage.set('transaction_list', saved_transaction_list);

  }

  async saveRefundTransaction() {
    let saved_refund_list: Transaction[] = await this.storage.get('refund_list') || [];
    let boxes: Box[] = await this.storage.get('boxes');
    let default_box_index = boxes.findIndex(box => box.currency_id == this.user_data.default_currency_id);
    let transaction_needed_data = this.checkout_item_list.map(({ material_id, material_quantity, selected_unit, checkout_unit_price }) => {
      if (!boxes[default_box_index]?.balance)
        boxes[default_box_index].balance = 0
      let new_balance = boxes[default_box_index].balance - material_quantity! * checkout_unit_price!;
      boxes[default_box_index].balance = Number(new_balance.toFixed(3));
      return {
        material_id: material_id!,
        material_quantity: material_quantity!,
        unit_id: selected_unit?.unit_id!,
        unit_price: checkout_unit_price!,

      }
    })

    saved_refund_list.push(
      {
        account_id: 0,
        transaction_item_list: transaction_needed_data,
      }
    );

    this.storage.set('refund_list', saved_refund_list);

  }


  printTransaction() {

  }
  printRefundTransaction() {

  }
  calculateTransactionTotal() {

    let total_value = 0;
    this.checkout_item_list.forEach((material) => { total_value = total_value + material.material_total_price! })
    this.transaction_total.set(Number(total_value.toFixed(3)));
  }


  updateMainItemList(edit_action: qntUpdateEvent) {

    switch (edit_action.type) {
      case 'add':
        this.addMaterialToCheckoutList(this.checkout_item_list[edit_action.index]);
        break;
      case 'remove':
        this.removeMaterialFromCheckoutList(edit_action.index);
        break;
      case 'edit':
        this.updateItemQuantity(edit_action.index, edit_action.new_quantity!);
    }
    this.calculateTransactionTotal();
  }

  addItemByBarcode(event: any) {
    let item_added = this.MaterialGridComponent?.addMaterialByBarcode(event.target.value);
    if (item_added)
      event.target.value = '';
    else {
      this.notification.presentToast('Barcode Not Found', 3000, 'bottom', 'danger')
    }
    return;
  }

  searchIfEnter(event: any) {

    if (!this.search_by_barcode)
      return;
    if (event.charCode == 13) {
      this.addItemByBarcode(event)
    }
    return;
  }

  handlePriceUpdate(
    data: {
      index: number;
      new_price: number;
    }
  ) {
    if (!data.new_price)
      data.new_price = 0;
    this.checkout_item_list[data.index].checkout_unit_price = Number(data.new_price.toFixed(3));
    this.checkout_item_list[data.index].material_total_price = Number((this.checkout_item_list[data.index].material_quantity! * data.new_price).toFixed(3));
    this.calculateTransactionTotal();
  }
  //

  // search handling
  toggleSearchMethod() {
    this.search_by_barcode = !this.search_by_barcode;
    if (this.searchbar)
      this.searchbar.value = '';
    this.searchbar?.setFocus();
  }

  searchIfBarcodeDisabled(event: any) {
    if (this.search_by_barcode)
      return;
    this.search_value = event.target.value

    if (!this.search_value) {
      this.filterMaterialByCategory(this.active_category_id())
      return;
    }

    this.MaterialGridComponent!.rendered_material_list.set(this.MaterialGridComponent?.main_material_list.filter((item: Material) =>
      (item.material_name).toLocaleLowerCase().includes(event.target.value.toLocaleLowerCase())) || []);
  }

  filterMaterialByCategory(category_id?: number | undefined) {
    if (!category_id)
      category_id = this.category_list[0].material_category_id;

    this.active_category_id.set(category_id);

    this.MaterialGridComponent?.rendered_material_list.set(this.MaterialGridComponent?.main_material_list.filter((item: Material) =>
      item.material_category_id === category_id
    ) || []);
  }

  initData() {

    this.apiService.get('getMaterial.php').subscribe((response) => {
      response = {
        "currency_list": [
          {
            "currency_id": 1,
            "currency_code": "$",
            "currency_name": "U.S. Dollars",
            "currency_is_basic": false,
            "currency_part_name": "Cent",
            "currency_precision": 3,
            "currency_rate": 89500,
            "currency_tva_rate": 89500
          },
          {
            "currency_id": 2,
            "currency_code": "L.L.",
            "currency_name": "Lebanese Lira",
            "currency_is_basic": true,
            "currency_part_name": "Lira",
            "currency_precision": 5,
            "currency_rate": 1,
            "currency_tva_rate": 1
          },
          {
            "currency_id": 3,
            "currency_code": "€",
            "currency_name": "Euro",
            "currency_is_basic": false,
            "currency_part_name": "Cent",
            "currency_precision": 2,
            "currency_rate": 97500,
            "currency_tva_rate": 97500
          }
        ],
        "category_list": [
          {
            "material_category_id": 1,
            "material_category_name": "FRAGRANCE"
          },
          {
            "material_category_id": 2,
            "material_category_name": "CHEMICAL"
          },
          {
            "material_category_id": 3,
            "material_category_name": "DETERGENT"
          },
          {
            "material_category_id": 4,
            "material_category_name": "MISCELLEANOUS"
          },
          {
            "material_category_id": 5,
            "material_category_name": "OIL"
          },
          {
            "material_category_id": 6,
            "material_category_name": "Chemicals Raw Materials"
          },
          {
            "material_category_id": 7,
            "material_category_name": "Test"
          },
          {
            "material_category_id": 8,
            "material_category_name": "Antiseptic"
          },
          {
            "material_category_id": 9,
            "material_category_name": "Paste"
          },
          {
            "material_category_id": 10,
            "material_category_name": "Wax"
          },
          {
            "material_category_id": 11,
            "material_category_name": "Silicone"
          },
          {
            "material_category_id": 12,
            "material_category_name": "Dye"
          },
          {
            "material_category_id": 13,
            "material_category_name": "Oil Dye"
          },
          {
            "material_category_id": 14,
            "material_category_name": "Soap"
          },
          {
            "material_category_id": 15,
            "material_category_name": "CHLORE"
          },
          {
            "material_category_id": 16,
            "material_category_name": "VITAMINE"
          },
          {
            "material_category_id": 17,
            "material_category_name": "Empty"
          },
          {
            "material_category_id": 18,
            "material_category_name": "Samples"
          },
          {
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan"
          },
          {
            "material_category_id": 20,
            "material_category_name": "Spare parts"
          },
          {
            "material_category_id": 21,
            "material_category_name": "Plastic cover"
          },
          {
            "material_category_id": 22,
            "material_category_name": "CARTON"
          },
          {
            "material_category_id": 23,
            "material_category_name": "Stickers"
          },
          {
            "material_category_id": 24,
            "material_category_name": "Naylons"
          },
          {
            "material_category_id": 25,
            "material_category_name": "Things"
          },
          {
            "material_category_id": 26,
            "material_category_name": "Pool Accessories"
          },
          {
            "material_category_id": 27,
            "material_category_name": "FRAGRANCE 1"
          },
          {
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1"
          },
          {
            "material_category_id": 29,
            "material_category_name": "Dye 1"
          },
          {
            "material_category_id": 40,
            "material_category_name": "FRAGRANCE 2"
          },
          {
            "material_category_id": 41,
            "material_category_name": "Assets"
          },
          {
            "material_category_id": 42,
            "material_category_name": "Hajj Mohamad"
          }
        ],
        "material_list": [

          {
            "material_id": 3681,
            "material_code": "80-93-BK",
            "material_name": "SOFT 90   CN200",
            "material_description": null,
            "material_print_name": "SOFT 90   CN200",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3682,
            "material_code": "05-09-BK",
            "material_name": "Flakes  KSA 25",
            "material_description": null,
            "material_print_name": "Flakes  KSA 25",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0.74,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "Shwal 25 KG",
                "unit_id": 58,
                "default_price": 18.5,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3683,
            "material_code": "MT-007",
            "material_name": "IPA MAKINA PLC",
            "material_description": "IPA MAKINA PLC",
            "material_print_name": "IPA MAKINA PLC",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3684,
            "material_code": "MT-008",
            "material_name": "IPA MAKINA ( INVERTER 0.4KW)",
            "material_description": "IPA MAKINA ( INVERTER 0.4KW)",
            "material_print_name": "IPA MAKINA ( INVERTER 0.4KW)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3685,
            "material_code": "MCF-086",
            "material_name": "Used MI-8018I TTO Sn. E 819160024",
            "material_description": "Used MI-8018I TTO Sn. E 819160024",
            "material_print_name": "Used MI-8018I TTO Sn. E 819160024",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3687,
            "material_code": "MCS-031",
            "material_name": "SVM 20s 53 CK LH TTO With installation bracket SN. 24260024",
            "material_description": "SVM 20s 53 CK LH TTO With installation bracket SN. 24260024",
            "material_print_name": "SVM 20s 53 CK LH With bracket SN. 24260024",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3688,
            "material_code": "MCS-032",
            "material_name": "SVM Winder & Rewinder System 450mm  SN. 24420001",
            "material_description": "SVM Winder & Rewinder System 450mm  SN. 24420001",
            "material_print_name": "SVM Winder & Rewinder S0ystem 450mm SN. 24420001",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3689,
            "material_code": "SP-0074",
            "material_name": "SUTION-MOTOR/PUMP- REV02FOR 4500/5700",
            "material_description": "SUTION-MOTOR/PUMP- REV02FOR 4500/5700",
            "material_print_name": "SUTION-MOTOR/PUMP- REV02FOR 4500/5700",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3690,
            "material_code": "SP-0077",
            "material_name": "T-ADAPTER FOR DPP MOTOR/PUMP",
            "material_description": "T-ADAPTER FOR DPP MOTOR/PUMP",
            "material_print_name": "T-ADAPTER FOR DPP MOTOR/PUMP",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3691,
            "material_code": "RM-01582",
            "material_name": "DISODIUM LAURTH SULFOSUCCINATE 40%",
            "material_description": null,
            "material_print_name": "DISODIUM LAURTH SULFOSUCCINATE 40%",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3694,
            "material_code": "MT-IFM-017",
            "material_name": "F-1039 MAKE-UP",
            "material_description": "F-1039 MAKE-UP",
            "material_print_name": "F-1039 MAKE-UP",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "BOTTLE",
                "unit_id": 4,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3696,
            "material_code": "TJ-RM-0000181",
            "material_name": "WATER DYE B / YELLOW",
            "material_description": null,
            "material_print_name": "WATER DYE B / YELLOW",
            "material_category_id": 12,
            "material_category_name": "Dye",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "100 gram",
                "unit_id": 113,
                "default_price": 1.705,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "250 gram",
                "unit_id": 114,
                "default_price": 4.03,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "0.5 kg",
                "unit_id": 115,
                "default_price": 7.905,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "50 gram",
                "unit_id": 146,
                "default_price": 0.93,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "1 KG",
                "unit_id": 116,
                "default_price": 15.655,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3697,
            "material_code": "TJ-RM-0000182",
            "material_name": "WATER DYE B / BLUE",
            "material_description": null,
            "material_print_name": "WATER DYE B / BLUE",
            "material_category_id": 12,
            "material_category_name": "Dye",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "100 gram",
                "unit_id": 113,
                "default_price": 1.705,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "250 gram",
                "unit_id": 114,
                "default_price": 4.03,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "0.5 kg",
                "unit_id": 115,
                "default_price": 7.905,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "50 gram",
                "unit_id": 146,
                "default_price": 0.93,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "1 KG",
                "unit_id": 116,
                "default_price": 15.655,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3698,
            "material_code": "TJ-RM-0000183",
            "material_name": "WATER DYE B / GREEN",
            "material_description": null,
            "material_print_name": "WATER DYE B / GREEN",
            "material_category_id": 12,
            "material_category_name": "Dye",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "100 gram",
                "unit_id": 113,
                "default_price": 1.705,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "250 gram",
                "unit_id": 114,
                "default_price": 4.03,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "0.5 kg",
                "unit_id": 115,
                "default_price": 7.905,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "50 gram",
                "unit_id": 146,
                "default_price": 0.93,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "1 KG",
                "unit_id": 116,
                "default_price": 15.655,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3700,
            "material_code": "04-11-BK",
            "material_name": "Soap (free sulfate) CN 220",
            "material_description": null,
            "material_print_name": "Soap (free sulfate) CN 220",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "1 KG",
                "unit_id": 116,
                "default_price": 2.5,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3705,
            "material_code": "ZSP-IPA-002",
            "material_name": "IPA OMRON PHOTO CELL",
            "material_description": "IPA OMRON PHOTO CELL",
            "material_print_name": "IPA OMRON PHOTO CELL",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3706,
            "material_code": "MT-TFX-022",
            "material_name": "HRP 340 O-Touch For ECO ink (06T340T2V)",
            "material_description": "HRP 340 O-Touch For ECO ink (06T340T2V)",
            "material_print_name": "HRP 340 O-Touch For ECO ink",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3707,
            "material_code": "MT-TFX-023",
            "material_name": "Noir SHM Expoort 125 ml Black ink (1700747EX)",
            "material_description": "Noir SHM Expoort 125 ml Black ink (1700747EX)",
            "material_print_name": "Noir SHM Expoort 125 ml Black ink",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "BOTTLE",
                "unit_id": 4,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3708,
            "material_code": "MCF-088",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10118)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10118)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10118)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3709,
            "material_code": "MCF-087",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10256)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10256)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10256)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3710,
            "material_code": "MCF-089",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10257)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10257)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10257)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3711,
            "material_code": "MCF-090",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10103)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10103)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10103)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3712,
            "material_code": "MCF-091",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10255)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10255)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10255)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3713,
            "material_code": "MCF-092",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10117)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10117)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10117)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3714,
            "material_code": "MCF-093",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10116)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10116)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10116)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3715,
            "material_code": "MCF-094",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10102)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10102)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10102)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3716,
            "material_code": "ZSP-IPA-003",
            "material_name": "IPA-Cutting blade set",
            "material_description": "IPA-Cutting blade set",
            "material_print_name": "IPA-Cutting blade set",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3717,
            "material_code": "ZSP-IPA-004",
            "material_name": "IPA-Auger screw set",
            "material_description": "IPA-Auger screw set",
            "material_print_name": "IPA-Auger screw set",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3718,
            "material_code": "ZSP-IPA-005",
            "material_name": "IPA-Powder Feeding instrument",
            "material_description": "IPA-Powder Feeding instrument",
            "material_print_name": "IPA-Powder Feeding instrument",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3719,
            "material_code": "80-95-BK",
            "material_name": "TOLUOL 18",
            "material_description": null,
            "material_print_name": "TOLUOL 18",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "LITER",
                "unit_id": 11,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3722,
            "material_code": "SP-FAM-014",
            "material_name": "MAXI MINI-21-00017 M3X20 SCREW",
            "material_description": "MAXI MINI-21-00017 M3X20 SCREW",
            "material_print_name": "MAXI MINI-21-00017 M3X20 SCREW",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3723,
            "material_code": "SP-FAM-015",
            "material_name": "MAXI MINI-21-00011 Encoder Bracket",
            "material_description": "MAXI MINI-21-00011 Encoder Bracket",
            "material_print_name": "MAXI MINI-21-00011 Encoder Bracket",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3724,
            "material_code": "SP-FAM-016",
            "material_name": "MAXI MINI-21-00021 Encoder Wheel",
            "material_description": "MAXI MINI-21-00021 Encoder Wheel",
            "material_print_name": "MAXI MINI-21-00021 Encoder Wheel",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3725,
            "material_code": "SP-FAM-017",
            "material_name": "MAXI MINI-21-00010 DK FRONT PLATE",
            "material_description": "MAXI MINI-21-00010 DK FRONT PLATE",
            "material_print_name": "MAXI MINI-21-00010 DK FRONT PLATE",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3726,
            "material_code": "SP-FAM-018",
            "material_name": "MAXI MINI-21-00012 RIGHT COVER",
            "material_description": "MAXI MINI-21-00012 RIGHT COVER",
            "material_print_name": "MAXI MINI-21-00012 RIGHT COVER",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3727,
            "material_code": "SP-FAM-019",
            "material_name": "MAXI MINI-21-00013 DK FRAME",
            "material_description": "MAXI MINI-21-00013 DK FRAME",
            "material_print_name": "MAXI MINI-21-00013 DK FRAME",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3728,
            "material_code": "SP-FAM-020",
            "material_name": "MAXI MINI-21-00014 BATTERY COVER",
            "material_description": "MAXI MINI-21-00014 BATTERY COVER",
            "material_print_name": "MAXI MINI-21-00014 BATTERY COVER",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3729,
            "material_code": "SP-FAM-021",
            "material_name": "MAXI MINI-21-00018 UPPER COVER OF ENCODER",
            "material_description": "MAXI MINI-21-00018 UPPER COVER OF ENCODER",
            "material_print_name": "MAXI MINI-21-00018 UPPER COVER OF ENCODER",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3730,
            "material_code": "SP-FAM-022",
            "material_name": "MAXI MINI-21-00011 LCD COVER S/N T-012",
            "material_description": "MAXI MINI-21-00011 LCD COVER S/N T-012",
            "material_print_name": "MAXI MINI-21-00011 LCD COVER S/N T-012",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3731,
            "material_code": "SP-FAM-023",
            "material_name": "MAXI MINI-21-00025 LOWER COVER OF ENCODER",
            "material_description": "MAXI MINI-21-00025 LOWER COVER OF ENCODER",
            "material_print_name": "MAXI MINI-21-00025 LOWER COVER OF ENCODER",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3734,
            "material_code": "MCS-033",
            "material_name": "SVM 20s 107 C LK With 600mm Bracket SN. 24280008",
            "material_description": "SVM 20s 107 C LK With 600mm Bracket SN. 24280008",
            "material_print_name": "SVM 20s 107 C LK With 600mm Bracket SN. 24280008",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3735,
            "material_code": "SP-SVM-088",
            "material_name": "53*70i Motor Driver Board 200117-MDB/70",
            "material_description": "53*70i Motor Driver Board 200117-MDB/70",
            "material_print_name": "53*70i Motor Driver Board 200117-MDB/70",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3736,
            "material_code": "MCS-034",
            "material_name": "BRACKET With 600mm SN. 24280008",
            "material_description": "BRACKET With 600mm SN. 24280008",
            "material_print_name": "BRACKET",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3737,
            "material_code": "36-05-BK",
            "material_name": "MONOPROPOLYENE GLYCOL SP220",
            "material_description": null,
            "material_print_name": "MONOPROPOLYENE GLYCOL SP220",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 3,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3738,
            "material_code": "9999-16-01-ٍSFSI-34",
            "material_name": "IYDIX شاور جل غالون صغير",
            "material_description": null,
            "material_print_name": "IYDIX شاور جل غالون صغير",
            "material_category_id": 25,
            "material_category_name": "Things",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3739,
            "material_code": "9999-16-01-ٍSFSI-35",
            "material_name": "IYDIX مطهر طبي غالون صغير",
            "material_description": null,
            "material_print_name": "IYDIX مطهر طبي غالون صغير",
            "material_category_id": 25,
            "material_category_name": "Things",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3740,
            "material_code": "9999-16-01-ٍSFSI-36",
            "material_name": "IYDIX معطر ومنظف ارضيات غالون صغير",
            "material_description": null,
            "material_print_name": "IYDIX معطر ومنظف ارضيات غالون صغير",
            "material_category_id": 25,
            "material_category_name": "Things",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3741,
            "material_code": "BK-80-DG01",
            "material_name": "DEHYQUART GUAR",
            "material_description": null,
            "material_print_name": "DEHYQUART GUAR",
            "material_category_id": 2,
            "material_category_name": "CHEMICAL",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3757,
            "material_code": "80-96-BK",
            "material_name": "Super phosphate Triple Granule",
            "material_description": null,
            "material_print_name": "Super phosphate Triple Granule",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3758,
            "material_code": "MT-IFM-018",
            "material_name": "f-i304-A f500black to blue 0.825l",
            "material_description": "f-i304-A f500black to blue 0.825l",
            "material_print_name": "f-i304-A f500black to blue 0.825l",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "BOTTLE",
                "unit_id": 4,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3759,
            "material_code": "MCF-095",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10309)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10309)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10309)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3760,
            "material_code": "MCF-096",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10305)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10305)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10305)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3761,
            "material_code": "MCF-097",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10308)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10308)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10308)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3762,
            "material_code": "MCF-098",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10310)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10310)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10310)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3763,
            "material_code": "MCF-099",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10307)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10307)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10307)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3765,
            "material_code": "MCS-035",
            "material_name": "SVM 20s 107*125i Printer with foot Pedal SN. 24410003 ( SNM. 24150035)",
            "material_description": "SVM 20s 107*125i Printer with foot Pedal SN. 24410003 ( SNM. 24150035)",
            "material_print_name": "SVM 20s 107*125i Printer with foot Pedal SN. 24410003 ( SNM. 24150035)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 2,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3766,
            "material_code": "SP-0080",
            "material_name": "Tube AIR 6mX6m",
            "material_description": "Tube AIR 6mX6m",
            "material_print_name": "Tube AIR 6mX6m",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 2,
            "material_unit": [
              {
                "unit_name": "METER",
                "unit_id": 27,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3767,
            "material_code": "ZSP-IPA-006",
            "material_name": "IPA Silicone Vacuum cups",
            "material_description": "IPA Silicone Vacuum cups",
            "material_print_name": "IPA Silicone Vacuum cups",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3768,
            "material_code": "ZSP-IPA-007",
            "material_name": "IPA EUR Hole Cylinders",
            "material_description": "IPA EUR Hole Cylinders",
            "material_print_name": "IPA EUR Hole Cylinders",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3769,
            "material_code": "RM-01584",
            "material_name": "hyaluronic acid",
            "material_description": null,
            "material_print_name": "hyaluronic acid",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3779,
            "material_code": "MCS-037",
            "material_name": "SVM 20s 53*125i Printer with Foot Pedal SN. 24120015- FPS. 24410004",
            "material_description": "SVM 20s 53*125i Printer with Foot Pedal SN. 24120015- FPS. 24410004",
            "material_print_name": "SVM 20s 53*125i Printer with Foot Pedal SN. 24120015- FPS. 24410004",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3781,
            "material_code": "TJ-9999",
            "material_name": "Phosphonate--",
            "material_description": "Phosphonate",
            "material_print_name": "Phosphonate",
            "material_category_id": 6,
            "material_category_name": "Chemicals Raw Materials",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "1 KG",
                "unit_id": 116,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "3 KG",
                "unit_id": 145,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "5 KG",
                "unit_id": 121,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3782,
            "material_code": "MCS-038",
            "material_name": "SVM 20s 32 CK LH TTO with 550mm Bracket SN. 23220345",
            "material_description": "SVM 20s 32 CK LH TTO with 550mm Bracket SN. 23220345",
            "material_print_name": "SVM 20s 32 CK LH TTO with 550mm Bracket SN. 23220345",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3783,
            "material_code": "MCS-039",
            "material_name": "SVM 20s 53*70I TTO With 650mm bracket SN.20100129",
            "material_description": "SVM 20s 53*70I TTO With 650mm bracket SN.20100129",
            "material_print_name": "SVM 20s 53*70I TTO With 650mm bracket SN.20100129",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3785,
            "material_code": "9999-16-01-ٍSFSI-38",
            "material_name": "ليفة جلي باكيه *3 حبة",
            "material_description": null,
            "material_print_name": "ليفة جلي باكيه *3 حبة",
            "material_category_id": 3,
            "material_category_name": "DETERGENT",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3786,
            "material_code": "9999-16-01-ٍSFSI-39",
            "material_name": "ممسحة مجلى جيميكس اصفر حبة",
            "material_description": null,
            "material_print_name": "ممسحة مجلى جيميكس اصفر حبة",
            "material_category_id": 3,
            "material_category_name": "DETERGENT",
            "material_currency_id": 2,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3787,
            "material_code": "9999-16-01-ٍSFSI-40",
            "material_name": "IB-Lemon",
            "material_description": null,
            "material_print_name": "IB-Lemon",
            "material_category_id": 1,
            "material_category_name": "FRAGRANCE",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "1 KG",
                "unit_id": 116,
                "default_price": 9.01,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "0.5 kg",
                "unit_id": 115,
                "default_price": 4.635,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "200 GRAM",
                "unit_id": 118,
                "default_price": 2.01,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "100 gram",
                "unit_id": 113,
                "default_price": 1.135,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "5 KG",
                "unit_id": 121,
                "default_price": 44.01,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "3 KG",
                "unit_id": 145,
                "default_price": 26.51,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3788,
            "material_code": "80-98-BK",
            "material_name": "THINNER KO 160/200",
            "material_description": null,
            "material_print_name": "THINNER KO 160/200",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "LITER",
                "unit_id": 11,
                "default_price": 2,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 2.5,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3789,
            "material_code": "MCM-002",
            "material_name": "Impack 40 pro servo cont seal pack machine",
            "material_description": "Impack 40 pro servo cont seal pack machine",
            "material_print_name": "Impack 40 pro SN.16854 machine",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3790,
            "material_code": "MCM-003",
            "material_name": "MOTORIZED CONVEYOR BELT 450X2000MM",
            "material_description": "MOTORIZED CONVEYOR BELT 450X2000MM",
            "material_print_name": "MOTORIZED CONVEYOR BELT 450X2000MM",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3791,
            "material_code": "MCM-004",
            "material_name": "T45 1400 DIAMOND V2H250 RIGHT HEAT TUNNEL",
            "material_description": "T45 1400 DIAMOND V2H250 RIGHT HEAT TUNNEL",
            "material_print_name": "T45 1400 DIAMOND V2H250 RIGHT HEAT TUNNELSN.19369",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3792,
            "material_code": "RM-01585",
            "material_name": "SILVER GALLERY",
            "material_description": null,
            "material_print_name": "SILVER GALLERY",
            "material_category_id": 27,
            "material_category_name": "FRAGRANCE 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3793,
            "material_code": "80-101-BK",
            "material_name": "ATMP IN200",
            "material_description": null,
            "material_print_name": "ATMP IN200",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3794,
            "material_code": "80-100-BK",
            "material_name": "CHLOROXIDINE IN25",
            "material_description": null,
            "material_print_name": "CHLOROXIDINE IN25",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3796,
            "material_code": "MCF-100",
            "material_name": "TIJ Maxi Mini Mobile Printer (01604N)",
            "material_description": "TIJ Maxi Mini Mobile Printer (01604N)",
            "material_print_name": "TIJ Maxi Mini Mobile Printer (01604N)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3797,
            "material_code": "MCF-101",
            "material_name": "TIJ Maxi Mini Mobile Printer (01564N)",
            "material_description": "TIJ Maxi Mini Mobile Printer (01564N)",
            "material_print_name": "TIJ Maxi Mini Mobile Printer (01564N)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3798,
            "material_code": "MCF-102",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10211)Machine n: FJ32/1011",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10211)Machine n: FJ32/1011",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10211)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3799,
            "material_code": "MCF-103",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10279)Machine n: FJ32/1179",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10279)Machine n: FJ32/1179",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10279)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3800,
            "material_code": "MCF-104",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10280)Machine n: FJ32/11180",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10280)Machine n: FJ32/11180",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10280)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3801,
            "material_code": "MCF-105",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10281)Machine n: FJ32/1181",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10281)Machine n: FJ32/1181",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10281)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3802,
            "material_code": "MCF-106",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10282)Machine n: FJ32/1182",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10282)Machine n: FJ32/1182",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10282)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3803,
            "material_code": "SP-FAM-025",
            "material_name": "FAM-Charge Electrode  assy 45411",
            "material_description": "FAM-Charge Electrode assy 45411",
            "material_print_name": "FAM-Charge Electrode assy 45411",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3804,
            "material_code": "SP-FAM-026",
            "material_name": "FAM -Head valve 14735(VALVE SOLENOID DIA)",
            "material_description": "FAM -Head valve 14735(VALVE SOLENOID DIA)",
            "material_print_name": "FAM -Head valve 14735(VALVE SOLENOID DIA)",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3805,
            "material_code": "SP-FAM-027",
            "material_name": "FAM Solvent filter  29273-10MICRON",
            "material_description": "FAM Solvent filter  29273-10MICRON",
            "material_print_name": "FAM Solvent filter  29273-10MICRON",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3806,
            "material_code": "SP-FAM-028",
            "material_name": "FAM Fan assy 67656 INTERFACE",
            "material_description": "FAM Fan assy 67656 INTERFACE",
            "material_print_name": "FAM Fan assy 67656 INTERFACE",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3807,
            "material_code": "SP-FAM-029",
            "material_name": "FAM 37753-PC0043 INK LEVEL SENSOR",
            "material_description": "FAM 37753-PC0043 INK LEVEL SENSOR",
            "material_print_name": "FAM 37753-PC0043 INK LEVEL SENSOR",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3808,
            "material_code": "SP-FAM-030",
            "material_name": "FAM 37754-PC0063 MAKE UP LEVEL SENSOR",
            "material_description": "FAM 37754-PC0063 MAKE UP LEVEL SENSOR",
            "material_print_name": "FAM 37754-PC0063 MAKE UP LEVEL SENSOR",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3809,
            "material_code": "SP-FAM-031",
            "material_name": "FAM-Viscometer Assembly 37733",
            "material_description": "FAM- Viscometer Assembly 37733",
            "material_print_name": "FAM-Viscometer Assembly 37733",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3810,
            "material_code": "SP-FAM-032",
            "material_name": "FAM 04368 Socket Head Cap Screw 1.5x6mm",
            "material_description": "FAM 04368 Socket Head Cap Screw 1.5x6mm",
            "material_print_name": "FAM 04368 Socket Head Cap Screw 1.5x6mm",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3811,
            "material_code": "SP-FAM-033",
            "material_name": "Solenoid valve 2 waY 24V 3.8 (14780)",
            "material_description": "Solenoid valve 2 waY 24V 3.8 (14780)",
            "material_print_name": "Solenoid valve 2 waY 24V 3.8 (14780)",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3812,
            "material_code": "SP-FAM-034",
            "material_name": "14174-STRAIGHT CONNECTOR (BLUE) 4.0mm OR 8mm",
            "material_description": "14174-STRAIGHT CONNECTOR (BLUE) 4.0mm OR 8mm",
            "material_print_name": "14174-STRAIGHT CONNECTOR (BLUE) 4.0mm OR 8mm",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3813,
            "material_code": "MCS-040",
            "material_name": "SVM 20s 32CKLH TTO With 450mm bracket SN.24220116",
            "material_description": "SVM 20s 32CKLH TTO With 450mm bracket SN.24220116",
            "material_print_name": "SVM 20s 32CKLH TTO With 450mm bracket SN.24220116",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3818,
            "material_code": "SP-0081",
            "material_name": "Counter Digital -CT4S-Autonics",
            "material_description": "Counter Digital -CT4S-Autonics",
            "material_print_name": "Counter Digital -CT4S",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3819,
            "material_code": "MT-PVC-021",
            "material_name": "POF- Shrink Film 450X19 (16.79KG)",
            "material_description": "POF- Shrink Film 450X19 (16.79KG)",
            "material_print_name": "POF- Shrink Film 450X19 (16.79KG)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "KG",
                "unit_id": 1,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3820,
            "material_code": "80-103-BK",
            "material_name": "AQ1300",
            "material_description": null,
            "material_print_name": "AQ1300",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3821,
            "material_code": "TJ-RM-0000184",
            "material_name": "FRACTOSE",
            "material_description": null,
            "material_print_name": "FRACTOSE",
            "material_category_id": 6,
            "material_category_name": "Chemicals Raw Materials",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "5 KG",
                "unit_id": 121,
                "default_price": 6.28,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "10 KG",
                "unit_id": 122,
                "default_price": 3.605,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3822,
            "material_code": "TJ-PER-LAMES",
            "material_name": "FS(MP)-Lamees",
            "material_description": null,
            "material_print_name": "S-Lamees",
            "material_category_id": 1,
            "material_category_name": "FRAGRANCE",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "100 gram",
                "unit_id": 113,
                "default_price": 1.673,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "0.5 kg",
                "unit_id": 115,
                "default_price": 6.923,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "1 KG",
                "unit_id": 116,
                "default_price": 13.485,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "200 GRAM",
                "unit_id": 118,
                "default_price": 2.985,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "3 KG",
                "unit_id": 145,
                "default_price": 39.735,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "5 KG",
                "unit_id": 121,
                "default_price": 65.985,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3823,
            "material_code": "9999-16-01-ٍSFSI-41",
            "material_name": "MPG SIN 215",
            "material_description": null,
            "material_print_name": "MPG SIN 215",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 3,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "Drum/215Kg",
                "unit_id": 69,
                "default_price": 645,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3824,
            "material_code": "9999-16-01-ٍSFSI-42",
            "material_name": "Spertol 95% AF 170/212.5L",
            "material_description": "Ethanol",
            "material_print_name": "Spertol 95% AF 170/212.5L",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "LITER",
                "unit_id": 11,
                "default_price": 1.65,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "Drum/165Kg",
                "unit_id": 94,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": true
              },
              {
                "unit_name": "Drum/ 209 L",
                "unit_id": 168,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "DRUM 165 KG",
                "unit_id": 252,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3826,
            "material_code": "MCF-108",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10287)Machine n: FJ32/1187",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10287)Machine n: FJ32/1187",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10287)Machine n: FJ32/1187",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3827,
            "material_code": "MCF-109",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10285)Machine n: FJ32/1185",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10285)Machine n: FJ32/1185",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10285)Machine n: FJ32/1185",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3828,
            "material_code": "MCF-110",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10283)Machine n: FJ32/1183",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10283)Machine n: FJ32/1183",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10283)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3829,
            "material_code": "MCF-111",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10289)Machine n: FJ32/1189",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10289)Machine n: FJ32/1189",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10289)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3830,
            "material_code": "MCF-112",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10284)Machine n: FJ32/1184",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10284)Machine n: FJ32/1184",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10284)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3831,
            "material_code": "SP-FAM-035",
            "material_name": "FAM Deflector plate 36703",
            "material_description": "FAM Deflector plate 36703",
            "material_print_name": "FAM Deflector plate 36703",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3834,
            "material_code": "SP-FAM-038",
            "material_name": "FAM Head Heater 36994",
            "material_description": "FAM Head Heater 36994",
            "material_print_name": "FAM Head Heater 36994",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3835,
            "material_code": "SP-FAM-039",
            "material_name": "FAM Gutter tube 36723",
            "material_description": "FAM Gutter tube 36723",
            "material_print_name": "FAM Gutter tube 36723",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3837,
            "material_code": "MT-PVC-022",
            "material_name": "POF- Shrink Film 40X15(14.71KG)1 ROLL",
            "material_description": "POF- Shrink Film 40X15(14.71KG)1 ROLL",
            "material_print_name": "POF- Shrink Film 40X15(14.71KG)1 ROLL",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "KG",
                "unit_id": 1,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3839,
            "material_code": "9999-16-01-ٍSFSI-44",
            "material_name": "SUPER CLEAN 15% EG",
            "material_description": null,
            "material_print_name": "SUPER CLEAN 15% EG",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0.75,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "Shwal/20Kg",
                "unit_id": 103,
                "default_price": 15,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3840,
            "material_code": "9999-16-01-ٍSFSI-45",
            "material_name": "9999-6151 : Dishwashing Liquid 1L IYDIX/ سائل جلي",
            "material_description": null,
            "material_print_name": "9999-6151 : Dishwashing Liquid 1L IYDIX/ سائل جلي",
            "material_category_id": 3,
            "material_category_name": "DETERGENT",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3841,
            "material_code": "9999-16-01-ٍSFSI-46",
            "material_name": "General Floor Cleaner 1L IYDIX / معطر و منظف ارضيات جنرال ايديكس",
            "material_description": "General Floor Cleaner 1L IYDIX / معطر و منظف ارضيات جنرال ايديكس",
            "material_print_name": "General Floor Cleaner 1L IYDIX / معطر و منظف ارضيات جنرال ايديكس",
            "material_category_id": 3,
            "material_category_name": "DETERGENT",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3842,
            "material_code": "9999-16-01-ٍSFSI-47",
            "material_name": "Shampoo For Dogs 1 kg",
            "material_description": "Shampoo For Dogs 1 kg A",
            "material_print_name": "Shampoo For Dogs 1 kg A",
            "material_category_id": 3,
            "material_category_name": "DETERGENT",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3844,
            "material_code": "111-13-BK",
            "material_name": "ES-BUBBLE",
            "material_description": null,
            "material_print_name": "ES-BUBBLE",
            "material_category_id": 27,
            "material_category_name": "FRAGRANCE 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 12.6,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 12.6,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3846,
            "material_code": "111-13-TJ-5-",
            "material_name": "ES-BUBBLE 5 KG",
            "material_description": null,
            "material_print_name": "ES-BUBBLE 5 KG",
            "material_category_id": 27,
            "material_category_name": "FRAGRANCE 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PCS",
                "unit_id": 30,
                "default_price": 66.11,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3851,
            "material_code": "10-05-BK",
            "material_name": "Butyl Glycol EU 185/205.5",
            "material_description": null,
            "material_print_name": "Butyl Glycol EU 185/205.5",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "LITER",
                "unit_id": 11,
                "default_price": 2.5,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "Drum/205 L",
                "unit_id": 155,
                "default_price": 513.75,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3852,
            "material_code": "MCF-113",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10138)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10138)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10138)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3853,
            "material_code": "MCF-114",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10237)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10237)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10237)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3854,
            "material_code": "MCF-115",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10236)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10236)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10236)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3855,
            "material_code": "MCF-116",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10135)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10135)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10135)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3856,
            "material_code": "MCF-117",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10213)",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10213)",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10213)",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3857,
            "material_code": "MCV-005",
            "material_name": "Volvac TS450 TRAY SEALER MACHINE",
            "material_description": "Volvac TS450 TRAY SEALER MACHINE",
            "material_print_name": "Volvac TS450 TRAY SEALER MACHINE",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 2,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3862,
            "material_code": "111-08-BK",
            "material_name": "ES-Lemon",
            "material_description": null,
            "material_print_name": "ES-Lemon",
            "material_category_id": 27,
            "material_category_name": "FRAGRANCE 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 8.25,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3863,
            "material_code": "20-36-BK",
            "material_name": "Apricot Oil",
            "material_description": null,
            "material_print_name": "Apricot Oil",
            "material_category_id": 27,
            "material_category_name": "FRAGRANCE 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 30,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3865,
            "material_code": "9999-16-01-ٍSFSI-50",
            "material_name": "F-Papaya 100K",
            "material_description": null,
            "material_print_name": "F-Papaya 100K",
            "material_category_id": 1,
            "material_category_name": "FRAGRANCE",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "1 KG",
                "unit_id": 116,
                "default_price": 10.6,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "0.5 kg",
                "unit_id": 115,
                "default_price": 5.405,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "200 GRAM",
                "unit_id": 118,
                "default_price": 2.28,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "100 gram",
                "unit_id": 113,
                "default_price": 1.245,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3866,
            "material_code": "122-01-TJ",
            "material_name": "Hyaluronic Acid In",
            "material_description": null,
            "material_print_name": "Hyaluronic Acid In",
            "material_category_id": 6,
            "material_category_name": "Chemicals Raw Materials",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "100 gram",
                "unit_id": 113,
                "default_price": 25.155,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "50 gram",
                "unit_id": 146,
                "default_price": 12.655,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3867,
            "material_code": "MCZ-003",
            "material_name": "Zanasi Z4700 -  (AJ-SY-00002) USED",
            "material_description": "Zanasi Z4700 -  (AJ-SY-00002) USED",
            "material_print_name": "Zanasi Z4700 -  (AJ-SY-00002) USED",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3870,
            "material_code": "20-38-BK",
            "material_name": "Frankincense oil",
            "material_description": null,
            "material_print_name": "Frankincense oil",
            "material_category_id": 5,
            "material_category_name": "OIL",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3871,
            "material_code": "BKPS-133",
            "material_name": "Aloe Vera Extract 25",
            "material_description": null,
            "material_print_name": "Aloe Vera Extract 25",
            "material_category_id": 40,
            "material_category_name": "FRAGRANCE 2",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "KG",
                "unit_id": 1,
                "default_price": 20,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3872,
            "material_code": "MCF-118",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10240) FJ32/10240",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10240) FJ32/10240",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10240) FJ32/10240",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3873,
            "material_code": "MCF-119",
            "material_name": "F500 CIJ Inkjet Printer S.N(23-10139) FJ32/10139",
            "material_description": "F500 CIJ Inkjet Printer S.N(23-10139) FJ32/10139",
            "material_print_name": "F500 CIJ Inkjet Printer S.N(23-10139) FJ32/10139",
            "material_category_id": 19,
            "material_category_name": "Material Abu Hassan",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3874,
            "material_code": "10-06-BK",
            "material_name": "Butyl Glycol CN 186/206.6",
            "material_description": null,
            "material_print_name": "Butyl Glycol CN 186/206.6",
            "material_category_id": 28,
            "material_category_name": "Chemicals Raw Materials 1",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "Litre",
                "unit_id": 263,
                "default_price": 2.5,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              },
              {
                "unit_name": "K.G.",
                "unit_id": 208,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": false,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3875,
            "material_code": "SP-DFM-027",
            "material_name": "D-FAM 280 PUMP MOTOR - يسر العطار",
            "material_description": "D-FAM 280 PUMP MOTOR - يسر العطار",
            "material_print_name": "D-FAM 280 PUMP MOTOR",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3876,
            "material_code": "RPR-015",
            "material_name": "F500-Main Board Repairation SN.20-00134",
            "material_description": "F500-Main Board Repairation SN.20-00134",
            "material_print_name": "F500-Main Board Repairation SN.20-00134",
            "material_category_id": 20,
            "material_category_name": "Spare parts",
            "material_currency_id": 3,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          },
          {
            "material_id": 3878,
            "material_code": "9999-16-01-ٍSFSI-51",
            "material_name": "CAP SEAL",
            "material_description": null,
            "material_print_name": "CAP SEAL",
            "material_category_id": 25,
            "material_category_name": "Things",
            "material_currency_id": 1,
            "material_unit": [
              {
                "unit_name": "PIECE",
                "unit_id": 9,
                "default_price": 0,
                "material_unit_barcode": null,
                "material_unit_is_default": true,
                "material_unit_is_disabled": false
              }
            ]
          }
        ]
      }
      //
      this.MaterialGridComponent!.main_material_list = response.material_list;
      this.MaterialGridComponent!.currency_list = response.currency_list;
      this.storage.set('main_material_list', response.material_list);

      //
      this.category_list = response.category_list;

      //
      this.filterMaterialByCategory();
    })
  }
  openRefundMode() {
    this.is_refund_mode.set(true);
    this.is_sales_mode.set(false);
    
    this.main_menu?.close();
  }
  closeRefundMode() {
    this.is_refund_mode.set(false);
    this.is_sales_mode.set(true);

    this.main_menu?.close();
  }
  async initStorage() {
    if (!(await this.storage.get('transaction_list')))
      this.storage.set('transaction_list', [])
  }
  async showBoxes() {
    (await this.modal.create({
      component: BoxesComponent
    })).present();
  }
  async openTransactionHistory() {
    (await this.modal.create({
      component: TransactionHistoryComponent
    })).present();

  }
  initMenuItemList() {
    this.menu_item_list = [
      {
        text: 'Sales',
        icon: 'mdi mdi-cart-outline',
        handler: this.closeRefundMode,
        visible: signal(true),
        is_seperate_page: true

      },
      {
        text: 'Refund',
        icon: 'mdi mdi-cash-refund',
        handler: this.openRefundMode,
        visible: signal(true),
        is_seperate_page: true

      },
      {
        text: 'My Box',
        icon: 'mdi mdi-cash-register',
        handler: this.showBoxes,
        visible: signal(true)
      },
      {
        text: 'Transaction History',
        icon: 'mdi mdi-clipboard-text-clock-outline',
        handler: this.openTransactionHistory,
        visible: signal(true)
      },
    ]
  }
  menuItemClicked(index: number, move_selected_pointer: boolean = false) {
    this.menu_item_list[index].handler.call(this)
    if (move_selected_pointer)
      this.opened_menu_page_index.set(index);
  }
  ngOnInit() {

  }

  ionViewDidEnter() {
    this.setHeights();
    this.initData();
    this.initStorage();
    this.initMenuItemList();
  }
  setHeights() {

    this.grid_header_height = this.grid_header?.nativeElement.clientHeight || 0;
    this.list_header_height = this.list_header?.nativeElement.clientHeight || 0;
    this.list_footer_height = this.list_footer?.nativeElement.clientHeight || 0;
    this.material_grid_content_style = `block-size:calc(100vh - ${this.grid_header_height}px)`;
    this.material_grid_style = `block-size:calc(100% - 62px)`;

    this.checkout_list_style = `block-size:calc(100vh - ${this.list_header_height + this.list_footer_height}px)`;

    this.searchbar?.setFocus()

  }

}
