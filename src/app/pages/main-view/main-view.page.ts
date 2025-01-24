import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { IonFooter, IonHeader, IonSearchbar } from '@ionic/angular';

@Component({
  selector: 'app-main-view',
  templateUrl: './main-view.page.html',
  styleUrls: ['./main-view.page.scss'],
  standalone: false,
})
export class MainViewPage implements OnInit {
  @ViewChild('searchbar') searchbar: IonSearchbar | undefined;
  @ViewChild('list_header', {read: ElementRef}) list_header: ElementRef | undefined;
  @ViewChild('list_footer', {read: ElementRef}) list_footer: ElementRef | undefined;
  @ViewChild('grid_header', {read: ElementRef}) grid_header: ElementRef | undefined;
  @ViewChild('grid_footer', {read: ElementRef}) grid_footer: ElementRef | undefined;

  grid_header_height: number = 0;
  grid_footer_height: number = 0;
  list_header_height: number = 0;
  list_footer_height: number = 0;
  items_grid_style: string = `block-size:calc(100vh - ${this.grid_header_height +  this.grid_footer_height}px)`;
  checkout_list_style: string = `block-size:calc(100vh - ${this.list_header_height + this.list_footer_height}px)`;
  itemz = new Array(20).fill(1);

  constructor() { }
  searchBarChange(event : any) {
    console.log(event.target.value);
  }
  
  ionViewDidEnter() {
    this.grid_header_height = this.grid_header?.nativeElement.clientHeight || 0;
    this.grid_footer_height = this.grid_footer?.nativeElement.clientHeight || 0;
    this.list_header_height = this.list_header?.nativeElement.clientHeight || 0;
    this.list_footer_height = this.list_footer?.nativeElement.clientHeight || 0;    
    this.items_grid_style = `block-size:calc(100vh - ${this.grid_header_height + this.grid_footer_height}px)`;
    this.checkout_list_style = `block-size:calc(100vh - ${this.list_header_height + this.list_footer_height}px)`;

    this.searchbar?.setFocus()
  }
  ngOnInit() {


  }

}
