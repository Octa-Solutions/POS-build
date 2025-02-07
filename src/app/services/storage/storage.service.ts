import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage-angular';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private _storage: Storage | null = null;

  constructor(private storage: Storage) {
    this.init();
  }

  // Initialize Ionic Angular storage
  async init() {
    this._storage = await this.storage.create();
  }

  /**
   *
   * @param key
   * @param value
   * Store a key value pair.
   */
  public set(key: string, value: any) {
    this._storage?.set(key, value);
  }

  /**
   *
   * @param key
   * @returns storaged value {any}
   */
  public get(key: string): Promise<any> | undefined {
    return this._storage?.get(key);
  }

  /**
   *
   * @param key
   * Remove item from storage based on key (name)
   */
  public remove(key: string) {
    this._storage?.remove(key);
  }
  /**
   * Clear everything from storage
   */
  public clear() {
    this._storage?.clear();
  }
}