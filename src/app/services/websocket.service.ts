import { Injectable } from '@angular/core';
import { Client, IMessage, StompConfig, StompSubscription } from '@stomp/stompjs';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { 
  MessageDeletedEvent, 
  MessageDto, 
  NotificationDto, 
  PresenceMessage, 
  TypingMessage, 
  VideoControlEvent 
} from '../models/api.model';
import SockJS from 'sockjs-client';
import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

interface SyncCheckEvent {
  channelId: string;
  authoritativeTimestamp: number;
  isPlaying: boolean;
  serverTime: number;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  public stompClient: Client | null = null;
  private connectionStatus = new BehaviorSubject<boolean>(false);

  // === Scoped streams ===
  private channelMessageStreams = new Map<string, Subject<MessageDto>>();
  private channelTypingStreams = new Map<string, Subject<TypingMessage>>();
  private channelDeletionStreams = new Map<string, Subject<MessageDeletedEvent>>();
  private channelSubscriptions = new Map<string, StompSubscription[]>();

  private privateMessageStream = new Subject<MessageDto>();
  private privateDeletionStream = new Subject<MessageDeletedEvent>();

  private notificationsStream = new Subject<NotificationDto>();
  private generalMessages = new Subject<void>();

  private userPresenceStream = new Subject<PresenceMessage>();
  private serverPresenceStreams = new Map<string, Subject<PresenceMessage>>();
  private serverSubscriptions = new Map<string, StompSubscription>();

  // Room streams
  private roomControlStreams = new Map<string, Subject<VideoControlEvent>>();
  private roomSyncStreams = new Map<string, Subject<SyncCheckEvent>>();
  private roomSubscriptions = new Map<string, StompSubscription[]>();
  private roomResetStream = new Map<string, Subject<string>>();

  // === Public observables ===
  public connected$ = this.connectionStatus.asObservable();
  public privateMessages$ = this.privateMessageStream.asObservable();
  public privateDeletions$ = this.privateDeletionStream.asObservable();
  public notifications$ = this.notificationsStream.asObservable();
  public userPresence$ = this.userPresenceStream.asObservable();
  public generalMessages$ = this.generalMessages.asObservable();

  constructor(private authService: AuthService) {}

  async connect(): Promise<void> {
    if (this.stompClient?.connected) {
      return;
    }

    try {
      const token = await this.authService.getToken();
      console.log('Connecting WebSocket with token length:', token?.length);

      const stompConfig: StompConfig = {
        webSocketFactory: () => new SockJS(`${environment.wsUrl}`),
        connectHeaders: {
          Authorization: `Bearer ${token}`
        },
        debug: (str) => console.log('STOMP Debug:', str),
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        onConnect: (frame) => {
          console.log('WebSocket connected, frame:', frame);
          this.connectionStatus.next(true);
          this.subscribeToUserTopics();
        },
        onDisconnect: (frame) => {
          console.log('WebSocket disconnected, frame:', frame);
          this.connectionStatus.next(false);
        },
        onStompError: (frame) => {
          console.error('STOMP error:', frame);
          this.connectionStatus.next(false);
        }
      };

      this.stompClient = new Client(stompConfig);
      this.stompClient.activate();

    } catch (error) {
      console.error('WebSocket connection failed:', error);
    }
  }

