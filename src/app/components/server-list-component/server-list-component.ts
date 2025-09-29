import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild, WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ServerDto} from '../../models/api.model';
import { ApiService } from '../../services/api.service';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalService } from '../../services/modal-service';
import { ServerEventsService } from '../../services/server-events-service';
import { DeleteServerEvent } from '../../services/delete-server-event';

@Component({
  selector: 'app-server-list-component',
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './server-list-component.html',
  styleUrl: './server-list-component.css'
})
export class ServerListComponent implements OnInit, OnDestroy {
  
  servers: WritableSignal<ServerDto[]> = signal([]);
  @ViewChild('serverTooltip', { static: false }) serverTooltip!: ElementRef<HTMLDivElement>;
  @ViewChild('tooltipPortal', { static: false }) tooltipPortal!: ElementRef<HTMLDivElement>;
  showTooltip = false;
  tooltipText = '';
  
  private destroy$ = new Subject<void>();
  private tooltipTimeout?: number;

  constructor(
    private apiService: ApiService,
    private router: Router,
    public modal: ModalService,
    private serverEvent: ServerEventsService,
    private deletServerEvent:DeleteServerEvent
  ) {}

  ngOnInit(): void {
    this.loadServers();
    this.serverEvent.serverCreated$.subscribe(() => {
      this.loadServers();
    });
    this.deletServerEvent.deleteServer$
    .pipe(takeUntil(this.destroy$))
    .subscribe(()=>{
      this.loadServers();
    })
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }
  }

  loadServers(): void {
    this.apiService.getServers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.servers.set(response.data);
        },
        error: (error) => {
          console.error('Failed to load servers:', error);
        }
      });
  }

  showServerTooltip(event: MouseEvent, serverName: string) {
    // Clear any existing timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }

    const button = event.currentTarget as HTMLButtonElement;
    const buttonRect = button.getBoundingClientRect();
    
    // Set text and position immediately (Discord-like instant show)
    this.tooltipText = serverName;
    this.updateTooltipPosition(buttonRect);
    
    // Show tooltip instantly with a tiny delay to ensure positioning is applied
    this.tooltipTimeout = setTimeout(() => {
      this.showTooltip = true;
    }, 50); // Very small delay, just enough for positioning
  }

  hideServerTooltip() {
    // Clear any pending show timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }
    
    // Hide instantly (Discord behavior)
    this.showTooltip = false;
  }

  private updateTooltipPosition(buttonRect: DOMRect) {
    if (this.serverTooltip && this.serverTooltip.nativeElement) {
      const tooltipEl = this.serverTooltip.nativeElement;
      const buttonCenterY = buttonRect.top + (buttonRect.height / 2);
      
      // Position tooltip with proper offset from the button
      tooltipEl.style.left = `${buttonRect.right + 12}px`; // 12px gap from button right edge
      tooltipEl.style.top = `${buttonCenterY}px`;
      
      // Ensure tooltip doesn't go off-screen
      setTimeout(() => {
        const tooltipRect = tooltipEl.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        
        if (buttonCenterY + (tooltipRect.height / 2) > viewportHeight - 10) {
          tooltipEl.style.top = `${viewportHeight - tooltipRect.height - 10}px`;
        } else if (buttonCenterY - (tooltipRect.height / 2) < 10) {
          tooltipEl.style.top = `10px`;
        }
      }, 0);
    }
  }

  isActive(route: string): boolean {
    return this.router.url.startsWith(route);
  }

  // TrackBy function for better performance with *ngFor
  trackByServerId(index: number, server: ServerDto): string | number {
    return server.id;
  }
}