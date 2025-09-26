import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, signal, ViewChild, WritableSignal, ChangeDetectorRef } from '@angular/core';
import { FriendsSideBarComponent } from '../friends-side-bar-component/friends-side-bar-component';
import { combineLatest, interval, Subject, Subscription, takeUntil, switchMap, of, debounceTime } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { WebsocketService } from '../../services/websocket.service';
import { ActivatedRoute } from '@angular/router';
import { MessageComposer } from '../message-composer/message-composer';
import { UserPanelComponent } from '../user-panel-component/user-panel-component';
import { ToastrService } from 'ngx-toastr';
import { PaginatedMessage, UserDto } from '../../models/api.model';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessagesReadEvent } from '../../services/messages-read-event';
import { SendMessageEvent } from '../../services/send-message-event';

@Component({
  selector: 'app-dmchat-component',
  imports: [FriendsSideBarComponent, MessageComposer, UserPanelComponent, CommonModule, FormsModule],
  templateUrl: './dmchat-component.html',
  styleUrl: './dmchat-component.css'
})
export class DMChatComponent implements OnInit, OnDestroy, AfterViewInit {
  private destroy$ = new Subject<void>();
  private scrollSubject = new Subject<Event>();
  private heartbeatSub?: Subscription;
  public channelId = "";
  private cursor = "";
  public userId = "";
  private currentChannelId = "";
  private currentUserId = "";
  private isInitialLoad = true;
  
  public messages = signal<PaginatedMessage>({
    messages: [],
    nextCursor: "",
    hasMore: true
  });

  public user: WritableSignal<UserDto | null> = signal(null);
  public isLoadingMessages: WritableSignal<boolean> = signal(false);
  public isLoadingUser: WritableSignal<boolean> = signal(false);
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  constructor(
    private apiService: ApiService,
    private websocketService: WebsocketService,
    private activatedRoute: ActivatedRoute,
    private toastr: ToastrService,
    private messageRead: MessagesReadEvent,
    private cdr: ChangeDetectorRef,
    private sendMessageEvent:SendMessageEvent
  ) {}

  ngOnInit(): void {

    this.scrollSubject.pipe(
      debounceTime(100),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.checkScrollPosition();
    });

    this.websocketService.presence$
        .pipe(takeUntil(this.destroy$))
        .subscribe(()=>{
          this.loadUser();
        })

    this.websocketService.messages$
    .pipe(takeUntil(this.destroy$))
        .subscribe((message)=>{
          this.addNewMessage(message);
        })
    
    this.sendMessageEvent.messageSent$
    .pipe(takeUntil(this.destroy$))
        .subscribe((message)=>{
          this.addNewMessage(message);
        })