  disconnect(): void {
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.connectionStatus.next(false);
    }
  }

  // === User-scoped subscriptions (private DM, notifications, presence) ===
  private subscribeToUserTopics(): void {
    if (!this.stompClient?.connected) return;

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      console.error('Current user not found, cannot subscribe to topics');
      return;
    }

    this.stompClient.subscribe(`/topic/user/${currentUser.id}/message`, (message: IMessage) => {
      const messageDto: MessageDto = JSON.parse(message.body);
      this.privateMessageStream.next(messageDto);
      this.generalMessages.next();
    });

    this.stompClient.subscribe('/queue/private/deletions', (message: IMessage) => {
      const deletedEvent: MessageDeletedEvent = JSON.parse(message.body);
      this.privateDeletionStream.next(deletedEvent);
    });

    this.stompClient.subscribe(`/topic/notifications/user/${currentUser.id}`, (message: IMessage) => {
      const notification: NotificationDto = JSON.parse(message.body);
      this.notificationsStream.next(notification);
    });

    this.stompClient.subscribe(`/topic/user/${currentUser.id}/presence`, (message: IMessage) => {
      const presence: PresenceMessage = JSON.parse(message.body);
      this.userPresenceStream.next(presence);
    });
  }

  // === Channel subscriptions ===
  subscribeToChannel(channelId: string): void {
    if (!this.stompClient?.connected) return;
    if (this.channelSubscriptions.has(channelId)) return;

    this.channelMessageStreams.set(channelId, new Subject<MessageDto>());
    this.channelTypingStreams.set(channelId, new Subject<TypingMessage>());
    this.channelDeletionStreams.set(channelId, new Subject<MessageDeletedEvent>());

    const subs: StompSubscription[] = [];

    subs.push(this.stompClient.subscribe(`/topic/channel/${channelId}/messages`, (msg: IMessage) => {
      this.channelMessageStreams.get(channelId)!.next(JSON.parse(msg.body));
    }));

    subs.push(this.stompClient.subscribe(`/topic/channel/${channelId}/deletions`, (msg: IMessage) => {
      this.channelDeletionStreams.get(channelId)!.next(JSON.parse(msg.body));
    }));

    subs.push(this.stompClient.subscribe(`/topic/channel/${channelId}/typing`, (msg: IMessage) => {
      this.channelTypingStreams.get(channelId)!.next(JSON.parse(msg.body));
    }));

    this.channelSubscriptions.set(channelId, subs);
  }

  unsubscribeFromChannel(channelId: string): void {
    this.channelSubscriptions.get(channelId)?.forEach((s) => s.unsubscribe());
    this.channelSubscriptions.delete(channelId);
    this.channelMessageStreams.delete(channelId);
    this.channelTypingStreams.delete(channelId);
    this.channelDeletionStreams.delete(channelId);
  }

  getChannelMessages(channelId: string): Observable<MessageDto> {
    return this.ensureStream(this.channelMessageStreams, channelId);
  }

  getChannelDeletions(channelId: string): Observable<MessageDeletedEvent> {
    return this.ensureStream(this.channelDeletionStreams, channelId);
  }

  getChannelTyping(channelId: string): Observable<TypingMessage> {
    return this.ensureStream(this.channelTypingStreams, channelId);
  }

  // === Room/Video subscriptions ===
  subscribeToRoom(roomId: string): void {
    if (!this.stompClient?.connected) {
      console.error('Cannot subscribe to room: WebSocket not connected');
      return;
    }
    
    if (this.roomSubscriptions.has(roomId)) {
      console.log('Already subscribed to room:', roomId);
      return;
    }

    console.log('Subscribing to room:', roomId);

    this.roomControlStreams.set(roomId, new Subject<VideoControlEvent>());
    this.roomSyncStreams.set(roomId, new Subject<SyncCheckEvent>());

    const subs: StompSubscription[] = [];

    // Subscribe to video control events
    subs.push(this.stompClient.subscribe(`/topic/room/${roomId}`, (msg: IMessage) => {
      const event: VideoControlEvent = JSON.parse(msg.body);
      console.log('Received room control event:', event);
      this.roomControlStreams.get(roomId)!.next(event);
    }));

    // Subscribe to sync check events from server
    subs.push(this.stompClient.subscribe(`/topic/room/${roomId}/sync`, (msg: IMessage) => {
      const syncEvent: SyncCheckEvent = JSON.parse(msg.body);
      console.log('Received sync check event:', syncEvent);
      this.roomSyncStreams.get(roomId)!.next(syncEvent);
    }));

    // reset room
    subs.push(this.stompClient.subscribe(`/topic/room/${roomId}/reset`, (msg: IMessage) => {
      this.roomResetStream.get(roomId)!.next("reset");
    }));

    this.roomSubscriptions.set(roomId, subs);
    console.log('Successfully subscribed to room:', roomId);
  }

  unsubscribeFromRoom(roomId: string): void {
    console.log('Unsubscribing from room:', roomId);
    
    this.roomSubscriptions.get(roomId)?.forEach((s) => s.unsubscribe());
    this.roomSubscriptions.delete(roomId);
    this.roomControlStreams.delete(roomId);
    this.roomSyncStreams.delete(roomId);
  }

  getRoomControlEvents(roomId: string): Observable<VideoControlEvent> {
    return this.ensureStream(this.roomControlStreams, roomId);
  }

  getRoomResetEvent(roomId: string): Observable<string> {
    return this.ensureStream(this.roomResetStream, roomId);
  }

  getRoomSyncEvents(roomId: string): Observable<SyncCheckEvent> {
    return this.ensureStream(this.roomSyncStreams, roomId);
  }

  broadcastSyncRoomEvent(event: VideoControlEvent,roomId: string){
    if (!this.stompClient?.connected) return;
    this.stompClient.publish({
      destination: `/app/room/${roomId}/sync`,
      body: JSON.stringify({ event })
    });
  }

  // === Server presence ===
  subscribeToServerPresence(serverId: string): void {
    if (!this.stompClient?.connected) return;
    if (this.serverSubscriptions.has(serverId)) return;

    this.serverPresenceStreams.set(serverId, new Subject<PresenceMessage>());
    const sub = this.stompClient.subscribe(`/topic/server.${serverId}.presence`, (msg: IMessage) => {
      this.serverPresenceStreams.get(serverId)!.next(JSON.parse(msg.body));
    });

    this.serverSubscriptions.set(serverId, sub);
  }

  unsubscribeFromServerPresence(serverId: string): void {
    this.serverSubscriptions.get(serverId)?.unsubscribe();
    this.serverSubscriptions.delete(serverId);
    this.serverPresenceStreams.delete(serverId);
  }

  getServerPresence(serverId: string): Observable<PresenceMessage> {
    return this.ensureStream(this.serverPresenceStreams, serverId);
  }

  // === Actions ===
  sendTypingIndicator(channelId: string, isTyping: boolean): void {
    if (!this.stompClient?.connected) return;
    this.stompClient.publish({
      destination: '/app/typing',
      body: JSON.stringify({ channelId, isTyping })
    });
  }

  broadcastPresence(status: 'ONLINE' | 'OFFLINE'): void {
    if (!this.stompClient?.connected) return;
    this.stompClient.publish({
      destination: '/app/presence',
      body: JSON.stringify({ status })
    });
  }

  startViewing(channelId: string): void {
    if (!this.stompClient?.connected) return;
    this.stompClient.publish({
      destination: '/app/channel/view/start',
      body: JSON.stringify({ channelId }),
    });
  }

  stopViewing(channelId: string): void {
    if (!this.stompClient?.connected) return;
    this.stompClient.publish({
      destination: '/app/channel/view/end',
      body: JSON.stringify({ channelId }),
    });
  }

  // === Helper ===
  private ensureStream<T>(map: Map<string, Subject<T>>, key: string): Observable<T> {
    if (!map.has(key)) {
      map.set(key, new Subject<T>());
    }
    return map.get(key)!.asObservable();
  }

  // === Connection status ===
  isConnected(): boolean {
    return this.stompClient?.connected || false;
  }
}