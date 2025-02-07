import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { NotificationService } from '../notification/notification.service';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  httpHeaders: HttpHeaders;

  constructor(private http: HttpClient, private notification: NotificationService) {

    this.httpHeaders = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 4slZfVFqIlTC94JCgw4smHd1wbrtBU2XBGZXMgOvjTYmPA0k4FaFTyGWe6L2erTfd5Q/LPrpTPEifqN0eWbClY5bL8nDZYEaVOdQwWke03M='
    });
}

/**
 * GET API request
 *
 */
get(url: string, operation ?: string): Observable < any > {
  return this.http.get(`${environment.apiUrl}/${url}`, {headers: this.httpHeaders}).pipe(catchError(this.handleError(`${operation}`)));
}

/**
 * POST API request
 *
 */
post(url: string, data: any, operation ?: string): Observable < any > {
  return this.http.post(`${environment.apiUrl}/${url}`, data, {headers :this.httpHeaders}).pipe(catchError(this.handleError(`${operation}`)));
}

  //Error handler
  private handleError<T>(operation = 'Request', result ?: T) {
  return (error: any): Observable<T> => {
    if (error.status == 0 || error.status == 500 || error.status == 404) {

      this.notification.error(`${operation} failed: ${error.message}`);
    }
    //Permission
    if (error.status == 403) {
      this.notification.error(`You do not have permission to view this resource.`);
    }

    //Unauthorised!
    if (error.status == 401) {
      this.notification.error(`You do not have authorization to view this resource.`);
    }
    return of(result as T);
  };
}
}