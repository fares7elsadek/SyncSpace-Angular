import { Component, OnDestroy, OnInit, signal, WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ServerDto, ServerMember } from '../../models/api.model';
import { ApiService } from '../../services/api.service';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CreateServerRequest } from '../../models/api.model';
import { ModalService } from '../../services/modal-service';
import { ServerEventsService } from '../../services/server-events-service';



@Component({
  selector: 'app-server-list-component',
  imports: [RouterLink,CommonModule,FormsModule],
  templateUrl: './server-list-component.html',
  styleUrl: './server-list-component.css'
})
export class ServerListComponent implements OnInit,OnDestroy {
  
  servers: WritableSignal<ServerDto[]> = signal([]);
  
  
  
  
  private destroy$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private router:Router,
    public modal:ModalService,
    private serverEvent:ServerEventsService
  ){}


  ngOnInit(): void {
    this.loadServers();
    this.serverEvent.serverCreated$.subscribe(()=>{
      this.loadServers();
    })
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadServers(){
    this.apiService.getServers()
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (respone) => {
        this.servers.set(respone.data);
      },
      error:(error) =>{
        console.error('Failed to load servers:', error);
      }
    })
  }

  isActive(route: string): boolean{
    return this.router.url.startsWith(route);
  }

  
}
