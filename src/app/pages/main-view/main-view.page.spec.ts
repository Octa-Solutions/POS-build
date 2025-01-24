import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MainViewPage } from './main-view.page';

describe('MainViewPage', () => {
  let component: MainViewPage;
  let fixture: ComponentFixture<MainViewPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MainViewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