    combineLatest([
      this.activatedRoute.paramMap,
      this.activatedRoute.queryParamMap
    ])
    .pipe(
      takeUntil(this.destroy$),
      switchMap(([params, queryParams]) => {
        
        if (this.channelId) {
          this.websocketService.stopViewing(this.channelId);
          this.heartbeatSub?.unsubscribe();
        }

        this.channelId = params.get("channelId") ?? "";
        this.userId = queryParams.get("user") ?? "";
        this.cursor = "";
        this.currentChannelId = this.channelId;
        this.currentUserId = this.userId;
        this.isInitialLoad = true;

        this.messages.set({
          messages: [],
          nextCursor: "",
          hasMore: true
        });
        this.user.set(null);
        this.isLoadingMessages.set(!!this.channelId);
        this.isLoadingUser.set(!!this.userId);

        if (this.channelId) {
          this.websocketService.startViewing(this.channelId);
          this.heartbeatSub = interval(4 * 60 * 1000).subscribe(() => {
            this.websocketService.startViewing(this.channelId);
          });
        }

        return of(null);
      })
    )
    .subscribe(() => {
      if (this.channelId) {
        this.loadChat();
      }
      
      if (this.userId) {
        this.loadUser();
      }
    });
  }


  ngAfterViewInit(): void {
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.addEventListener('scroll', this.onScroll.bind(this));
    }
  }

 
  private deduplicate(messages: any[]): any[] {
    const seen = new Set();
    return messages.filter(msg => {
      const id = msg.id || msg.messageId;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  loadChat() {
    if (!this.channelId.trim()) return;
    const requestChannelId = this.channelId;
    this.isLoadingMessages.set(true);

    this.apiService.getChannelMessages(this.channelId, 20, this.cursor)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (requestChannelId === this.currentChannelId) {
            this.messages.update(state => {
              const combined = this.isInitialLoad
                ? response.data.messages 
                : [...state.messages, ...response.data.messages]; // append if reload

              return {
                messages: this.deduplicate(combined),
                hasMore: response.data.hasMore,
                nextCursor: response.data.nextCursor ?? null
              };
            });

            this.cursor = response.data.nextCursor ?? "";
            this.isLoadingMessages.set(false);
            this.messageRead.notifyMessageReadEvent();

            if (this.isInitialLoad) {
              setTimeout(() => {
                this.scrollToBottom();
                this.isInitialLoad = false;
              }, 100);
            }
          }
        },
        error: (err) => {
          this.toastr.error(err.error?.error || 'Failed to load messages');
          this.isLoadingMessages.set(false);
        }
      });
  }

  loadUser() {
    if (!this.userId.trim()) return;
    
    const requestUserId = this.userId;
    this.isLoadingUser.set(true);
    
    this.apiService.getUserProfile(this.userId)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (response) => {
        if (requestUserId === this.currentUserId) {
          this.user.set(response.data);
          this.isLoadingUser.set(false);
        }
      },
      error: (err) => {
        if (requestUserId === this.currentUserId) {
          this.toastr.error(err.error?.error || 'Failed to load user profile');
          this.isLoadingUser.set(false);
        }
      }
    });
  }

  onAvatarLoad() {}
  onAvatarError() {}
  onMessageAvatarError(event: any) {
    event.target.style.display = 'none';
  }

  ngOnDestroy(): void {
    if (this.channelId) {
      this.websocketService.stopViewing(this.channelId);
    }
    
    if (this.scrollContainer?.nativeElement) {
      this.scrollContainer.nativeElement.removeEventListener('scroll', this.onScroll.bind(this));
    }
    
    this.heartbeatSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadOlderMessages() {
    if (!this.channelId.trim() || 
        !this.messages().hasMore || 
        this.isLoadingMessages() ||
        !this.cursor) { 
      return;
    }
    
    const requestChannelId = this.channelId;
    this.isLoadingMessages.set(true);

    const container = this.scrollContainer.nativeElement;
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;

    this.apiService.getChannelMessages(this.channelId, 20, this.cursor)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (requestChannelId === this.currentChannelId) {
            this.messages.update(state => {
              const combined = [...response.data.messages, ...state.messages];
              return {
                hasMore: response.data.hasMore,
                nextCursor: response.data.nextCursor ?? null,
                messages: this.deduplicate(combined)
              };
            });
            
            this.cursor = response.data.nextCursor ?? "";
            this.isLoadingMessages.set(false);

            setTimeout(() => {
              const newScrollHeight = container.scrollHeight;
              const heightDifference = newScrollHeight - prevScrollHeight;
              container.scrollTop = prevScrollTop + heightDifference;
              this.cdr.detectChanges();
            }, 0);
          }
        },
        error: (err) => {
          console.error('Failed to load older messages:', err);
          this.toastr.error(err.error?.error || 'Failed to load messages');
          this.isLoadingMessages.set(false);
        }
      });
  }

  onScroll(event: Event) {
    this.scrollSubject.next(event);
  }

  private checkScrollPosition() {
    const container = this.scrollContainer?.nativeElement;
    if (!container) return;

    const scrollThreshold = 50;
    const isNearTop = container.scrollTop <= scrollThreshold;
    
    if (isNearTop && 
        this.messages()?.hasMore && 
        !this.isLoadingMessages() && 
        this.cursor) {
      console.log('Loading older messages - scrollTop:', container.scrollTop);
      this.loadOlderMessages();
    }
  }

  private scrollToBottom() {
    if (!this.scrollContainer?.nativeElement) return;
    const container = this.scrollContainer.nativeElement;
    container.scrollTop = container.scrollHeight;
  }

  addNewMessage(message: any) {
    this.messages.update(state => ({
      ...state,
      messages: this.deduplicate([...state.messages, message])
    }));

    this.cdr.detectChanges(); 

    setTimeout(() => {
      const container = this.scrollContainer?.nativeElement;
      if (container) {
        const isNearBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isNearBottom) {
          this.scrollToBottom();
        }
      }
    }, 0);
  }

  trackByMessageId(index: number, message: any): any {
    return message.id || message.messageId || index;
  }

  chatStatus(online: boolean): string {
    return online ? 'online' : 'offline';
  }

  isCodeBlock(text: string): boolean {
    return text.startsWith('```') && text.endsWith('```');
  }

}
