import { Component, ElementRef, OnDestroy, OnInit, signal, ViewChild, WritableSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ServerDto} from '../../models/api.model';
import { ApiService } from '../../services/api.service';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalService } from '../../services/modal-service';
import { ServerEventsService } from '../../services/server-events-service';

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

  constructor(
    private apiService: ApiService,
    private router: Router,
    public modal: ModalService,
    private serverEvent: ServerEventsService
  ) {}

  ngOnInit(): void {
    this.loadServers();
    this.serverEvent.serverCreated$.subscribe(() => {
      this.loadServers();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  showServerTooltip(event: MouseEvent, serverName: string, index: number) {
    const button = event.currentTarget as HTMLButtonElement;
    const buttonRect = button.getBoundingClientRect();
    
    // If tooltip is already showing, just update position and text smoothly
    if (this.showTooltip) {
      this.tooltipText = serverName;
      this.updateTooltipPosition(buttonRect);
    } else {
      // First time showing, set text and position then show
      this.tooltipText = serverName;
      this.showTooltip = true;
      
      setTimeout(() => {
        this.updateTooltipPosition(buttonRect);
      }, 0);
    }
  }

  hideServerTooltip() {
    this.showTooltip = false;
  }

  private updateTooltipPosition(buttonRect: DOMRect) {
    if (this.serverTooltip && this.serverTooltip.nativeElement) {
      const tooltipEl = this.serverTooltip.nativeElement;
      const buttonCenterY = buttonRect.top + (buttonRect.height / 2);
      
      // Position tooltip with proper offset from the button
      tooltipEl.style.left = `${buttonRect.right + 8}px`; // 8px gap from button right edge
      tooltipEl.style.top = `${buttonCenterY}px`;
      
      // Ensure tooltip doesn't go off-screen
      const tooltipRect = tooltipEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      
      if (buttonCenterY + (tooltipRect.height / 2) > viewportHeight) {
        tooltipEl.style.top = `${viewportHeight - tooltipRect.height - 10}px`;
      } else if (buttonCenterY - (tooltipRect.height / 2) < 10) {
        tooltipEl.style.top = `10px`;
      }
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